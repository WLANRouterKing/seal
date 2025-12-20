import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  nip44,
  type UnsignedEvent,
  type Event
} from 'nostr-tools'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { NIP17_KIND } from '../utils/constants'

// NIP-17 Gift-Wrapped Direct Messages
// https://github.com/nostr-protocol/nips/blob/master/17.md

interface Rumor {
  kind: number
  content: string
  tags: string[][]
  created_at: number
  pubkey: string
}

interface Seal extends Event {
  kind: typeof NIP17_KIND.SEAL
}

interface GiftWrap extends Event {
  kind: typeof NIP17_KIND.GIFT_WRAP
}

interface RumorOptions {
  replyTo?: string  // Event ID to reply to
  subject?: string  // Conversation subject
}

function createRumor(
  content: string,
  recipientPubkey: string,
  senderPubkey: string,
  options?: RumorOptions
): Rumor {
  const tags: string[][] = [['p', recipientPubkey]]

  // Add reply tag if replying to a specific message
  if (options?.replyTo) {
    tags.push(['e', options.replyTo, '', 'reply'])
  }

  // Add subject tag for conversation title
  if (options?.subject) {
    tags.push(['subject', options.subject])
  }

  return {
    kind: NIP17_KIND.RUMOR,
    content,
    tags,
    created_at: Math.floor(Date.now() / 1000),
    pubkey: senderPubkey
  }
}

function randomizeTimestamp(timestamp: number, variance: number = 172800): number {
  // Subtract random variance of up to 2 days (in seconds) for privacy
  // Only go backwards in time, never forward (relays reject future timestamps)
  const randomOffset = Math.floor(Math.random() * variance)
  return timestamp - randomOffset
}

export interface GiftWrapOptions extends RumorOptions {
  // Can be extended with more options
}

export async function createGiftWrap(
  content: string,
  recipientPubkey: string,
  senderPrivateKey: string,
  options?: GiftWrapOptions
): Promise<GiftWrap> {
  const senderPrivateKeyBytes = hexToBytes(senderPrivateKey)
  const senderPubkey = getPublicKey(senderPrivateKeyBytes)

  // 1. Create the rumor (unsigned event with actual message)
  const rumor = createRumor(content, recipientPubkey, senderPubkey, options)

  // 2. Create conversation key for seal encryption (sender -> recipient)
  const sealConversationKey = nip44.v2.utils.getConversationKey(
    senderPrivateKeyBytes,
    recipientPubkey
  )

  // 3. Encrypt rumor to create seal
  const encryptedRumor = nip44.v2.encrypt(JSON.stringify(rumor), sealConversationKey)

  // 4. Create and sign the seal with sender's key
  const sealEvent: UnsignedEvent = {
    kind: NIP17_KIND.SEAL,
    content: encryptedRumor,
    tags: [],
    created_at: randomizeTimestamp(Math.floor(Date.now() / 1000)),
    pubkey: senderPubkey
  }
  const seal = finalizeEvent(sealEvent, senderPrivateKeyBytes) as Seal

  // 5. Generate random one-time key for gift wrap
  const wrapperPrivateKeyBytes = generateSecretKey()
  const wrapperPubkey = getPublicKey(wrapperPrivateKeyBytes)

  // 6. Create conversation key for gift wrap (random key -> recipient)
  const wrapConversationKey = nip44.v2.utils.getConversationKey(
    wrapperPrivateKeyBytes,
    recipientPubkey
  )

  // 7. Encrypt seal to create gift wrap
  const encryptedSeal = nip44.v2.encrypt(JSON.stringify(seal), wrapConversationKey)

  // 8. Create gift wrap event signed with random key
  const giftWrapEvent: UnsignedEvent = {
    kind: NIP17_KIND.GIFT_WRAP,
    content: encryptedSeal,
    tags: [['p', recipientPubkey]],
    created_at: randomizeTimestamp(Math.floor(Date.now() / 1000)),
    pubkey: wrapperPubkey
  }

  return finalizeEvent(giftWrapEvent, wrapperPrivateKeyBytes) as GiftWrap
}

export async function unwrapGiftWrap(
  giftWrap: GiftWrap,
  recipientPrivateKey: string
): Promise<{ content: string; senderPubkey: string; createdAt: number; replyTo?: string } | null> {
  try {
    const recipientPrivateKeyBytes = hexToBytes(recipientPrivateKey)

    // 1. Decrypt gift wrap to get seal
    const wrapConversationKey = nip44.v2.utils.getConversationKey(
      recipientPrivateKeyBytes,
      giftWrap.pubkey
    )
    const sealJson = nip44.v2.decrypt(giftWrap.content, wrapConversationKey)
    const seal: Seal = JSON.parse(sealJson)

    // 2. Decrypt seal to get rumor
    const sealConversationKey = nip44.v2.utils.getConversationKey(
      recipientPrivateKeyBytes,
      seal.pubkey
    )
    const rumorJson = nip44.v2.decrypt(seal.content, sealConversationKey)
    const rumor: Rumor = JSON.parse(rumorJson)

    // 3. CRITICAL: Verify sender pubkey matches between seal and rumor
    // NIP-17: "Clients MUST verify if pubkey of the kind:13 is the same pubkey on the kind:14"
    if (seal.pubkey !== rumor.pubkey) {
      console.error('Sender impersonation detected: seal.pubkey !== rumor.pubkey')
      return null
    }

    // 4. Extract reply tag if present
    const replyTag = rumor.tags?.find(tag => tag[0] === 'e')
    const replyTo = replyTag ? replyTag[1] : undefined

    return {
      content: rumor.content,
      senderPubkey: rumor.pubkey,
      createdAt: rumor.created_at,
      replyTo
    }
  } catch (error) {
    console.error('Failed to unwrap gift wrap:', error)
    return null
  }
}

// Create a gift wrap for yourself (to store sent messages)
export async function createSelfGiftWrap(
  content: string,
  recipientPubkey: string,
  senderPrivateKey: string
): Promise<GiftWrap> {
  const senderPrivateKeyBytes = hexToBytes(senderPrivateKey)
  const senderPubkey = getPublicKey(senderPrivateKeyBytes)

  // Same as regular gift wrap but recipient is self
  const rumor = createRumor(content, recipientPubkey, senderPubkey)

  const sealConversationKey = nip44.v2.utils.getConversationKey(
    senderPrivateKeyBytes,
    senderPubkey // Encrypt to self
  )

  const encryptedRumor = nip44.v2.encrypt(JSON.stringify(rumor), sealConversationKey)

  const sealEvent: UnsignedEvent = {
    kind: NIP17_KIND.SEAL,
    content: encryptedRumor,
    tags: [],
    created_at: randomizeTimestamp(Math.floor(Date.now() / 1000)),
    pubkey: senderPubkey
  }
  const seal = finalizeEvent(sealEvent, senderPrivateKeyBytes) as Seal

  const wrapperPrivateKeyBytes = generateSecretKey()
  const wrapperPubkey = getPublicKey(wrapperPrivateKeyBytes)

  const wrapConversationKey = nip44.v2.utils.getConversationKey(
    wrapperPrivateKeyBytes,
    senderPubkey // Wrap to self
  )

  const encryptedSeal = nip44.v2.encrypt(JSON.stringify(seal), wrapConversationKey)

  const giftWrapEvent: UnsignedEvent = {
    kind: NIP17_KIND.GIFT_WRAP,
    content: encryptedSeal,
    tags: [['p', senderPubkey]],
    created_at: randomizeTimestamp(Math.floor(Date.now() / 1000)),
    pubkey: wrapperPubkey
  }

  return finalizeEvent(giftWrapEvent, wrapperPrivateKeyBytes) as GiftWrap
}

// Kind 10050: DM Relay preferences
// Users publish this to indicate their preferred relays for receiving DMs

export interface DMRelayList {
  relays: string[]
  pubkey: string
}

export function createDMRelayListEvent(
  relays: string[],
  privateKey: string
): Event {
  const privateKeyBytes = hexToBytes(privateKey)
  const pubkey = getPublicKey(privateKeyBytes)

  const event: UnsignedEvent = {
    kind: NIP17_KIND.DM_RELAYS,
    content: '',
    tags: relays.map(relay => ['relay', relay]),
    created_at: Math.floor(Date.now() / 1000),
    pubkey
  }

  return finalizeEvent(event, privateKeyBytes)
}

export function parseDMRelayListEvent(event: Event): DMRelayList | null {
  if (event.kind !== NIP17_KIND.DM_RELAYS) return null

  const relays = event.tags
    .filter(tag => tag[0] === 'relay' && tag[1])
    .map(tag => tag[1])

  return {
    relays,
    pubkey: event.pubkey
  }
}

// Kind 15: Encrypted file message
// For sending encrypted files/images

export interface FileMetadata {
  url: string           // Encrypted file URL
  mimeType: string      // File MIME type
  hash: string          // SHA-256 hash of decrypted file
  size?: number         // File size in bytes
  dimensions?: { width: number; height: number }  // For images
  blurhash?: string     // Blurhash for image preview
  thumb?: string        // Thumbnail URL
  caption?: string      // Optional caption
  encrypted?: boolean   // Whether file is encrypted with NIP-44
}

export function createFileRumor(
  file: FileMetadata,
  recipientPubkey: string,
  senderPubkey: string,
  options?: RumorOptions
): Rumor {
  const tags: string[][] = [
    ['p', recipientPubkey],
    ['url', file.url],
    ['file-type', file.mimeType],
    ['x', file.hash]  // SHA-256 hash
  ]

  if (file.size) tags.push(['size', file.size.toString()])
  if (file.dimensions) tags.push(['dim', `${file.dimensions.width}x${file.dimensions.height}`])
  if (file.blurhash) tags.push(['blurhash', file.blurhash])
  if (file.thumb) tags.push(['thumb', file.thumb])

  if (options?.replyTo) {
    tags.push(['e', options.replyTo, '', 'reply'])
  }

  return {
    kind: NIP17_KIND.FILE_MESSAGE,
    content: file.caption || '',
    tags,
    created_at: Math.floor(Date.now() / 1000),
    pubkey: senderPubkey
  }
}

export async function createFileGiftWrap(
  file: FileMetadata,
  recipientPubkey: string,
  senderPrivateKey: string,
  options?: RumorOptions
): Promise<GiftWrap> {
  const senderPrivateKeyBytes = hexToBytes(senderPrivateKey)
  const senderPubkey = getPublicKey(senderPrivateKeyBytes)

  // 1. Create the file rumor
  const rumor = createFileRumor(file, recipientPubkey, senderPubkey, options)

  // 2. Create conversation key for seal encryption
  const sealConversationKey = nip44.v2.utils.getConversationKey(
    senderPrivateKeyBytes,
    recipientPubkey
  )

  // 3. Encrypt rumor to create seal
  const encryptedRumor = nip44.v2.encrypt(JSON.stringify(rumor), sealConversationKey)

  // 4. Create and sign the seal
  const sealEvent: UnsignedEvent = {
    kind: NIP17_KIND.SEAL,
    content: encryptedRumor,
    tags: [],
    created_at: randomizeTimestamp(Math.floor(Date.now() / 1000)),
    pubkey: senderPubkey
  }
  const seal = finalizeEvent(sealEvent, senderPrivateKeyBytes) as Seal

  // 5. Generate random one-time key for gift wrap
  const wrapperPrivateKeyBytes = generateSecretKey()
  const wrapperPubkey = getPublicKey(wrapperPrivateKeyBytes)

  // 6. Create conversation key for gift wrap
  const wrapConversationKey = nip44.v2.utils.getConversationKey(
    wrapperPrivateKeyBytes,
    recipientPubkey
  )

  // 7. Encrypt seal to create gift wrap
  const encryptedSeal = nip44.v2.encrypt(JSON.stringify(seal), wrapConversationKey)

  // 8. Create gift wrap event
  const giftWrapEvent: UnsignedEvent = {
    kind: NIP17_KIND.GIFT_WRAP,
    content: encryptedSeal,
    tags: [['p', recipientPubkey]],
    created_at: randomizeTimestamp(Math.floor(Date.now() / 1000)),
    pubkey: wrapperPubkey
  }

  return finalizeEvent(giftWrapEvent, wrapperPrivateKeyBytes) as GiftWrap
}

// Parse file metadata from unwrapped rumor
export function parseFileMetadata(rumor: Rumor): FileMetadata | null {
  if (rumor.kind !== NIP17_KIND.FILE_MESSAGE) return null

  const getTag = (name: string): string | undefined => {
    const tag = rumor.tags.find(t => t[0] === name)
    return tag ? tag[1] : undefined
  }

  const url = getTag('url')
  const mimeType = getTag('file-type')
  const hash = getTag('x')

  if (!url || !mimeType || !hash) return null

  const dimStr = getTag('dim')
  let dimensions: { width: number; height: number } | undefined
  if (dimStr) {
    const [w, h] = dimStr.split('x').map(Number)
    if (w && h) dimensions = { width: w, height: h }
  }

  return {
    url,
    mimeType,
    hash,
    size: getTag('size') ? parseInt(getTag('size')!) : undefined,
    dimensions,
    blurhash: getTag('blurhash'),
    thumb: getTag('thumb'),
    caption: rumor.content || undefined
  }
}

// Export utility for getting hex from nsec
export { bytesToHex, hexToBytes }
