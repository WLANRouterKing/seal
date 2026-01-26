// Sync Service - Handles data export/import for P2P sync
import {
  getAllMessages,
  getAllContacts,
  getAllRelays,
  loadSettings,
  saveMessage,
  saveContact,
  saveRelay,
  saveSettings,
  saveDeletedMessageId,
  type StoredMessage,
} from './db'
import { useAuthStore } from '../stores/authStore'
import { npubToPubkey } from './keys'
import type { Message, Contact, AppSettings } from '../types'

// Sync data contains stored messages (encrypted events), not decrypted content
export interface SyncData {
  version: 1
  exportedAt: number
  publicKey: string
  npub: string
  messages: StoredMessage[] // Encrypted events, not decrypted content
  contacts: Contact[]
  settings: AppSettings | undefined
  relays: { url: string; read: boolean; write: boolean }[]
  deletedMessageIds: string[]
}

export interface SyncStats {
  messages: number
  contacts: number
  relays: number
}

// Export all data for sync
export async function exportSyncData(): Promise<SyncData> {
  const authState = useAuthStore.getState()

  // Use keys (available when unlocked) instead of publicInfo (which is null when identity is hidden)
  const keys = authState.keys
  if (!keys) {
    throw new Error('Not logged in - please unlock your account first')
  }

  // Derive publicKey from npub
  const publicKey = npubToPubkey(keys.npub)
  if (!publicKey) {
    throw new Error('Invalid npub')
  }

  const npub = keys.npub

  const [messages, contacts, settings, relays] = await Promise.all([
    getAllMessages(),
    getAllContacts(),
    loadSettings(),
    getAllRelays(),
  ])

  // Note: We don't export deleted message IDs as they're only for local deduplication
  // The receiving device will start fresh

  return {
    version: 1,
    exportedAt: Date.now(),
    publicKey,
    npub,
    messages,
    contacts,
    settings,
    relays,
    deletedMessageIds: [],
  }
}

// Validate sync data structure
export function validateSyncData(data: unknown): data is SyncData {
  if (!data || typeof data !== 'object') return false

  const syncData = data as SyncData

  if (syncData.version !== 1) return false
  if (typeof syncData.exportedAt !== 'number') return false
  if (typeof syncData.publicKey !== 'string') return false
  if (typeof syncData.npub !== 'string') return false
  if (!Array.isArray(syncData.messages)) return false
  if (!Array.isArray(syncData.contacts)) return false
  if (!Array.isArray(syncData.relays)) return false

  return true
}

// Import sync data (replaces all local data)
export async function importSyncData(data: SyncData): Promise<SyncStats> {
  if (!validateSyncData(data)) {
    throw new Error('Invalid sync data format')
  }

  const authState = useAuthStore.getState()
  const publicInfo = authState.publicInfo

  // Verify this data belongs to the same user
  if (publicInfo) {
    const currentPubkey = npubToPubkey(publicInfo.npub)
    if (currentPubkey && currentPubkey !== data.publicKey) {
      throw new Error('Sync data belongs to a different user')
    }
  }

  // Clear existing data (except keys)
  // We need to be careful here - we only clear messages, contacts, relays
  // Keys are NOT touched

  const stats: SyncStats = {
    messages: 0,
    contacts: 0,
    relays: 0,
  }

  // Import messages (stored as encrypted events)
  for (const storedMessage of data.messages) {
    try {
      // Convert StoredMessage to Message format for saveMessage
      const message: Message = {
        ...storedMessage,
        content: '', // Content is decrypted at runtime from encryptedEvent
      }
      await saveMessage(message)
      stats.messages++
    } catch (error) {
      console.error('Failed to import message:', error)
    }
  }

  // Import contacts
  for (const contact of data.contacts) {
    try {
      await saveContact(contact)
      stats.contacts++
    } catch (error) {
      console.error('Failed to import contact:', error)
    }
  }

  // Import relays
  for (const relay of data.relays) {
    try {
      await saveRelay(relay)
      stats.relays++
    } catch (error) {
      console.error('Failed to import relay:', error)
    }
  }

  // Import settings (if provided)
  if (data.settings) {
    try {
      await saveSettings(data.settings)
    } catch (error) {
      console.error('Failed to import settings:', error)
    }
  }

  // Import deleted message IDs
  for (const id of data.deletedMessageIds) {
    try {
      await saveDeletedMessageId(id)
    } catch (error) {
      console.error('Failed to import deleted message ID:', error)
    }
  }

  return stats
}

// Serialize sync data to JSON string
export function serializeSyncData(data: SyncData): string {
  return JSON.stringify(data)
}

// Deserialize JSON string to sync data
export function deserializeSyncData(json: string): SyncData {
  const data = JSON.parse(json)

  if (!validateSyncData(data)) {
    throw new Error('Invalid sync data')
  }

  return data
}

// Get sync data size estimate
export function getSyncDataSize(data: SyncData): number {
  return new Blob([JSON.stringify(data)]).size
}

// Format bytes to human readable
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
