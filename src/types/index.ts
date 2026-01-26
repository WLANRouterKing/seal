export interface NostrKeys {
  nsec: string
  npub: string
}

export interface Contact {
  pubkey: string
  npub: string
  name?: string
  picture?: string
  about?: string
  nip05?: string
  lastSeen?: number
  createdAt: number
  expirationSeconds?: number // NIP-40: Message expiration setting for this contact (0 = off)
}

export interface Message {
  id: string
  pubkey: string // Sender pubkey (extracted after decryption for indexing)
  recipientPubkey: string
  content: string // Decrypted content (in memory only, not stored in DB)
  createdAt: number
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
  isOutgoing: boolean
  encryptedEvent: string // Gift-wrap event JSON - this is what's stored in DB
  expiration?: number // NIP-40: Unix timestamp when message expires
}

// Expiration options in seconds (0 = off)
export const EXPIRATION_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '1 min', value: 60 },
  { label: '5 min', value: 300 },
  { label: '10 min', value: 600 },
  { label: '15 min', value: 900 },
  { label: '30 min', value: 1800 },
  { label: '1 hour', value: 3600 },
  { label: '6 hours', value: 21600 },
  { label: '12 hours', value: 43200 },
  { label: '1 day', value: 86400 },
  { label: '1 week', value: 604800 },
] as const

export type ExpirationValue = (typeof EXPIRATION_OPTIONS)[number]['value']

export interface Chat {
  pubkey: string
  contact?: Contact
  lastMessage?: Message
  unreadCount: number
  updatedAt: number
}

export interface Relay {
  url: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  read: boolean
  write: boolean
}

export interface AppSettings {
  theme?: 'dark' | 'light' | 'system'
  autoLockMinutes?: number
  notificationsEnabled?: boolean
  relays?: string[]
  setupComplete?: boolean
  hideIdentity?: boolean // When true, npub is also encrypted (not visible when locked)
  biometricsEnabled?: boolean // When true, biometric unlock is enabled
}
