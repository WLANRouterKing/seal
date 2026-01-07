import { create } from 'zustand'
import type { NostrKeys } from '../types'
import {
  loadKeys,
  saveKeys,
  loadSettings,
  saveSettings,
  isEncryptedKeys,
  isEncryptedKeysV2,
  isEncryptedKeysV1,
  migrateToEncrypted,
  migrateToDecrypted,
  clearAllData,
  type EncryptedKeysV2,
  type EncryptedKeysV1
} from '../services/db'
import { generateKeyPair, keysFromNsec } from '../services/keys'
import { decryptWithPassword } from '../services/encryption'
import { setEncryptionKey, clearEncryptionKey } from '../services/encryptionKeyManager'
import { checkRateLimit, recordFailedAttempt, resetRateLimit } from '../services/rateLimiter'
import { biometricsService } from '../services/biometrics'
import {
  generateMasterKey,
  createPasswordSlot,
  createPasskeySlot,
  unlockWithPasswordSlot,
  unlockWithPasskeySlot,
  deriveDatabaseKey,
  encryptWithMasterKey,
  decryptWithMasterKey,
  generateSalt
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
  removePassword: (currentPassword: string) => Promise<boolean>
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
  hideIdentity: true,  // Default to hiding identity for privacy
  publicInfo: null,
  error: null,
  lockoutUntil: null,
  failedAttempts: 0,

  biometricsAvailable: false,
  biometricsEnabled: false,
  biometricType: 'none',

  initialize: async () => {
    try {
      const [storedKeys, settings] = await Promise.all([loadKeys(), loadSettings()])
      const setupComplete = settings?.setupComplete !== false

      if (!storedKeys) {
        set({ isLoading: false, isInitialized: true, setupComplete: true, hideIdentity: false })
        return
      }

      if (isEncryptedKeys(storedKeys)) {
        const identityHidden = storedKeys.identityHidden === true
        const npub = isEncryptedKeysV2(storedKeys) ? storedKeys.npub : (storedKeys as EncryptedKeysV1).npub

        set({
          isLocked: true,
          hasPassword: true,
          setupComplete,
          hideIdentity: identityHidden,
          publicInfo: identityHidden ? null : (npub ? { npub } : null),
          isLoading: false,
          isInitialized: true
        })
      } else {
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
      await saveSettings({ setupComplete: false })

      if (password) {
        // Generate master key and create password slot
        const masterKey = generateMasterKey()
        const dbSalt = generateSalt()
        const passwordSlot = await createPasswordSlot(masterKey, password)

        // Encrypt nsec with master key
        const encryptedNsec = await encryptWithMasterKey(keys.nsec, masterKey)

        const encryptedKeys: EncryptedKeysV2 = {
          _v: 2,
          encryptedNsec,
          slots: [passwordSlot],
          dbSalt: uint8ArrayToBase64(dbSalt),
          // npub not stored by default for privacy (hideIdentity=true)
          identityHidden: true
        }

        await saveKeys(encryptedKeys)
        set({ keys, hasPassword: true, hideIdentity: true, setupComplete: false, isLoading: false })
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
        const masterKey = generateMasterKey()
        const dbSalt = generateSalt()
        const passwordSlot = await createPasswordSlot(masterKey, password)
        const encryptedNsec = await encryptWithMasterKey(keys.nsec, masterKey)

        const encryptedKeys: EncryptedKeysV2 = {
          _v: 2,
          encryptedNsec,
          slots: [passwordSlot],
          dbSalt: uint8ArrayToBase64(dbSalt),
          // npub not stored by default for privacy (hideIdentity=true)
          identityHidden: true
        }

        await saveKeys(encryptedKeys)
        set({ keys, hasPassword: true, hideIdentity: true, isLoading: false })
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

      let masterKey: Uint8Array | null = null
      let nsec: string | null = null
      let dbSalt: Uint8Array

      // Handle V2 format (master key slots)
      if (isEncryptedKeysV2(storedKeys)) {
        const passwordSlot = storedKeys.slots.find(s => s.type === 'password')
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
            lockoutUntil: result.remainingMs > 0 ? Date.now() + result.remainingMs : null
          })
          return false
        }

        nsec = await decryptWithMasterKey(storedKeys.encryptedNsec, masterKey)
        dbSalt = base64ToUint8Array(storedKeys.dbSalt)
      }
      // Handle V1 format (legacy - migrate to V2)
      else if (isEncryptedKeysV1(storedKeys)) {
        const decrypted = await decryptWithPassword(storedKeys.d, password)
        if (!decrypted) {
          const result = await recordFailedAttempt()
          set({
            isLoading: false,
            error: 'Incorrect password',
            failedAttempts: result.attempts,
            lockoutUntil: result.remainingMs > 0 ? Date.now() + result.remainingMs : null
          })
          return false
        }

        const decryptedData = JSON.parse(decrypted)
        nsec = decryptedData.nsec

        // Migrate to V2 format
        masterKey = generateMasterKey()
        dbSalt = storedKeys.dbSalt
          ? base64ToUint8Array(storedKeys.dbSalt)
          : generateSalt()

        const passwordSlot = await createPasswordSlot(masterKey, password)
        const encryptedNsec = await encryptWithMasterKey(nsec!, masterKey)

        const migratedKeys: EncryptedKeysV2 = {
          _v: 2,
          encryptedNsec,
          slots: [passwordSlot],
          dbSalt: uint8ArrayToBase64(dbSalt),
          npub: storedKeys.npub,
          identityHidden: storedKeys.identityHidden
        }

        await saveKeys(migratedKeys)
        console.log('Migrated keys from V1 to V2 format')
      } else {
        set({ isLoading: false, error: 'Unknown key format' })
        return false
      }

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
        publicInfo: hideIdentity ? null : { npub: keys.npub }
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
    const { keys, hideIdentity } = get()
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

      const encryptedKeys: EncryptedKeysV2 = {
        _v: 2,
        encryptedNsec,
        slots: [passwordSlot],
        dbSalt: uint8ArrayToBase64(dbSalt),
        npub: hideIdentity ? undefined : keys.npub,
        identityHidden: hideIdentity || undefined
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

  removePassword: async (currentPassword: string) => {
    const { keys, hasPassword } = get()
    if (!keys || !hasPassword) return false

    try {
      const storedKeys = await loadKeys()
      if (!storedKeys || !isEncryptedKeys(storedKeys)) return false

      // Verify password by attempting unlock
      let masterKey: Uint8Array | null = null

      if (isEncryptedKeysV2(storedKeys)) {
        const passwordSlot = storedKeys.slots.find(s => s.type === 'password')
        if (passwordSlot) {
          masterKey = await unlockWithPasswordSlot(passwordSlot, currentPassword)
        }
      } else if (isEncryptedKeysV1(storedKeys)) {
        const decrypted = await decryptWithPassword(storedKeys.d, currentPassword)
        if (decrypted) {
          masterKey = new Uint8Array(32) // Dummy, just to pass the check
        }
      }

      if (!masterKey) return false

      await migrateToDecrypted()
      clearEncryptionKey()
      biometricsService.clearBiometricData()

      await saveKeys(keys)
      set({ hasPassword: false, biometricsEnabled: false })
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
      const storedKeys = await loadKeys()
      if (!storedKeys || !isEncryptedKeys(storedKeys) || !isEncryptedKeysV2(storedKeys)) return false

      const passwordSlot = storedKeys.slots.find(s => s.type === 'password')
      if (!passwordSlot) return false

      const masterKey = await unlockWithPasswordSlot(passwordSlot, password)
      if (!masterKey) return false

      // Update the stored keys with new identity setting
      const updatedKeys: EncryptedKeysV2 = {
        ...storedKeys,
        npub: hide ? undefined : keys.npub,
        identityHidden: hide || undefined
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
        failedAttempts: result.attempts
      })
    } else {
      set({
        lockoutUntil: null,
        failedAttempts: result.attempts
      })
    }
  },

  // Biometric methods
  checkBiometrics: async () => {
    try {
      const state = await biometricsService.checkAvailability()
      const storedKeys = await loadKeys()

      // Check if passkey slot exists (V2 format only)
      let biometricsEnabled = false
      if (storedKeys && isEncryptedKeys(storedKeys) && isEncryptedKeysV2(storedKeys)) {
        biometricsEnabled = storedKeys.slots.some(s => s.type === 'passkey')
      }

      set({
        biometricsAvailable: state.available,
        biometricType: state.type,
        biometricsEnabled
      })
    } catch (error) {
      console.error('Failed to check biometrics:', error)
      set({ biometricsAvailable: false, biometricType: 'none', biometricsEnabled: false })
    }
  },

  enableBiometrics: async (password: string) => {
    const { keys, hasPassword } = get()
    if (!keys || !hasPassword) return false

    try {
      const storedKeys = await loadKeys()
      if (!storedKeys || !isEncryptedKeys(storedKeys) || !isEncryptedKeysV2(storedKeys)) {
        set({ error: 'Please unlock first to enable biometrics' })
        return false
      }

      // Verify password and get master key
      const passwordSlot = storedKeys.slots.find(s => s.type === 'password')
      if (!passwordSlot) {
        set({ error: 'No password slot found' })
        return false
      }

      const masterKey = await unlockWithPasswordSlot(passwordSlot, password)
      if (!masterKey) {
        set({ error: 'Incorrect password' })
        return false
      }

      // Authenticate with biometrics
      const biometricKey = await biometricsService.authenticate('Enable biometric unlock')
      if (!biometricKey) {
        set({ error: 'Biometric authentication failed' })
        return false
      }

      // Create passkey slot for the same master key
      const passkeySlot = await createPasskeySlot(masterKey, biometricKey)

      // Add passkey slot to existing slots
      const updatedKeys: EncryptedKeysV2 = {
        ...storedKeys,
        slots: [...storedKeys.slots.filter(s => s.type !== 'passkey'), passkeySlot]
      }

      await saveKeys(updatedKeys)
      await saveSettings({ biometricsEnabled: true })
      set({ biometricsEnabled: true, error: null })
      return true
    } catch (error) {
      console.error('Failed to enable biometrics:', error)
      set({ error: 'Failed to enable biometrics' })
      return false
    }
  },

  disableBiometrics: async () => {
    try {
      const storedKeys = await loadKeys()

      if (storedKeys && isEncryptedKeys(storedKeys) && isEncryptedKeysV2(storedKeys)) {
        // Remove passkey slot
        const updatedKeys: EncryptedKeysV2 = {
          ...storedKeys,
          slots: storedKeys.slots.filter(s => s.type !== 'passkey')
        }
        await saveKeys(updatedKeys)
      }

      biometricsService.clearBiometricData()
      await saveSettings({ biometricsEnabled: false })
      set({ biometricsEnabled: false })
    } catch (error) {
      console.error('Failed to disable biometrics:', error)
    }
  },

  unlockWithBiometrics: async () => {
    set({ isLoading: true, error: null })

    try {
      const storedKeys = await loadKeys()
      if (!storedKeys || !isEncryptedKeys(storedKeys) || !isEncryptedKeysV2(storedKeys)) {
        set({ isLoading: false, error: 'Biometrics not available for this account' })
        return false
      }

      const passkeySlot = storedKeys.slots.find(s => s.type === 'passkey')
      if (!passkeySlot) {
        set({ isLoading: false, error: 'Biometrics not enabled' })
        return false
      }

      // Authenticate with biometrics
      const biometricKey = await biometricsService.authenticate('Unlock Seal')
      if (!biometricKey) {
        set({ isLoading: false, error: 'Biometric authentication failed' })
        return false
      }

      // Unwrap master key with passkey slot
      const masterKey = await unlockWithPasskeySlot(passkeySlot, biometricKey)
      if (!masterKey) {
        set({ isLoading: false, error: 'Failed to unlock with biometrics' })
        return false
      }

      // Decrypt nsec with master key
      const nsec = await decryptWithMasterKey(storedKeys.encryptedNsec, masterKey)
      if (!nsec) {
        set({ isLoading: false, error: 'Failed to decrypt keys' })
        return false
      }

      const keys = keysFromNsec(nsec)
      if (!keys) {
        set({ isLoading: false, error: 'Invalid stored key' })
        return false
      }

      await resetRateLimit()

      // Derive DB key from master key
      const dbSalt = base64ToUint8Array(storedKeys.dbSalt)
      const dbKey = await deriveDatabaseKey(masterKey, dbSalt)
      setEncryptionKey(dbKey, dbSalt)

      set({ keys, isLocked: false, isLoading: false, error: null, lockoutUntil: null, failedAttempts: 0 })
      return true
    } catch (error) {
      console.error('Failed to unlock with biometrics:', error)
      set({ isLoading: false, error: 'Biometric unlock failed' })
      return false
    }
  }
}))
