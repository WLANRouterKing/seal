import { create } from 'zustand'
import type { NostrKeys } from '../types'
import { loadKeys, saveKeys, loadSettings, saveSettings, isEncryptedKeys, migrateToEncrypted, migrateToDecrypted, clearAllData, type EncryptedKeys } from '../services/db'
import { generateKeyPair, keysFromNsec } from '../services/keys'
import { encryptWithPassword, decryptWithPassword, deriveKey, generateSalt } from '../services/encryption'
import { setEncryptionKey, clearEncryptionKey } from '../services/encryptionKeyManager'
import { checkRateLimit, recordFailedAttempt, resetRateLimit } from '../services/rateLimiter'

interface AuthState {
  keys: NostrKeys | null
  isLocked: boolean
  isLoading: boolean
  isInitialized: boolean
  hasPassword: boolean
  setupComplete: boolean
  hideIdentity: boolean
  publicInfo: { publicKey: string; npub: string } | null
  error: string | null
  lockoutUntil: number | null
  failedAttempts: number

  // Actions
  initialize: () => Promise<void>
  createKeys: (password?: string) => Promise<NostrKeys>
  importKeys: (nsec: string, password?: string) => Promise<boolean>
  unlock: (password: string) => Promise<boolean>
  lock: () => void
  logout: () => Promise<void>
  clearError: () => void
  setPassword: (password: string) => Promise<boolean>
  removePassword: (currentPassword: string) => Promise<boolean>
  completeSetup: () => Promise<void>
  setHideIdentity: (hide: boolean, password: string) => Promise<boolean>
  refreshLockoutStatus: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  keys: null,
  isLocked: false,
  isLoading: true,
  isInitialized: false,
  hasPassword: false,
  setupComplete: true, // Default true, will be set to false for new accounts
  hideIdentity: false,
  publicInfo: null,
  error: null,
  lockoutUntil: null,
  failedAttempts: 0,

  initialize: async () => {
    try {
      const [storedKeys, settings] = await Promise.all([loadKeys(), loadSettings()])

      // Default to true for existing accounts (before this feature was added)
      // Only new accounts created via createKeys will have setupComplete: false
      const setupComplete = settings?.setupComplete !== false

      if (!storedKeys) {
        set({ isLoading: false, isInitialized: true, setupComplete: true, hideIdentity: false })
        return
      }

      if (isEncryptedKeys(storedKeys)) {
        // Keys are encrypted - need password to unlock
        const identityHidden = storedKeys.identityHidden === true
        set({
          isLocked: true,
          hasPassword: true,
          setupComplete,
          hideIdentity: identityHidden,
          // Only show publicInfo if identity is not hidden
          publicInfo: identityHidden ? null : { publicKey: storedKeys.publicKey!, npub: storedKeys.npub! },
          isLoading: false,
          isInitialized: true
        })
      } else {
        // Keys not encrypted - load directly
        set({
          keys: storedKeys,
          hasPassword: false,
          hideIdentity: false,
          setupComplete,
          isLoading: false,
          isInitialized: true
        })
      }
    } catch (error) {
      console.error('Failed to initialize auth:', error)
      set({ isLoading: false, isInitialized: true, error: 'Failed to load keys' })
    }
  },

  createKeys: async (password?: string) => {
    set({ isLoading: true, error: null })
    try {
      const keys = generateKeyPair()

      // Mark setup as incomplete for new accounts (show password setup screen)
      await saveSettings({ setupComplete: false })

      if (password) {
        // Encrypt and save
        const encrypted = await encryptWithPassword(
          JSON.stringify({ privateKey: keys.privateKey, nsec: keys.nsec }),
          password
        )
        const encryptedKeys: EncryptedKeys = {
          _e: 1,
          d: encrypted,
          publicKey: keys.publicKey,
          npub: keys.npub
        }
        await saveKeys(encryptedKeys)
        set({ keys, hasPassword: true, setupComplete: false, isLoading: false })
      } else {
        await saveKeys(keys)
        set({ keys, hasPassword: false, setupComplete: false, isLoading: false })
      }

      return keys
    } catch (error) {
      console.error('Failed to create keys:', error)
      set({ isLoading: false, error: 'Failed to create keys' })
      throw error
    }
  },

  importKeys: async (nsec: string, password?: string) => {
    set({ isLoading: true, error: null })
    try {
      const keys = keysFromNsec(nsec)
      if (!keys) {
        set({ isLoading: false, error: 'Invalid nsec format' })
        return false
      }

      if (password) {
        const encrypted = await encryptWithPassword(
          JSON.stringify({ privateKey: keys.privateKey, nsec: keys.nsec }),
          password
        )
        const encryptedKeys: EncryptedKeys = {
          _e: 1,
          d: encrypted,
          publicKey: keys.publicKey,
          npub: keys.npub
        }
        await saveKeys(encryptedKeys)
        set({ keys, hasPassword: true, isLoading: false })
      } else {
        await saveKeys(keys)
        set({ keys, hasPassword: false, isLoading: false })
      }

      return true
    } catch (error) {
      console.error('Failed to import keys:', error)
      set({ isLoading: false, error: 'Failed to import keys' })
      return false
    }
  },

  unlock: async (password: string) => {
    set({ isLoading: true, error: null })

    try {
      // Check rate limit first
      const rateLimitCheck = await checkRateLimit()
      if (!rateLimitCheck.allowed) {
        set({
          isLoading: false,
          lockoutUntil: Date.now() + rateLimitCheck.remainingMs,
          failedAttempts: rateLimitCheck.attempts
        })
        return false
      }

      const storedKeys = await loadKeys()
      if (!storedKeys || !isEncryptedKeys(storedKeys)) {
        set({ isLoading: false, error: 'No encrypted keys found' })
        return false
      }

      const decrypted = await decryptWithPassword(storedKeys.d, password)
      if (!decrypted) {
        // Record failed attempt
        const result = await recordFailedAttempt()
        set({
          isLoading: false,
          error: 'Incorrect password',
          failedAttempts: result.attempts,
          lockoutUntil: result.remainingMs > 0 ? Date.now() + result.remainingMs : null
        })
        return false
      }

      // Success - reset rate limit
      await resetRateLimit()

      const decryptedData = JSON.parse(decrypted)
      let keys: NostrKeys

      if (storedKeys.identityHidden) {
        // All keys are in the encrypted blob
        keys = {
          privateKey: decryptedData.privateKey,
          nsec: decryptedData.nsec,
          publicKey: decryptedData.publicKey,
          npub: decryptedData.npub
        }
      } else {
        // publicKey and npub are stored separately
        keys = {
          privateKey: decryptedData.privateKey,
          nsec: decryptedData.nsec,
          publicKey: storedKeys.publicKey!,
          npub: storedKeys.npub!
        }
      }

      // Set up DB encryption key
      let dbSalt: Uint8Array
      if (storedKeys.dbSalt) {
        // Use existing salt
        dbSalt = Uint8Array.from(atob(storedKeys.dbSalt), c => c.charCodeAt(0))
      } else {
        // Generate new salt for first-time encryption
        dbSalt = generateSalt()
        // Save the salt
        const updatedKeys: EncryptedKeys = {
          ...storedKeys,
          dbSalt: btoa(String.fromCharCode(...dbSalt))
        }
        await saveKeys(updatedKeys)
      }

      const dbKey = await deriveKey(password, dbSalt)
      setEncryptionKey(dbKey, dbSalt)

      // Migrate unencrypted data if any
      await migrateToEncrypted()

      set({ keys, isLocked: false, isLoading: false, error: null, lockoutUntil: null, failedAttempts: 0 })
      return true
    } catch (error) {
      console.error('Failed to unlock:', error)
      set({ isLoading: false, error: 'Failed to unlock' })
      return false
    }
  },

  lock: () => {
    const { hasPassword, keys, hideIdentity } = get()
    if (hasPassword && keys) {
      // Clear DB encryption key
      clearEncryptionKey()
      set({
        keys: null,
        isLocked: true,
        // Only store publicInfo if identity is not hidden
        publicInfo: hideIdentity ? null : { publicKey: keys.publicKey, npub: keys.npub }
      })
    }
  },

  logout: async () => {
    set({ isLoading: true })
    try {
      // Clear encryption key from memory
      clearEncryptionKey()

      // Delete all data from IndexedDB
      await clearAllData()

      // Force page reload to reset all in-memory state
      window.location.reload()
    } catch (error) {
      console.error('Failed to logout:', error)
      set({ isLoading: false, error: 'Failed to logout' })
    }
  },

  setPassword: async (password: string) => {
    const { keys, hideIdentity } = get()
    if (!keys) return false

    try {
      // Generate salt for DB encryption
      const dbSalt = generateSalt()

      // Derive and set DB encryption key
      const dbKey = await deriveKey(password, dbSalt)
      setEncryptionKey(dbKey, dbSalt)

      // Migrate existing data to encrypted format
      await migrateToEncrypted()

      // Encrypt keys - include publicKey/npub if hideIdentity is enabled
      const dataToEncrypt = hideIdentity
        ? { privateKey: keys.privateKey, nsec: keys.nsec, publicKey: keys.publicKey, npub: keys.npub }
        : { privateKey: keys.privateKey, nsec: keys.nsec }

      const encrypted = await encryptWithPassword(JSON.stringify(dataToEncrypt), password)

      const encryptedKeys: EncryptedKeys = hideIdentity
        ? {
            _e: 1,
            d: encrypted,
            dbSalt: btoa(String.fromCharCode(...dbSalt)),
            identityHidden: true
          }
        : {
            _e: 1,
            d: encrypted,
            publicKey: keys.publicKey,
            npub: keys.npub,
            dbSalt: btoa(String.fromCharCode(...dbSalt))
          }

      await saveKeys(encryptedKeys)
      set({ hasPassword: true })
      return true
    } catch (error) {
      console.error('Failed to set password:', error)
      return false
    }
  },

  removePassword: async (currentPassword: string) => {
    const { keys, hasPassword } = get()
    if (!keys || !hasPassword) return false

    try {
      // Verify current password first
      const storedKeys = await loadKeys()
      if (!storedKeys || !isEncryptedKeys(storedKeys)) return false

      const decrypted = await decryptWithPassword(storedKeys.d, currentPassword)
      if (!decrypted) return false

      // Migrate all data back to unencrypted format (while we still have the key)
      await migrateToDecrypted()

      // Clear DB encryption key
      clearEncryptionKey()

      // Save unencrypted keys
      await saveKeys(keys)
      set({ hasPassword: false })
      return true
    } catch (error) {
      console.error('Failed to remove password:', error)
      return false
    }
  },

  clearError: () => set({ error: null }),

  completeSetup: async () => {
    await saveSettings({ setupComplete: true })
    set({ setupComplete: true })
  },

  setHideIdentity: async (hide: boolean, password: string) => {
    const { keys, hasPassword } = get()
    if (!keys || !hasPassword) return false

    try {
      // Verify password first
      const storedKeys = await loadKeys()
      if (!storedKeys || !isEncryptedKeys(storedKeys)) return false

      const decrypted = await decryptWithPassword(storedKeys.d, password)
      if (!decrypted) return false

      // Re-encrypt with new identity setting
      const dataToEncrypt = hide
        ? { privateKey: keys.privateKey, nsec: keys.nsec, publicKey: keys.publicKey, npub: keys.npub }
        : { privateKey: keys.privateKey, nsec: keys.nsec }

      const encrypted = await encryptWithPassword(JSON.stringify(dataToEncrypt), password)

      const encryptedKeys: EncryptedKeys = hide
        ? {
            _e: 1,
            d: encrypted,
            dbSalt: storedKeys.dbSalt,
            identityHidden: true
          }
        : {
            _e: 1,
            d: encrypted,
            publicKey: keys.publicKey,
            npub: keys.npub,
            dbSalt: storedKeys.dbSalt
          }

      await saveKeys(encryptedKeys)
      await saveSettings({ hideIdentity: hide })
      set({ hideIdentity: hide })
      return true
    } catch (error) {
      console.error('Failed to set hide identity:', error)
      return false
    }
  },

  refreshLockoutStatus: async () => {
    const result = await checkRateLimit()
    if (!result.allowed) {
      set({
        lockoutUntil: Date.now() + result.remainingMs,
        failedAttempts: result.attempts
      })
    } else {
      set({
        lockoutUntil: null,
        failedAttempts: result.attempts
      })
    }
  }
}))
