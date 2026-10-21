/// <reference types="node" />
// @vitest-environment node
import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import {
  clearAllData,
  getDB,
  saveKeys,
  loadKeys,
  saveContact,
  saveBlockedContact,
  saveMessage,
  saveSettings,
  saveRelay,
  loadSettings,
  getAllBlockedContacts,
  migrateToDecrypted,
  migrateToEncrypted,
  isEncryptedKeys,
} from './db'
import { clearEncryptionKey, isEncryptionUnlocked, setEncryptionKey } from './encryptionKeyManager'
import {
  createPasswordSlot,
  createPasskeySlot,
  generateMasterKey,
  generateSalt,
  deriveDatabaseKey,
  unlockWithPasswordSlot,
  encryptWithMasterKey,
} from './masterKey'
import { useAuthStore } from '../stores/authStore'
import { generateKeyPair } from './keys'
import { STORES } from '../utils/constants'
import { biometricsService } from './biometrics'

vi.mock('./rateLimiter', () => ({
  checkRateLimit: async () => ({ allowed: true, remainingMs: 0, attempts: 0 }),
  resetRateLimit: async () => {},
  recordFailedAttempt: async () => ({ attempts: 1, remainingMs: 0 }),
}))

// Coverage instrumentation substantially slows real scrypt on shared CI runners.
// Keep production KDF parameters and allow this integration suite more time.
vi.setConfig({ testTimeout: 60_000 })

const localValues = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => localValues.get(key) ?? null,
  setItem: (key: string, value: string) => {
    localValues.set(key, value)
  },
  removeItem: (key: string) => {
    localValues.delete(key)
  },
  clear: () => localValues.clear(),
  key: (index: number) => [...localValues.keys()][index] ?? null,
  get length() {
    return localValues.size
  },
})

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const contact = { pubkey: 'a'.repeat(64), npub: 'test', name: 'Private name', createdAt: 1 }

async function protectedAccount(withLegacySlot = false) {
  const master = generateMasterKey()
  const salt = generateSalt()
  const passwordSlot = await createPasswordSlot(master, 'correct test password')
  const slots = [passwordSlot]
  if (withLegacySlot) slots.push(await createPasskeySlot(master, new Uint8Array(32)))
  const keys = generateKeyPair()
  await saveKeys({ _v: 2, encryptedNsec: await encryptWithMasterKey(keys.nsec, master), slots, dbSalt: b64(salt) })
  return { master, salt, passwordSlot, keys }
}

beforeEach(async () => {
  clearEncryptionKey()
  await clearAllData()
  localStorage.clear()
  useAuthStore.setState({ keys: null, hasPassword: false, isLocked: false, error: null })
})

describe('locked database writes', () => {
  const writers = [
    () => saveContact(contact),
    () => saveBlockedContact(contact),
    () => saveRelay({ url: 'wss://example.com', read: true, write: true }),
    () => saveSettings({ theme: 'dark' }),
    () =>
      saveMessage({
        id: 'one',
        pubkey: contact.pubkey,
        recipientPubkey: 'b'.repeat(64),
        content: 'secret',
        encryptedEvent: '{}',
        createdAt: 1,
        status: 'sent',
        isOutgoing: false,
      }),
  ]
  it.each(writers.map((write, index) => ({ write, index })))(
    'rejects protected writer $index when locked',
    async ({ write }) => {
      await protectedAccount()
      await expect(write()).rejects.toThrow('Database is locked')
      const db = await getDB()
      for (const store of [STORES.CONTACTS, STORES.BLOCKED_CONTACTS, STORES.RELAYS, STORES.SETTINGS, STORES.MESSAGES]) {
        expect(await db.count(store)).toBe(0)
      }
    }
  )

  it('keeps existing encrypted settings intact on a locked write', async () => {
    const { master, salt } = await protectedAccount()
    setEncryptionKey(await deriveDatabaseKey(master, salt), salt)
    await saveSettings({ theme: 'light', hideIdentity: true })
    clearEncryptionKey()
    await expect(saveSettings({ theme: 'dark' })).rejects.toThrow()
    setEncryptionKey(await deriveDatabaseKey(master, salt), salt)
    expect(await loadSettings()).toEqual({ theme: 'light', hideIdentity: true })
  })

  it('still supports explicitly unprotected accounts', async () => {
    await saveKeys(generateKeyPair())
    await saveContact(contact)
    expect(await (await getDB()).get(STORES.CONTACTS, contact.pubkey)).toEqual(contact)
  })

  it('includes blocked contacts in both migrations', async () => {
    await saveBlockedContact(contact)
    const { master, salt } = await protectedAccount()
    setEncryptionKey(await deriveDatabaseKey(master, salt), salt)
    await migrateToEncrypted()
    expect(await (await getDB()).get(STORES.BLOCKED_CONTACTS, contact.pubkey)).toHaveProperty('_e', 1)
    expect(await getAllBlockedContacts()).toEqual([contact])
    await migrateToDecrypted()
    expect(await (await getDB()).get(STORES.BLOCKED_CONTACTS, contact.pubkey)).toEqual(contact)
  })
})

describe('password accounts and legacy biometrics', () => {
  it('activates database encryption immediately after account creation', async () => {
    await useAuthStore.getState().createKeys('correct test password')
    expect(isEncryptionUnlocked()).toBe(true)
    await saveContact(contact)
    expect(await (await getDB()).get(STORES.CONTACTS, contact.pubkey)).toHaveProperty('_e', 1)
    useAuthStore.getState().lock()
    await expect(saveContact(contact)).rejects.toThrow('Database is locked')
    expect(await useAuthStore.getState().unlock('correct test password')).toBe(true)
  })

  it('activates encryption immediately for password-protected imports', async () => {
    expect(await useAuthStore.getState().importKeys(generateKeyPair().nsec, 'correct test password')).toBe(true)
    expect(isEncryptionUnlocked()).toBe(true)
    await saveSettings({ theme: 'dark' })
    expect(await (await getDB()).get(STORES.SETTINGS, 'app')).toHaveProperty('_e', 1)
  })

  it('retires the insecure slot while preserving password access and data', async () => {
    const { passwordSlot, master, salt } = await protectedAccount(true)
    setEncryptionKey(await deriveDatabaseKey(master, salt), salt)
    await saveContact(contact)
    clearEncryptionKey()
    localStorage.setItem('seal_device_key', 'legacy-secret')
    localStorage.setItem('seal_biometric_credential', 'legacy-id')
    await useAuthStore.getState().initialize()
    const stored = await loadKeys()
    expect(stored && isEncryptedKeys(stored) && stored.slots).toEqual([passwordSlot])
    expect(await unlockWithPasswordSlot(passwordSlot, 'correct test password')).toEqual(master)
    expect(localStorage.getItem('seal_device_key')).toBeNull()
    expect(localStorage.getItem('seal_biometric_credential')).toBeNull()
    expect(await useAuthStore.getState().unlock('correct test password')).toBe(true)
    expect(await (await getDB()).get(STORES.CONTACTS, contact.pubkey)).toHaveProperty('_e', 1)
  })

  it('does not enable or accept legacy biometrics', async () => {
    await protectedAccount(true)
    expect((await biometricsService.checkAvailability()).available).toBe(false)
    expect(await useAuthStore.getState().enableBiometrics('correct test password')).toBe(false)
    expect(await useAuthStore.getState().unlockWithBiometrics()).toBe(false)
    expect(isEncryptionUnlocked()).toBe(false)
  })

  it('does not silently replace a live master key', async () => {
    await useAuthStore.getState().createKeys('correct test password')
    const before = await loadKeys()
    expect(await useAuthStore.getState().setPassword('new password')).toBe(false)
    expect(await loadKeys()).toEqual(before)
  })
})

describe('mandatory password protection', () => {
  it('keeps a pending identity out of persistent storage and blocks setup completion', async () => {
    expect(await useAuthStore.getState().importKeys(generateKeyPair().nsec)).toBe(true)
    expect(await loadKeys()).toBeUndefined()
    await expect(useAuthStore.getState().completeSetup()).rejects.toThrow('Password protection is required')
    expect(await useAuthStore.getState().setPassword('short')).toBe(false)
    expect(await loadKeys()).toBeUndefined()
    expect(await useAuthStore.getState().setPassword('a sufficiently long password')).toBe(true)
    await useAuthStore.getState().completeSetup()
    const stored = await loadKeys()
    expect(stored && isEncryptedKeys(stored)).toBe(true)
  })
  it('requires legacy unprotected accounts to configure a password despite old setup flags', async () => {
    await saveKeys(generateKeyPair())
    await saveSettings({ setupComplete: true })
    await useAuthStore.getState().initialize()
    expect(useAuthStore.getState().setupComplete).toBe(false)
    expect(useAuthStore.getState().hasPassword).toBe(false)
  })
  it('preserves new PRF slots on initialization', async () => {
    await protectedAccount()
    const stored = await loadKeys()
    if (!stored || !isEncryptedKeys(stored)) throw new Error('Missing vault')
    const prfSlot = {
      type: 'passkey' as const,
      salt: 'test',
      wrappedKey: 'test',
      prf: { version: 1 as const, credentialId: 'test', input: 'test' },
    }
    await saveKeys({ ...stored, slots: [...stored.slots, prfSlot] })
    await useAuthStore.getState().initialize()
    const after = await loadKeys()
    expect(after && isEncryptedKeys(after) && after.slots).toContainEqual(prfSlot)
  })
})

describe('passkey vault integration', () => {
  it('enrolls without replacing the password slot and unlocks the encrypted database', async () => {
    await useAuthStore.getState().createKeys('correct test password')
    const stored = await loadKeys()
    if (!stored || !isEncryptedKeys(stored)) throw new Error('Missing vault')
    const secret = new Uint8Array(32).fill(9)
    const enroll = vi.spyOn(biometricsService, 'enroll').mockImplementation(async (master) => ({
      ...(await createPasskeySlot(master, secret)),
      prf: { version: 1, credentialId: 'test', input: 'test' },
    }))
    const { unlockWithPasskeySlot } = await import('./masterKey')
    const unlock = vi
      .spyOn(biometricsService, 'unlock')
      .mockImplementation((slot) => unlockWithPasskeySlot(slot, secret))
    try {
      expect(await useAuthStore.getState().enableBiometrics('correct test password')).toBe(true)
      const after = await loadKeys()
      expect(after && isEncryptedKeys(after) && after.slots[0]).toEqual(stored.slots[0])
      useAuthStore.getState().lock()
      expect(await useAuthStore.getState().unlockWithBiometrics()).toBe(true)
      expect(isEncryptionUnlocked()).toBe(true)
      useAuthStore.getState().lock()
      expect(await useAuthStore.getState().unlock('correct test password')).toBe(true)
    } finally {
      enroll.mockRestore()
      unlock.mockRestore()
    }
  })
  it('leaves the vault unchanged when enrollment is cancelled', async () => {
    await useAuthStore.getState().createKeys('correct test password')
    const before = await loadKeys()
    const enroll = vi.spyOn(biometricsService, 'enroll').mockRejectedValue(new Error('cancelled'))
    try {
      expect(await useAuthStore.getState().enableBiometrics('correct test password')).toBe(false)
      expect(await loadKeys()).toEqual(before)
    } finally {
      enroll.mockRestore()
    }
  })
})

it('does not unlock from a native response that arrives after an explicit lock', async () => {
  const compatible = vi
    .spyOn(biometricsService, 'isCompatibleSlot')
    .mockImplementation((slot) => slot.type === 'passkey')
  const { master } = await protectedAccount()
  const stored = await loadKeys()
  if (!stored || !isEncryptedKeys(stored)) throw new Error('Missing vault')
  await saveKeys({
    ...stored,
    slots: [
      ...stored.slots,
      {
        type: 'passkey',
        salt: '',
        wrappedKey: '',
        native: { version: 1, provider: 'android', id: 'test' },
      },
    ],
  })
  await useAuthStore.getState().initialize()
  let finish!: (value: Uint8Array) => void
  const unlock = vi.spyOn(biometricsService, 'unlock').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  try {
    const pending = useAuthStore.getState().unlockWithBiometrics()
    await vi.waitFor(() => expect(unlock).toHaveBeenCalled())
    useAuthStore.getState().lock()
    finish(master)
    expect(await pending).toBe(false)
    expect(useAuthStore.getState().keys).toBeNull()
    expect(useAuthStore.getState().isLocked).toBe(true)
    expect(isEncryptionUnlocked()).toBe(false)
  } finally {
    unlock.mockRestore()
    compatible.mockRestore()
  }
})

it('upgrades a legacy password wrapper without changing the vault ciphertext', async () => {
  const { deriveKey } = await import('./encryption')
  const { wrapMasterKey } = await import('./masterKey')
  const { master, salt } = await protectedAccount()
  const stored = await loadKeys()
  if (!stored || !isEncryptedKeys(stored)) throw new Error('Missing vault')
  const legacy = {
    type: 'password' as const,
    salt: b64(salt),
    wrappedKey: await wrapMasterKey(master, await deriveKey('legacy password', salt)),
  }
  await saveKeys({ ...stored, slots: [legacy] })
  setEncryptionKey(await deriveDatabaseKey(master, salt), salt)
  await saveContact(contact)
  const db = await getDB()
  const ciphertext = await db.get(STORES.CONTACTS, contact.pubkey)
  clearEncryptionKey()
  expect(await useAuthStore.getState().unlock('wrong password')).toBe(false)
  expect(await loadKeys()).toEqual({ ...stored, slots: [legacy] })
  expect(await useAuthStore.getState().unlock('legacy password')).toBe(true)
  const after = await loadKeys()
  if (!after || !isEncryptedKeys(after)) throw new Error('Missing vault')
  expect(after.slots[0].kdf).toBe('scrypt-v1')
  expect(after.encryptedNsec).toBe(stored.encryptedNsec)
  expect(await db.get(STORES.CONTACTS, contact.pubkey)).toEqual(ciphertext)
  expect(await unlockWithPasswordSlot(after.slots[0], 'legacy password')).toEqual(master)
})

it('rejects unknown password KDF versions', async () => {
  const { passwordSlot } = await protectedAccount()
  expect(
    await unlockWithPasswordSlot({ ...passwordSlot, kdf: 'future' as 'scrypt-v1' }, 'correct test password')
  ).toBeNull()
})

it('rolls back all migrated records if the key record cannot be committed', async () => {
  await saveContact(contact)
  await saveRelay({ url: 'wss://example.com', read: true, write: true })
  const { master, salt } = await protectedAccount()
  const stored = await loadKeys()
  if (!stored || !isEncryptedKeys(stored)) throw new Error('Missing vault')
  setEncryptionKey(await deriveDatabaseKey(master, salt), salt)
  // A non-cloneable field forces a real IndexedDB write failure after data writes.
  const invalid = { ...stored, invalid: () => {} }
  await expect(migrateToEncrypted(invalid)).rejects.toThrow()
  const db = await getDB()
  expect(await db.get(STORES.CONTACTS, contact.pubkey)).toEqual(contact)
  expect(await db.getAll(STORES.RELAYS)).toEqual([{ url: 'wss://example.com', read: true, write: true }])
  expect(await loadKeys()).toEqual(stored)
})

it('does not overwrite a concurrent edit during migration', async () => {
  await saveContact(contact)
  const { master, salt } = await protectedAccount()
  setEncryptionKey(await deriveDatabaseKey(master, salt), salt)
  const db = await getDB()
  const encrypt = crypto.subtle.encrypt.bind(crypto.subtle)
  const spy = vi.spyOn(crypto.subtle, 'encrypt').mockImplementationOnce(async (...args) => {
    await db.put(STORES.CONTACTS, { ...contact, name: 'Concurrent change' })
    return encrypt(...args)
  })
  try {
    await expect(migrateToEncrypted()).rejects.toThrow('Vault changed')
    expect(await db.get(STORES.CONTACTS, contact.pubkey)).toEqual({ ...contact, name: 'Concurrent change' })
  } finally {
    spy.mockRestore()
  }
})
