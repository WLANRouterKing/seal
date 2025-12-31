// Default relays that support NIP-17 (kind 1059 gift wrap) for private DMs
// Removed: purplepag.es (profile data only), relay.mostr.pub (Mastodon bridge),
// nostr.bitcoiner.social (requires web of trust), relay.nostrplebs.com (requires NIP-05),
// nostr.wine (requires paid registration)
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.snort.social',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://nostr-pub.wellorder.net',
  'wss://nostr.oxtr.dev',
  'wss://relay.noswhere.com'
]

export const DB_NAME = 'seal-chat-db'
export const DB_VERSION = 1 // Clean slate - unified encryption schema

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

// NIP-62: Request to Vanish
// https://github.com/nostr-protocol/nips/blob/master/62.md
export const NIP62_KIND = {
  VANISH: 62
} as const
