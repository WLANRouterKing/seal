import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { DB_NAME, DB_VERSION, STORES } from '../utils/constants'
import type { NostrKeys, Contact, Message, AppSettings } from '../types'

interface EncryptedKeys {
  encrypted: string
  publicKey: string
  npub: string
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

        // Version 2: Example migration (uncomment when needed)
        // if (oldVersion < 2) {
        //   // Add new store:
        //   // db.createObjectStore(STORES.NEW_STORE, { keyPath: 'id' })
        //
        //   // Add index to existing store:
        //   // const store = _transaction.objectStore(STORES.MESSAGES)
        //   // store.createIndex('by-status', 'status')
        //
        //   // Migrate existing data:
        //   // const contactStore = _transaction.objectStore(STORES.CONTACTS)
        //   // contactStore.openCursor().then(function migrate(cursor) {
        //   //   if (!cursor) return
        //   //   const contact = cursor.value
        //   //   contact.newField = 'defaultValue'
        //   //   cursor.update(contact)
        //   //   return cursor.continue().then(migrate)
        //   // })
        // }
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
  await db.put(STORES.MESSAGES, message)
}

export async function getMessages(pubkey: string): Promise<Message[]> {
  const db = await getDB()
  const messages = await db.getAllFromIndex(STORES.MESSAGES, 'by-pubkey', pubkey)
  return messages.sort((a, b) => a.createdAt - b.createdAt)
}

export async function getAllMessages(): Promise<Message[]> {
  const db = await getDB()
  return db.getAll(STORES.MESSAGES)
}

export async function deleteMessage(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORES.MESSAGES, id)
}

// Contacts
export async function saveContact(contact: Contact): Promise<void> {
  const db = await getDB()
  await db.put(STORES.CONTACTS, contact)
}

export async function getContact(pubkey: string): Promise<Contact | undefined> {
  const db = await getDB()
  return db.get(STORES.CONTACTS, pubkey)
}

export async function getAllContacts(): Promise<Contact[]> {
  const db = await getDB()
  return db.getAll(STORES.CONTACTS)
}

export async function deleteContact(pubkey: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORES.CONTACTS, pubkey)
}

// Settings
export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const db = await getDB()
  const existing = await db.get(STORES.SETTINGS, 'app')
  await db.put(STORES.SETTINGS, { ...existing, ...settings }, 'app')
}

export async function loadSettings(): Promise<AppSettings | undefined> {
  const db = await getDB()
  return db.get(STORES.SETTINGS, 'app')
}

// Relays
export async function saveRelay(relay: { url: string; read: boolean; write: boolean }): Promise<void> {
  const db = await getDB()
  await db.put(STORES.RELAYS, relay)
}

export async function getAllRelays(): Promise<{ url: string; read: boolean; write: boolean }[]> {
  const db = await getDB()
  return db.getAll(STORES.RELAYS)
}

export async function deleteRelay(url: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORES.RELAYS, url)
}

// Clear all data
export async function clearAllData(): Promise<void> {
  const db = await getDB()
  const tx = db.transaction([STORES.KEYS, STORES.MESSAGES, STORES.CONTACTS, STORES.SETTINGS, STORES.RELAYS], 'readwrite')
  await Promise.all([
    tx.objectStore(STORES.KEYS).clear(),
    tx.objectStore(STORES.MESSAGES).clear(),
    tx.objectStore(STORES.CONTACTS).clear(),
    tx.objectStore(STORES.SETTINGS).clear(),
    tx.objectStore(STORES.RELAYS).clear(),
    tx.done
  ])
}
