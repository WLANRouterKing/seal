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

// Number of relays to use per session (randomly selected from pool)
export const RELAYS_PER_SESSION = 5

// Relay rotation interval in milliseconds (10 minutes)
export const RELAY_ROTATION_INTERVAL = 10 * 60 * 1000

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
  RUMOR: 14
} as const
