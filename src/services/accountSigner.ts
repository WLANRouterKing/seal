import { finalizeEvent, getPublicKey, nip44, type Event, type EventTemplate } from 'nostr-tools'
import { hexToBytes } from '@noble/hashes/utils'

/** Capability boundary. Implementations may live in hardware or another process. */
export interface AccountSigner {
  readonly pubkey: string
  assertActive(): void
  signEvent(event: EventTemplate): Promise<Event>
  encrypt(peer: string, plaintext: string): Promise<string>
  decrypt(peer: string, ciphertext: string): Promise<string>
}

export interface LocalAccountSigner extends AccountSigner {
  dispose(): void
}

/** Software adapter only: this does not protect an unlocked JS realm from XSS. */
export function createLocalAccountSigner(hex: string): LocalAccountSigner {
  const secret = hexToBytes(hex)
  const pubkey = getPublicKey(secret)
  let active = true
  const assertActive = () => {
    if (!active) throw new Error('Account signer locked')
  }
  return {
    pubkey,
    assertActive,
    async signEvent(event) {
      assertActive()
      return finalizeEvent(event, secret)
    },
    async encrypt(peer, plaintext) {
      assertActive()
      const key = nip44.v2.utils.getConversationKey(secret, peer)
      try {
        return nip44.v2.encrypt(plaintext, key)
      } finally {
        key.fill(0)
      }
    },
    async decrypt(peer, ciphertext) {
      assertActive()
      const key = nip44.v2.utils.getConversationKey(secret, peer)
      try {
        return nip44.v2.decrypt(ciphertext, key)
      } finally {
        key.fill(0)
      }
    },
    dispose() {
      active = false
      secret.fill(0)
    },
  }
}
