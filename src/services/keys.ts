import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import type { NostrKeys } from '../types'

export function generateKeyPair(): NostrKeys {
  const privateKeyBytes = generateSecretKey()
  const privateKey = bytesToHex(privateKeyBytes)
  const publicKey = getPublicKey(privateKeyBytes)

  return {
    privateKey,
    publicKey,
    nsec: nip19.nsecEncode(privateKeyBytes),
    npub: nip19.npubEncode(publicKey)
  }
}

export function keysFromNsec(nsec: string): NostrKeys | null {
  try {
    const decoded = nip19.decode(nsec)
    if (decoded.type !== 'nsec') return null

    const privateKeyBytes = decoded.data as Uint8Array
    const privateKey = bytesToHex(privateKeyBytes)
    const publicKey = getPublicKey(privateKeyBytes)

    return {
      privateKey,
      publicKey,
      nsec,
      npub: nip19.npubEncode(publicKey)
    }
  } catch {
    return null
  }
}

export function keysFromPrivateKey(privateKeyHex: string): NostrKeys | null {
  try {
    const privateKeyBytes = hexToBytes(privateKeyHex)
    const publicKey = getPublicKey(privateKeyBytes)

    return {
      privateKey: privateKeyHex,
      publicKey,
      nsec: nip19.nsecEncode(privateKeyBytes),
      npub: nip19.npubEncode(publicKey)
    }
  } catch {
    return null
  }
}

export function npubToPubkey(npub: string): string | null {
  try {
    const decoded = nip19.decode(npub)
    if (decoded.type !== 'npub') return null
    return decoded.data as string
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
