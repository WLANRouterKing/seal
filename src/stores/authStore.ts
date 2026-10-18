import { create } from 'zustand'
import type { NostrKeys } from '../types'
import {
  loadKeys,
  saveKeys,
  loadSettings,
  saveSettings,
  isEncryptedKeys,
  migrateToEncrypted,
  clearAllData,
  type EncryptedKeys,
} from '../services/db'
import { generateKeyPair, keysFromNsec } from '../services/keys'
import { setEncryptionKey, clearEncryptionKey } from '../services/encryptionKeyManager'
import { checkRateLimit, recordFailedAttempt, resetRateLimit } from '../services/rateLimiter'
import { biometricsService } from '../services/biometrics'
import {
  generateMasterKey,
  createPasswordSlot,
  unlockWithPasswordSlot,
  deriveDatabaseKey,
  encryptWithMasterKey,
  decryptWithMasterKey,
  generateSalt,
} from '../services/masterKey'

interface AuthState {
  keys: NostrKeys | null
  isLocked: boolean
  isLoading: boolean
  isInitialized: boolean
  hasPassword: boolean
  setupComplete: boolean
  hideIdentity: boolean
  publicInfo: { npub: string } | null
  error: string | null
  lockoutUntil: number | null
  failedAttempts: number

  // Biometrics
  biometricsAvailable: boolean
  biometricsEnabled: boolean
  biometricType: 'none' | 'fingerprint' | 'face' | 'iris' | 'webauthn'

  // Actions
  initialize: () => Promise<void>
  createKeys: (password?: string) => Promise<NostrKeys>
  importKeys: (nsec: string, password?: string) => Promise<boolean>
  unlock: (password: string) => Promise<boolean>
  unlockWithBiometrics: () => Promise<boolean>
  lock: () => void
  logout: () => Promise<void>
  clearError: () => void
  setPassword: (password: string) => Promise<boolean>
  completeSetup: () => Promise<void>
  setHideIdentity: (hide: boolean, password: string) => Promise<boolean>
  refreshLockoutStatus: () => Promise<void>
  checkBiometrics: () => Promise<void>
  enableBiometrics: (password: string) => Promise<boolean>
  disableBiometrics: () => Promise<void>
}

// Helper to convert Uint8Array to base64
function uint8ArrayToBase64(array: Uint8Array): string {
  return btoa(String.fromCharCode(...array))
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export const useAuthStore = create<AuthState>((set, get) => ({
  keys: null,
  isLocked: false,
  isLoading: true,
  isInitialized: false,
  hasPassword: false,
  setupComplete: true,
  hideIdentity: true, // Default to hiding identity for privacy
  publicInfo: null,
  error: null,
  lockoutUntil: null,
  failedAttempts: 0,

  biometricsAvailable: false,
  biometricsEnabled: false,
  biometricType: 'none',

  initialize: async () => {
    try {
      console.log('[Auth] Starting initialize...')
      console.log('[Auth] Loading keys and settings...')
      const [storedKeys, settings] = await Promise.all([loadKeys(), loadSettings()])
      const setupComplete = settings?.setupComplete !== false

      if (!storedKeys) {
        console.log('[Auth] No stored keys, setting initialized')
        set({ isLoading: false, isInitialized: true, setupComplete: true, hideIdentity: false })
        return
      }

      if (isEncryptedKeys(storedKeys)) {
        // Retire insecure legacy biometric slots without changing the password slot.
        // Removing a slot cannot revoke copies of previously exposed key material.
        if (storedKeys.slots?.some((slot) => slot.type === 'passkey' && !slot.prf)) {
          if (!storedKeys.slots.some((slot) => slot.type === 'password')) {
            throw new Error('Password recovery required before retiring biometric slots')
          }
          await saveKeys({
            ...storedKeys,
            slots: storedKeys.slots.filter((slot) => slot.type === 'password' || slot.prf?.version === 1),
          })
          biometricsService.clearBiometricData()
        }
        const identityHidden = storedKeys.identityHidden === true
        const npub = storedKeys.npub

        set({
          isLocked: true,
          hasPassword: true,
          setupComplete,
          hideIdentity: identityHidden,
          publicInfo: identityHidden ? null : npub ? { npub } : null,
          isLoading: false,
          isInitialized: true,
        })
      } else {
        set({
          keys: storedKeys,
          hasPassword: false,
          hideIdentity: false,
          setupComplete: false,
          isLoading: false,
          isInitialized: true,
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
      if (password !== undefined && (password.length < 12 || !password.trim()))
        throw new Error('Password must have at least 12 characters')
      const keys = generateKeyPair()
      await saveSettings({ setupComplete: false })

      if (password) {
        // Generate master key and create password slot
        const masterKey = generateMasterKey()
        const dbSalt = generateSalt()
        const passwordSlot = await createPasswordSlot(masterKey, password)

        // Encrypt nsec with master key
        const encryptedNsec = await encryptWithMasterKey(keys.nsec, masterKey)

        const encryptedKeys: EncryptedKeys = {
          _v: 2,
          encryptedNsec,
          slots: [passwordSlot],
          dbSalt: uint8ArrayToBase64(dbSalt),
          // npub not stored by default for privacy (hideIdentity=true)
          identityHidden: true,
        }

        await saveKeys(encryptedKeys)
        setEncryptionKey(await deriveDatabaseKey(masterKey, dbSalt), dbSalt)
        await migrateToEncrypted()
        set({ keys, hasPassword: true, hideIdentity: true, setupComplete: false, isLoading: false })
      } else {
        // Pending identity stays in memory until password protection is established.
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
      if (password !== undefined && (password.length < 12 || !password.trim()))
        throw new Error('Password must have at least 12 characters')
      const keys = keysFromNsec(nsec)
      if (!keys) {
        set({ isLoading: false, error: 'Invalid nsec format' })
        return false
      }

      await saveSettings({ setupComplete: Boolean(password) })

      if (password) {
        const masterKey = generateMasterKey()
        const dbSalt = generateSalt()
        const passwordSlot = await createPasswordSlot(masterKey, password)
        const encryptedNsec = await encryptWithMasterKey(keys.nsec, masterKey)

        const encryptedKeys: EncryptedKeys = {
          _v: 2,
          encryptedNsec,
          slots: [passwordSlot],
          dbSalt: uint8ArrayToBase64(dbSalt),
          // npub not stored by default for privacy (hideIdentity=true)
          identityHidden: true,
        }

        await saveKeys(encryptedKeys)
        setEncryptionKey(await deriveDatabaseKey(masterKey, dbSalt), dbSalt)
        await migrateToEncrypted()
        set({ keys, hasPassword: true, hideIdentity: true, setupComplete: true, isLoading: false })
      } else {
        // Pending identity stays in memory until password protection is established.
        set({ keys, hasPassword: false, setupComplete: false, isLoading: false })
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
      const rateLimitCheck = await checkRateLimit()
      if (!rateLimitCheck.allowed) {
        set({
          isLoading: false,
          lockoutUntil: Date.now() + rateLimitCheck.remainingMs,
          failedAttempts: rateLimitCheck.attempts,
        })
        return false
      }

      const storedKeys = await loadKeys()
      if (!storedKeys || !isEncryptedKeys(storedKeys)) {
        set({ isLoading: false, error: 'No encrypted keys found' })
        return false
      }

      let masterKey: Uint8Array | null = null
      let nsec: string | null = null

      const passwordSlot = storedKeys.slots.find((s) => s.type === 'password')
      if (!passwordSlot) {
        set({ isLoading: false, error: 'No password slot found' })
        return false
      }

      masterKey = await unlockWithPasswordSlot(passwordSlot, password)
      if (!masterKey) {
        const result = await recordFailedAttempt()
        set({
          isLoading: false,
          error: 'Incorrect password',
          failedAttempts: result.attempts,
          lockoutUntil: result.remainingMs > 0 ? Date.now() + result.remainingMs : null,
        })
        return false
      }

      nsec = await decryptWithMasterKey(storedKeys.encryptedNsec, masterKey)
      const dbSalt = base64ToUint8Array(storedKeys.dbSalt)

      if (!nsec) {
        set({ isLoading: false, error: 'Failed to decrypt keys' })
        return false
      }

      await resetRateLimit()

      const keys = keysFromNsec(nsec)
      if (!keys) {
        set({ isLoading: false, error: 'Invalid stored key' })
        return false
      }

      // Derive DB key from master key
      const dbKey = await deriveDatabaseKey(masterKey!, dbSalt!)
      setEncryptionKey(dbKey, dbSalt!)

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
      clearEncryptionKey()
      set({
        keys: null,
        isLocked: true,
        publicInfo: hideIdentity ? null : { npub: keys.npub },
      })
    }
  },

  logout: async () => {
    set({ isLoading: true })
    try {
      clearEncryptionKey()
      biometricsService.clearBiometricData()
      await clearAllData()
      window.location.reload()
    } catch (error) {
      console.error('Failed to logout:', error)
      set({ isLoading: false, error: 'Failed to logout' })
    }
  },

  setPassword: async (password: string) => {
    const { keys, hideIdentity, hasPassword } = get()
    if (password.length < 12 || !password.trim()) return false
    if (hasPassword) return false // Replacing a live master key would orphan existing ciphertext.
    if (!keys) {
      console.error('setPassword: No keys available')
      return false
    }

    try {
      console.log('setPassword: Generating master key...')
      const masterKey = generateMasterKey()

      console.log('setPassword: Generating salt...')
      const dbSalt = generateSalt()

      console.log('setPassword: Creating password slot...')
      const passwordSlot = await createPasswordSlot(masterKey, password)

      console.log('setPassword: Encrypting nsec...')
      const encryptedNsec = await encryptWithMasterKey(keys.nsec, masterKey)

      console.log('setPassword: Deriving DB key...')
      const dbKey = await deriveDatabaseKey(masterKey, dbSalt)
      setEncryptionKey(dbKey, dbSalt)

      console.log('setPassword: Migrating to encrypted...')
      await migrateToEncrypted()

      const encryptedKeys: EncryptedKeys = {
        _v: 2,
        encryptedNsec,
        slots: [passwordSlot],
        dbSalt: uint8ArrayToBase64(dbSalt),
        npub: hideIdentity ? undefined : keys.npub,
        identityHidden: hideIdentity || undefined,
      }

      console.log('setPassword: Saving keys...')
      await saveKeys(encryptedKeys)
      set({ hasPassword: true })
      console.log('setPassword: Success!')
      return true
    } catch (error) {
      console.error('Failed to set password:', error)
      return false
    }
  },

  clearError: () => set({ error: null }),

  completeSetup: async () => {
    if (!get().hasPassword) throw new Error('Password protection is required')
    await saveSettings({ setupComplete: true })
    set({ setupComplete: true })
  },

  setHideIdentity: async (hide: boolean, password: string) => {
    const { keys, hasPassword } = get()
    if (!keys || !hasPassword) return false

    try {
      const storedKeys = await loadKeys()
      if (!storedKeys || !isEncryptedKeys(storedKeys)) return false

      const passwordSlot = storedKeys.slots.find((s) => s.type === 'password')
      if (!passwordSlot) return false

      const masterKey = await unlockWithPasswordSlot(passwordSlot, password)
      if (!masterKey) return false

      // Update the stored keys with new identity setting
      const updatedKeys: EncryptedKeys = {
        ...storedKeys,
        npub: hide ? undefined : keys.npub,
        identityHidden: hide || undefined,
      }

      await saveKeys(updatedKeys)
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
        failedAttempts: result.attempts,
      })
    } else {
      set({
        lockoutUntil: null,
        failedAttempts: result.attempts,
      })
    }
  },

  checkBiometrics: async () => {
    const availability = await biometricsService.checkAvailability()
    const stored = await loadKeys()
    set({
      biometricsAvailable: availability.available,
      biometricType: availability.type,
      biometricsEnabled:
        availability.available &&
        !!stored &&
        isEncryptedKeys(stored) &&
        stored.slots.some((slot) => slot.type === 'passkey' && slot.prf?.version === 1),
    })
  },

  enableBiometrics: async (password: string) => {
    const identity = get().keys
    if (!identity || !get().hasPassword) return false
    let masterKey: Uint8Array | null = null
    try {
      const stored = await loadKeys()
      if (!stored || !isEncryptedKeys(stored)) return false
      const slot = stored.slots.find((s) => s.type === 'password')
      if (!slot || !(await checkRateLimit()).allowed) return false
      masterKey = await unlockWithPasswordSlot(slot, password)
      if (!masterKey) {
        await recordFailedAttempt()
        return false
      }
      const passkey = await biometricsService.enroll(masterKey)
      if (get().keys !== identity || get().isLocked) return false
      await saveKeys({ ...stored, slots: [...stored.slots.filter((s) => s.type === 'password'), passkey] })
      await resetRateLimit()
      set({ biometricsEnabled: true, error: null })
      return true
    } catch {
      set({ error: 'Secure passkey enrollment failed. Use your password.' })
      return false
    } finally {
      masterKey?.fill(0)
    }
  },

  disableBiometrics: async () => {
    const storedKeys = await loadKeys()
    if (storedKeys && isEncryptedKeys(storedKeys)) {
      if (!storedKeys.slots.some((slot) => slot.type === 'password')) {
        throw new Error('Cannot remove the only unlock method')
      }
      await saveKeys({ ...storedKeys, slots: storedKeys.slots.filter((slot) => slot.type === 'password') })
    }
    biometricsService.clearBiometricData()
    set({ biometricsEnabled: false })
  },

  unlockWithBiometrics: async () => {
    if (!get().isLocked) return false
    set({ isLoading: true, error: null })
    let masterKey: Uint8Array | null = null
    try {
      const stored = await loadKeys()
      if (!stored || !isEncryptedKeys(stored)) throw new Error('No vault')
      const slot = stored.slots.find((s) => s.type === 'passkey' && s.prf?.version === 1)
      if (!slot) throw new Error('No PRF slot')
      masterKey = await biometricsService.unlock(slot)
      if (!masterKey) throw new Error('Unlock failed')
      const nsec = await decryptWithMasterKey(stored.encryptedNsec, masterKey)
      const keys = nsec ? keysFromNsec(nsec) : null
      if (!keys) throw new Error('Invalid identity')
      const salt = base64ToUint8Array(stored.dbSalt)
      setEncryptionKey(await deriveDatabaseKey(masterKey, salt), salt)
      await migrateToEncrypted()
      set({ keys, isLocked: false, isLoading: false, error: null })
      return true
    } catch {
      clearEncryptionKey()
      set({ isLoading: false, error: 'Passkey unlock failed or cancelled. Use your password.' })
      return false
    } finally {
      masterKey?.fill(0)
    }
  },
}))
