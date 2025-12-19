export interface NostrKeys {
  privateKey: string
  publicKey: string
  npub: string
  nsec: string
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
}

export interface Message {
  id: string
  pubkey: string
  recipientPubkey: string
  content: string
  createdAt: number
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
  isOutgoing: boolean
}

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
}
