export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://relay.snort.social',
  'wss://nos.lol',
  'wss://purplepag.es',
  'wss://relay.primal.net',
  'wss://relay.nostr.bg',
  'wss://nostr.mom',
  'wss://relay.mostr.pub',
  'wss://nostr-pub.wellorder.net',
  'wss://nostr.oxtr.dev',
  'wss://offchain.pub',
  'wss://nostr.bitcoiner.social',
  'wss://relay.nostrplebs.com',
  'wss://nostr.fmt.wiz.biz'
]

// Minimum number of relays to use per session (randomly selected from pool)
export const MIN_RELAYS_PER_SESSION = 5

// Maximum percentage of relays to use (to ensure not all relays are used every time)
export const MAX_RELAY_PERCENTAGE = 0.8

export const DB_NAME = 'nostr-chat-db'
export const DB_VERSION = 2

export const STORES = {
  KEYS: 'keys',
  MESSAGES: 'messages',
  CONTACTS: 'contacts',
  SETTINGS: 'settings',
  RELAYS: 'relays',
  DELETED_MESSAGES: 'deleted_messages'
} as const

export const NIP17_KIND = {
  GIFT_WRAP: 1059,
  SEAL: 13,
  RUMOR: 14,           // Chat message (kind 14)
  FILE_MESSAGE: 15,    // Encrypted file message
  DM_RELAYS: 10050     // User's preferred DM relays
} as const
