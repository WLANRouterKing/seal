import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { DB_NAME, DB_VERSION, STORES } from '../utils/constants'
import type { NostrKeys, Contact, Message, AppSettings } from '../types'
import { encryptForStorage, decryptFromStorage, isEncryptedEnvelope, type EncryptedEnvelope } from './encryption'
import { isEncryptionUnlocked } from './encryptionKeyManager'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

// Keys store: encrypted blob with optional visible public info
export interface EncryptedKeys {
  _e: 1
  d: string
  publicKey?: string  // Visible when locked (unless identityHidden)
  npub?: string       // Visible when locked (unless identityHidden)
  dbSalt?: string     // Base64-encoded salt for DB encryption
  identityHidden?: boolean
}

// Messages: stored with encryptedEvent, optionally wrapped in envelope
export interface StoredMessage {
  id: string
  pubkey: string
  recipientPubkey: string
  encryptedEvent: string
  createdAt: number
  status: Message['status']
  isOutgoing: boolean
  expiration?: number
}

// Encrypted message keeps id visible for keyPath
type EncryptedMessage = EncryptedEnvelope & { id: string }

// Relay data
type RelayData = { url: string; read: boolean; write: boolean }

// Encrypted relay keeps a hash key for lookups
type EncryptedRelay = EncryptedEnvelope & { _k: string }

// Encrypted contact keeps pubkey visible for keyPath
type EncryptedContact = EncryptedEnvelope & { pubkey: string }

// =============================================================================
// DATABASE SCHEMA
// =============================================================================

interface NostrChatDB extends DBSchema {
  [STORES.KEYS]: {
    key: string
    value: NostrKeys | EncryptedKeys
  }
  [STORES.MESSAGES]: {
    key: string
    value: StoredMessage | EncryptedMessage
    indexes: {
      'by-pubkey': string
      'by-created': number
    }
  }
  [STORES.CONTACTS]: {
    key: string
    value: Contact | EncryptedContact
  }
  [STORES.SETTINGS]: {
    key: string
    value: AppSettings | EncryptedEnvelope
  }
  [STORES.RELAYS]: {
    key: string
    value: RelayData | EncryptedRelay
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
      upgrade(db) {
        // Clean slate - create all stores
        db.createObjectStore(STORES.KEYS)

        const messageStore = db.createObjectStore(STORES.MESSAGES, { keyPath: 'id' })
        messageStore.createIndex('by-pubkey', 'pubkey')
        messageStore.createIndex('by-created', 'createdAt')

        db.createObjectStore(STORES.CONTACTS, { keyPath: 'pubkey' })
        db.createObjectStore(STORES.SETTINGS)
        db.createObjectStore(STORES.RELAYS, { keyPath: 'url' })
        db.createObjectStore(STORES.DELETED_MESSAGES, { keyPath: 'id' })
      }
    })
  }
  return dbPromise
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

export function isEncryptedKeys(keys: NostrKeys | EncryptedKeys): keys is EncryptedKeys {
  return isEncryptedEnvelope(keys)
}

function isEncryptedMessage(msg: unknown): msg is EncryptedMessage {
  return isEncryptedEnvelope(msg)
}

function isEncryptedContact(contact: unknown): contact is EncryptedContact {
  return isEncryptedEnvelope(contact)
}

function isEncryptedRelay(relay: unknown): relay is EncryptedRelay {
  return isEncryptedEnvelope(relay)
}

// =============================================================================
// KEYS
// =============================================================================

export async function saveKeys(keys: NostrKeys | EncryptedKeys): Promise<void> {
  const db = await getDB()
  await db.put(STORES.KEYS, keys, 'primary')
}

export async function loadKeys(): Promise<NostrKeys | EncryptedKeys | undefined> {
  const db = await getDB()
  return db.get(STORES.KEYS, 'primary')
}

// =============================================================================
// MESSAGES
// =============================================================================

export async function saveMessage(message: Message): Promise<void> {
  const db = await getDB()

  const storedMessage: StoredMessage = {
    id: message.id,
    pubkey: message.pubkey,
    recipientPubkey: message.recipientPubkey,
    encryptedEvent: message.encryptedEvent,
    createdAt: message.createdAt,
    status: message.status,
    isOutgoing: message.isOutgoing,
    expiration: message.expiration
  }

  if (isEncryptionUnlocked()) {
    const envelope = await encryptForStorage(storedMessage)
    await db.put(STORES.MESSAGES, { ...envelope, id: message.id } as unknown as StoredMessage)
  } else {
    await db.put(STORES.MESSAGES, storedMessage)
  }
}

async function decryptMessage(msg: unknown): Promise<StoredMessage | null> {
  if (isEncryptedMessage(msg)) {
    return decryptFromStorage<StoredMessage>(msg)
  }
  return msg as StoredMessage
}

export async function getMessages(pubkey: string): Promise<StoredMessage[]> {
  const db = await getDB()

  // When encryption is enabled, we can't use the index (pubkey is encrypted)
  if (isEncryptionUnlocked()) {
    const allMessages = await db.getAll(STORES.MESSAGES)
    const decrypted = await Promise.all(allMessages.map(decryptMessage))
    return decrypted
      .filter((m): m is StoredMessage => m !== null && m.pubkey === pubkey)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  const messages = await db.getAllFromIndex(STORES.MESSAGES, 'by-pubkey', pubkey)
  return (messages as StoredMessage[]).sort((a, b) => a.createdAt - b.createdAt)
}

export async function getAllMessages(): Promise<StoredMessage[]> {
  const db = await getDB()
  const messages = await db.getAll(STORES.MESSAGES)
  const decrypted = await Promise.all(messages.map(decryptMessage))
  return decrypted.filter((m): m is StoredMessage => m !== null)
}

export async function deleteMessage(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORES.MESSAGES, id)
}

// =============================================================================
// DELETED MESSAGES (for relay deduplication)
// =============================================================================

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
  return cleaned
}

export async function cleanupExpiredMessages(): Promise<string[]> {
  const db = await getDB()
  const now = Math.floor(Date.now() / 1000)
  const allMessages = await getAllMessages()

  const expiredIds: string[] = []
  for (const msg of allMessages) {
    if (msg.expiration && msg.expiration < now) {
      expiredIds.push(msg.id)
      await db.delete(STORES.MESSAGES, msg.id)
      await db.put(STORES.DELETED_MESSAGES, { id: msg.id, deletedAt: Date.now() })
    }
  }
  return expiredIds
}

// =============================================================================
// CONTACTS
// =============================================================================

export async function saveContact(contact: Contact): Promise<void> {
  const db = await getDB()

  if (isEncryptionUnlocked()) {
    const envelope = await encryptForStorage(contact)
    await db.put(STORES.CONTACTS, { ...envelope, pubkey: contact.pubkey } as unknown as Contact)
  } else {
    await db.put(STORES.CONTACTS, contact)
  }
}

async function decryptContact(contact: unknown): Promise<Contact | null> {
  if (isEncryptedContact(contact)) {
    return decryptFromStorage<Contact>(contact)
  }
  return contact as Contact
}

export async function getContact(pubkey: string): Promise<Contact | undefined> {
  const db = await getDB()
  const contact = await db.get(STORES.CONTACTS, pubkey)
  if (!contact) return undefined

  const decrypted = await decryptContact(contact)
  return decrypted ?? undefined
}

export async function getAllContacts(): Promise<Contact[]> {
  const db = await getDB()
  const contacts = await db.getAll(STORES.CONTACTS)
  const decrypted = await Promise.all(contacts.map(decryptContact))
  return decrypted.filter((c): c is Contact => c !== null)
}

export async function deleteContact(pubkey: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORES.CONTACTS, pubkey)
}

// =============================================================================
// SETTINGS
// =============================================================================

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const db = await getDB()

  // Load and merge with existing settings
  const existing = await loadSettings()
  const merged = { ...existing, ...settings }

  if (isEncryptionUnlocked()) {
    const envelope = await encryptForStorage(merged)
    await db.put(STORES.SETTINGS, envelope as unknown as AppSettings, 'app')
  } else {
    await db.put(STORES.SETTINGS, merged, 'app')
  }
}

export async function loadSettings(): Promise<AppSettings | undefined> {
  const db = await getDB()
  const data = await db.get(STORES.SETTINGS, 'app')

  if (!data) return undefined

  if (isEncryptedEnvelope(data)) {
    return (await decryptFromStorage<AppSettings>(data)) ?? undefined
  }

  return data as AppSettings
}

// =============================================================================
// RELAYS
// =============================================================================

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
    const envelope = await encryptForStorage(relay)
    // Use hash as key, store original url field for keyPath compatibility
    const encrypted: EncryptedRelay = { ...envelope, _k: urlHash }
    // Delete old entry by plain URL if exists
    try { await db.delete(STORES.RELAYS, relay.url) } catch { /* ignore */ }
    await db.put(STORES.RELAYS, { ...encrypted, url: urlHash } as unknown as RelayData)
  } else {
    await db.put(STORES.RELAYS, relay)
  }
}

export async function getAllRelays(): Promise<RelayData[]> {
  const db = await getDB()
  const relays = await db.getAll(STORES.RELAYS)

  const results = await Promise.all(relays.map(async (relay) => {
    if (isEncryptedRelay(relay)) {
      return decryptFromStorage<RelayData>(relay)
    }
    return relay as RelayData
  }))

  return results.filter((r): r is RelayData => r !== null)
}

export async function deleteRelay(url: string): Promise<void> {
  const db = await getDB()

  // Try deleting by plain URL first
  try { await db.delete(STORES.RELAYS, url) } catch { /* ignore */ }

  // If encryption is enabled, also try by hash
  if (isEncryptionUnlocked()) {
    const urlHash = await hashUrl(url)
    try { await db.delete(STORES.RELAYS, urlHash) } catch { /* ignore */ }
  }
}

// =============================================================================
// CLEAR ALL DATA
// =============================================================================

export async function clearAllData(): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(
    [STORES.KEYS, STORES.MESSAGES, STORES.CONTACTS, STORES.SETTINGS, STORES.RELAYS, STORES.DELETED_MESSAGES],
    'readwrite'
  )
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

// =============================================================================
// MIGRATIONS (encrypt/decrypt all data when password is set/removed)
// =============================================================================

export async function migrateToEncrypted(): Promise<void> {
  const db = await getDB()

  // Migrate messages
  const messages = await db.getAll(STORES.MESSAGES)
  for (const msg of messages) {
    if (!isEncryptedMessage(msg)) {
      const storedMsg = msg as StoredMessage
      const envelope = await encryptForStorage(storedMsg)
      await db.put(STORES.MESSAGES, { ...envelope, id: storedMsg.id } as unknown as StoredMessage)
    }
  }

  // Migrate contacts
  const contacts = await db.getAll(STORES.CONTACTS)
  for (const contact of contacts) {
    if (!isEncryptedContact(contact)) {
      const c = contact as Contact
      const envelope = await encryptForStorage(c)
      await db.put(STORES.CONTACTS, { ...envelope, pubkey: c.pubkey } as unknown as Contact)
    }
  }

  // Migrate settings
  const settings = await db.get(STORES.SETTINGS, 'app')
  if (settings && !isEncryptedEnvelope(settings)) {
    const envelope = await encryptForStorage(settings)
    await db.put(STORES.SETTINGS, envelope as unknown as AppSettings, 'app')
  }

  // Migrate relays
  const relays = await db.getAll(STORES.RELAYS)
  for (const relay of relays) {
    if (!isEncryptedRelay(relay)) {
      const r = relay as RelayData
      const urlHash = await hashUrl(r.url)
      const envelope = await encryptForStorage(r)
      await db.delete(STORES.RELAYS, r.url)
      await db.put(STORES.RELAYS, { ...envelope, _k: urlHash, url: urlHash } as unknown as RelayData)
    }
  }
}

export async function migrateToDecrypted(): Promise<void> {
  const db = await getDB()

  // Decrypt messages
  const messages = await db.getAll(STORES.MESSAGES)
  for (const msg of messages) {
    if (isEncryptedMessage(msg)) {
      const decrypted = await decryptFromStorage<StoredMessage>(msg)
      if (decrypted) {
        await db.put(STORES.MESSAGES, decrypted)
      }
    }
  }

  // Decrypt contacts
  const contacts = await db.getAll(STORES.CONTACTS)
  for (const contact of contacts) {
    if (isEncryptedContact(contact)) {
      const decrypted = await decryptFromStorage<Contact>(contact)
      if (decrypted) {
        await db.put(STORES.CONTACTS, decrypted)
      }
    }
  }

  // Decrypt settings
  const settings = await db.get(STORES.SETTINGS, 'app')
  if (settings && isEncryptedEnvelope(settings)) {
    const decrypted = await decryptFromStorage<AppSettings>(settings)
    if (decrypted) {
      await db.put(STORES.SETTINGS, decrypted, 'app')
    }
  }

  // Decrypt relays
  const relays = await db.getAll(STORES.RELAYS)
  for (const relay of relays) {
    if (isEncryptedRelay(relay)) {
      const decrypted = await decryptFromStorage<RelayData>(relay)
      if (decrypted) {
        await db.delete(STORES.RELAYS, (relay as unknown as { url: string }).url)
        await db.put(STORES.RELAYS, decrypted)
      }
    }
  }
}
