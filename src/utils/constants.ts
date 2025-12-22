// Default relays that support NIP-17 (kind 1059 gift wrap) for private DMs
// Removed: purplepag.es (profile data only), relay.mostr.pub (Mastodon bridge),
// nostr.bitcoiner.social (requires web of trust)
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://relay.snort.social',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://relay.nostr.bg',
  'wss://nostr-pub.wellorder.net',
  'wss://nostr.oxtr.dev',
  'wss://relay.nostrplebs.com',
  'wss://nostr.wine',
  'wss://relay.noswhere.com'
]

export const DB_NAME = 'nostr-chat-db'
export const DB_VERSION = 3

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
