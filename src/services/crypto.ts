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

function createRumor(
  content: string,
  recipientPubkey: string,
  senderPubkey: string
): Rumor {
  return {
    kind: NIP17_KIND.RUMOR,
    content,
    tags: [['p', recipientPubkey]],
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

export async function createGiftWrap(
  content: string,
  recipientPubkey: string,
  senderPrivateKey: string
): Promise<GiftWrap> {
  const senderPrivateKeyBytes = hexToBytes(senderPrivateKey)
  const senderPubkey = getPublicKey(senderPrivateKeyBytes)

  // 1. Create the rumor (unsigned event with actual message)
  const rumor = createRumor(content, recipientPubkey, senderPubkey)

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
): Promise<{ content: string; senderPubkey: string; createdAt: number } | null> {
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

    return {
      content: rumor.content,
      senderPubkey: rumor.pubkey,
      createdAt: rumor.created_at
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

// Export utility for getting hex from nsec
export { bytesToHex, hexToBytes }
