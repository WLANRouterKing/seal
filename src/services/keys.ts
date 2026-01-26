import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools'
import { bytesToHex } from '@noble/hashes/utils'
import type { NostrKeys } from '../types'

// Generate new key pair (returns only nsec/npub)
export function generateKeyPair(): NostrKeys {
  const privateKeyBytes = generateSecretKey()
  const publicKey = getPublicKey(privateKeyBytes)

  return {
    nsec: nip19.nsecEncode(privateKeyBytes),
    npub: nip19.npubEncode(publicKey),
  }
}

// Create keys from nsec
export function keysFromNsec(nsec: string): NostrKeys | null {
  try {
    const decoded = nip19.decode(nsec)
    if (decoded.type !== 'nsec') return null

    const privateKeyBytes = decoded.data as Uint8Array
    const publicKey = getPublicKey(privateKeyBytes)

    return {
      nsec,
      npub: nip19.npubEncode(publicKey),
    }
  } catch {
    return null
  }
}

// Convert nsec to hex private key (for crypto operations)
export function nsecToPrivateKey(nsec: string): string | null {
  try {
    const decoded = nip19.decode(nsec)
    if (decoded.type !== 'nsec') return null
    return bytesToHex(decoded.data as Uint8Array)
  } catch {
    return null
  }
}

// Convert npub to hex public key
export function npubToPubkey(npub: string): string | null {
  try {
    const decoded = nip19.decode(npub)
    if (decoded.type !== 'npub') return null
    return decoded.data as string
  } catch {
    return null
  }
}

// Get hex public key from nsec (derives it)
export function nsecToPubkey(nsec: string): string | null {
  try {
    const decoded = nip19.decode(nsec)
    if (decoded.type !== 'nsec') return null
    const privateKeyBytes = decoded.data as Uint8Array
    return getPublicKey(privateKeyBytes)
  } catch {
    return null
  }
}

export function pubkeyToNpub(pubkey: string): string {
  return nip19.npubEncode(pubkey)
}

export function isValidNpub(npub: string): boolean {
  try {
    const decoded = nip19.decode(npub)
    return decoded.type === 'npub'
  } catch {
    return false
  }
}

export function isValidNsec(nsec: string): boolean {
  try {
    const decoded = nip19.decode(nsec)
    return decoded.type === 'nsec'
  } catch {
    return false
  }
}
