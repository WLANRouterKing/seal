import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { DB_NAME, DB_VERSION, STORES } from '../utils/constants'
import type { NostrKeys, Contact, Message, AppSettings } from '../types'
import { encryptForStorage, decryptFromStorage, isStorageEncrypted } from './encryption'
import { isEncryptionUnlocked } from './encryptionKeyManager'

interface EncryptedKeys {
  encrypted: string
  publicKey: string
  npub: string
  dbSalt?: string // Base64-encoded salt for DB encryption
}

interface NostrChatDB extends DBSchema {
  [STORES.KEYS]: {
    key: string
    value: NostrKeys | EncryptedKeys
  }
  [STORES.MESSAGES]: {
    key: string
    value: Message
    indexes: {
      'by-pubkey': string
      'by-created': number
    }
  }
  [STORES.CONTACTS]: {
    key: string
    value: Contact
  }
  [STORES.SETTINGS]: {
    key: string
    value: AppSettings
  }
  [STORES.RELAYS]: {
    key: string
    value: { url: string; read: boolean; write: boolean }
  }
  [STORES.DELETED_MESSAGES]: {
    key: string
    value: { id: string; deletedAt: number }
  }
}

let dbPromise: Promise<IDBPDatabase<NostrChatDB>> | null = null

export async function getDB(): Promise<IDBPDatabase<NostrChatDB>> {
  if (!dbPromise) {
    dbPromise = openDB<NostrChatDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, _transaction) {
        // Migration pattern:
        // - Each version block runs ONLY for users upgrading from a lower version
        // - New installs run ALL blocks sequentially (oldVersion = 0)
        // - To add a new migration:
        //   1. Increment DB_VERSION in constants.ts
        //   2. Add a new `if (oldVersion < N)` block below
        //   3. Put your schema changes inside

        // Version 1: Initial schema
        if (oldVersion < 1) {
          db.createObjectStore(STORES.KEYS)

          const messageStore = db.createObjectStore(STORES.MESSAGES, { keyPath: 'id' })
          messageStore.createIndex('by-pubkey', 'pubkey')
          messageStore.createIndex('by-created', 'createdAt')

          db.createObjectStore(STORES.CONTACTS, { keyPath: 'pubkey' })
          db.createObjectStore(STORES.SETTINGS)
          db.createObjectStore(STORES.RELAYS, { keyPath: 'url' })
        }

        // Version 2: Add deleted messages store for relay deduplication
        if (oldVersion < 2) {
          db.createObjectStore(STORES.DELETED_MESSAGES, { keyPath: 'id' })
        }
      }
    })
  }
  return dbPromise
}

// Keys
export async function saveKeys(keys: NostrKeys | EncryptedKeys): Promise<void> {
  const db = await getDB()
  await db.put(STORES.KEYS, keys, 'primary')
}

export async function loadKeys(): Promise<NostrKeys | EncryptedKeys | undefined> {
  const db = await getDB()
  return db.get(STORES.KEYS, 'primary')
}

export async function deleteKeys(): Promise<void> {
  const db = await getDB()
  await db.delete(STORES.KEYS, 'primary')
}

export function isEncryptedKeys(keys: NostrKeys | EncryptedKeys): keys is EncryptedKeys {
  return 'encrypted' in keys && !('privateKey' in keys)
}

export type { EncryptedKeys }

// Messages
export async function saveMessage(message: Message): Promise<void> {
  const db = await getDB()
  // Encrypt content if encryption is enabled
  const encryptedContent = await encryptForStorage(message.content)
  await db.put(STORES.MESSAGES, { ...message, content: encryptedContent })
}

async function decryptMessage(message: Message): Promise<Message> {
  if (!isStorageEncrypted(message.content)) {
    return message
  }
  const decryptedContent = await decryptFromStorage(message.content)
  return { ...message, content: decryptedContent ?? '[Encrypted]' }
}

export async function getMessages(pubkey: string): Promise<Message[]> {
  const db = await getDB()
  const messages = await db.getAllFromIndex(STORES.MESSAGES, 'by-pubkey', pubkey)
  const decryptedMessages = await Promise.all(messages.map(decryptMessage))
  return decryptedMessages.sort((a, b) => a.createdAt - b.createdAt)
}

export async function getAllMessages(): Promise<Message[]> {
  const db = await getDB()
  const messages = await db.getAll(STORES.MESSAGES)
  return Promise.all(messages.map(decryptMessage))
}

export async function deleteMessage(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORES.MESSAGES, id)
}

// Deleted message IDs - for relay deduplication
const DELETED_MESSAGE_RETENTION_DAYS = 90

export async function saveDeletedMessageId(id: string): Promise<void> {
  const db = await getDB()
  await db.put(STORES.DELETED_MESSAGES, { id, deletedAt: Date.now() })
}

export async function isMessageDeleted(id: string): Promise<boolean> {
  const db = await getDB()
  const deleted = await db.get(STORES.DELETED_MESSAGES, id)
  return !!deleted
}

// Cleanup old deleted message IDs (older than 90 days)
export async function cleanupDeletedMessages(): Promise<number> {
  const db = await getDB()
  const cutoff = Date.now() - (DELETED_MESSAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const allDeleted = await db.getAll(STORES.DELETED_MESSAGES)

  let cleaned = 0
  for (const entry of allDeleted) {
    if (entry.deletedAt < cutoff) {
      await db.delete(STORES.DELETED_MESSAGES, entry.id)
      cleaned++
    }
  }

  if (cleaned > 0) {
    console.log(`Cleaned up ${cleaned} old deleted message IDs`)
  }
  return cleaned
}

// Contacts - encrypt sensitive fields (name, about, picture, nip05)
async function encryptContact(contact: Contact): Promise<Contact> {
  return {
    ...contact,
    name: contact.name ? await encryptForStorage(contact.name) : undefined,
    about: contact.about ? await encryptForStorage(contact.about) : undefined,
    picture: contact.picture ? await encryptForStorage(contact.picture) : undefined,
    nip05: contact.nip05 ? await encryptForStorage(contact.nip05) : undefined
  }
}

async function decryptContact(contact: Contact): Promise<Contact> {
  return {
    ...contact,
    name: contact.name ? (await decryptFromStorage(contact.name)) ?? undefined : undefined,
    about: contact.about ? (await decryptFromStorage(contact.about)) ?? undefined : undefined,
    picture: contact.picture ? (await decryptFromStorage(contact.picture)) ?? undefined : undefined,
    nip05: contact.nip05 ? (await decryptFromStorage(contact.nip05)) ?? undefined : undefined
  }
}

export async function saveContact(contact: Contact): Promise<void> {
  const db = await getDB()
  const encryptedContact = await encryptContact(contact)
  await db.put(STORES.CONTACTS, encryptedContact)
}

export async function getContact(pubkey: string): Promise<Contact | undefined> {
  const db = await getDB()
  const contact = await db.get(STORES.CONTACTS, pubkey)
  if (!contact) return undefined
  return decryptContact(contact)
}

export async function getAllContacts(): Promise<Contact[]> {
  const db = await getDB()
  const contacts = await db.getAll(STORES.CONTACTS)
  return Promise.all(contacts.map(decryptContact))
}

export async function deleteContact(pubkey: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORES.CONTACTS, pubkey)
}

// Settings - stored as encrypted JSON when encryption is enabled
interface EncryptedSettings {
  encrypted: string
}

function isEncryptedSettings(data: unknown): data is EncryptedSettings {
  return typeof data === 'object' && data !== null && 'encrypted' in data
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const db = await getDB()

  // Load and merge with existing settings
  const existingRaw = await db.get(STORES.SETTINGS, 'app')
  let existing: AppSettings | undefined

  if (existingRaw) {
    if (isEncryptedSettings(existingRaw)) {
      const decrypted = await decryptFromStorage(existingRaw.encrypted)
      existing = decrypted ? JSON.parse(decrypted) : undefined
    } else {
      existing = existingRaw as AppSettings
    }
  }

  const merged = { ...existing, ...settings }

  // Encrypt if encryption is enabled
  if (isEncryptionUnlocked()) {
    const encrypted = await encryptForStorage(JSON.stringify(merged))
    await db.put(STORES.SETTINGS, { encrypted } as unknown as AppSettings, 'app')
  } else {
    await db.put(STORES.SETTINGS, merged, 'app')
  }
}

export async function loadSettings(): Promise<AppSettings | undefined> {
  const db = await getDB()
  const data = await db.get(STORES.SETTINGS, 'app')

  if (!data) return undefined

  if (isEncryptedSettings(data)) {
    const decrypted = await decryptFromStorage(data.encrypted)
    return decrypted ? JSON.parse(decrypted) : undefined
  }

  return data as AppSettings
}

// Relays - URL is encrypted, but we use a hash as the key for lookups
// When encryption is enabled, we store: { url: encryptedUrl, read, write, _urlHash: hash }
type RelayData = { url: string; read: boolean; write: boolean }
type StoredRelay = RelayData & { _urlHash?: string }

async function hashUrl(url: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(url)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function saveRelay(relay: RelayData): Promise<void> {
  const db = await getDB()

  if (isEncryptionUnlocked()) {
    const urlHash = await hashUrl(relay.url)
    const encryptedUrl = await encryptForStorage(relay.url)
    // First delete by original URL (for migration) and by hash
    try { await db.delete(STORES.RELAYS, relay.url) } catch { /* ignore */ }
    const storedRelay: StoredRelay = {
      url: encryptedUrl,
      read: relay.read,
      write: relay.write,
      _urlHash: urlHash
    }
    // Use hash as key when encrypted
    await (db as IDBPDatabase<NostrChatDB>).put(STORES.RELAYS, storedRelay as unknown as { url: string; read: boolean; write: boolean })
  } else {
    await db.put(STORES.RELAYS, relay)
  }
}

export async function getAllRelays(): Promise<RelayData[]> {
  const db = await getDB()
  const relays = await db.getAll(STORES.RELAYS) as StoredRelay[]

  return Promise.all(relays.map(async (relay) => {
    if (isStorageEncrypted(relay.url)) {
      const decryptedUrl = await decryptFromStorage(relay.url)
      return {
        url: decryptedUrl ?? relay.url,
        read: relay.read,
        write: relay.write
      }
    }
    return { url: relay.url, read: relay.read, write: relay.write }
  }))
}

export async function deleteRelay(url: string): Promise<void> {
  const db = await getDB()
  // Try deleting by plain URL first
  try { await db.delete(STORES.RELAYS, url) } catch { /* ignore */ }

  // If encryption is enabled, also try to find and delete by matching decrypted URL
  if (isEncryptionUnlocked()) {
    const allRelays = await db.getAll(STORES.RELAYS) as StoredRelay[]
    for (const relay of allRelays) {
      if (isStorageEncrypted(relay.url)) {
        const decryptedUrl = await decryptFromStorage(relay.url)
        if (decryptedUrl === url && relay._urlHash) {
          await db.delete(STORES.RELAYS, relay.url)
          break
        }
      }
    }
  }
}

// Clear all data
export async function clearAllData(): Promise<void> {
  const db = await getDB()
  const tx = db.transaction([STORES.KEYS, STORES.MESSAGES, STORES.CONTACTS, STORES.SETTINGS, STORES.RELAYS, STORES.DELETED_MESSAGES], 'readwrite')
  await Promise.all([
    tx.objectStore(STORES.KEYS).clear(),
    tx.objectStore(STORES.MESSAGES).clear(),
    tx.objectStore(STORES.CONTACTS).clear(),
    tx.objectStore(STORES.SETTINGS).clear(),
    tx.objectStore(STORES.RELAYS).clear(),
    tx.objectStore(STORES.DELETED_MESSAGES).clear(),
    tx.done
  ])
}

// Migration: Encrypt all existing unencrypted data
// Called when user sets a password for the first time or on unlock with unencrypted data
export async function migrateToEncrypted(): Promise<void> {
  const db = await getDB()

  // Migrate messages
  const messages = await db.getAll(STORES.MESSAGES)
  for (const msg of messages) {
    if (!isStorageEncrypted(msg.content)) {
      const encryptedContent = await encryptForStorage(msg.content)
      await db.put(STORES.MESSAGES, { ...msg, content: encryptedContent })
    }
  }

  // Migrate contacts
  const contacts = await db.getAll(STORES.CONTACTS)
  for (const contact of contacts) {
    let needsUpdate = false
    const updated = { ...contact }

    if (contact.name && !isStorageEncrypted(contact.name)) {
      updated.name = await encryptForStorage(contact.name)
      needsUpdate = true
    }
    if (contact.about && !isStorageEncrypted(contact.about)) {
      updated.about = await encryptForStorage(contact.about)
      needsUpdate = true
    }
    if (contact.picture && !isStorageEncrypted(contact.picture)) {
      updated.picture = await encryptForStorage(contact.picture)
      needsUpdate = true
    }
    if (contact.nip05 && !isStorageEncrypted(contact.nip05)) {
      updated.nip05 = await encryptForStorage(contact.nip05)
      needsUpdate = true
    }

    if (needsUpdate) {
      await db.put(STORES.CONTACTS, updated)
    }
  }

  // Migrate settings
  const settings = await db.get(STORES.SETTINGS, 'app')
  if (settings && !isEncryptedSettings(settings)) {
    const encrypted = await encryptForStorage(JSON.stringify(settings))
    await db.put(STORES.SETTINGS, { encrypted } as unknown as AppSettings, 'app')
  }

  // Migrate relays
  const relays = await db.getAll(STORES.RELAYS) as StoredRelay[]
  for (const relay of relays) {
    if (!isStorageEncrypted(relay.url)) {
      const urlHash = await hashUrl(relay.url)
      const encryptedUrl = await encryptForStorage(relay.url)
      await db.delete(STORES.RELAYS, relay.url)
      await db.put(STORES.RELAYS, {
        url: encryptedUrl,
        read: relay.read,
        write: relay.write,
        _urlHash: urlHash
      } as unknown as { url: string; read: boolean; write: boolean })
    }
  }
}

// Migration: Decrypt all data (when user removes password)
export async function migrateToDecrypted(): Promise<void> {
  const db = await getDB()

  // Decrypt messages
  const messages = await db.getAll(STORES.MESSAGES)
  for (const msg of messages) {
    if (isStorageEncrypted(msg.content)) {
      const decryptedContent = await decryptFromStorage(msg.content)
      if (decryptedContent) {
        await db.put(STORES.MESSAGES, { ...msg, content: decryptedContent })
      }
    }
  }

  // Decrypt contacts
  const contacts = await db.getAll(STORES.CONTACTS)
  for (const contact of contacts) {
    let needsUpdate = false
    const updated = { ...contact }

    if (contact.name && isStorageEncrypted(contact.name)) {
      updated.name = (await decryptFromStorage(contact.name)) ?? undefined
      needsUpdate = true
    }
    if (contact.about && isStorageEncrypted(contact.about)) {
      updated.about = (await decryptFromStorage(contact.about)) ?? undefined
      needsUpdate = true
    }
    if (contact.picture && isStorageEncrypted(contact.picture)) {
      updated.picture = (await decryptFromStorage(contact.picture)) ?? undefined
      needsUpdate = true
    }
    if (contact.nip05 && isStorageEncrypted(contact.nip05)) {
      updated.nip05 = (await decryptFromStorage(contact.nip05)) ?? undefined
      needsUpdate = true
    }

    if (needsUpdate) {
      await db.put(STORES.CONTACTS, updated)
    }
  }

  // Decrypt settings
  const settingsRaw = await db.get(STORES.SETTINGS, 'app')
  if (settingsRaw && isEncryptedSettings(settingsRaw)) {
    const decrypted = await decryptFromStorage(settingsRaw.encrypted)
    if (decrypted) {
      await db.put(STORES.SETTINGS, JSON.parse(decrypted), 'app')
    }
  }

  // Decrypt relays
  const relays = await db.getAll(STORES.RELAYS) as StoredRelay[]
  for (const relay of relays) {
    if (isStorageEncrypted(relay.url)) {
      const decryptedUrl = await decryptFromStorage(relay.url)
      if (decryptedUrl) {
        await db.delete(STORES.RELAYS, relay.url)
        await db.put(STORES.RELAYS, {
          url: decryptedUrl,
          read: relay.read,
          write: relay.write
        })
      }
    }
  }
}
