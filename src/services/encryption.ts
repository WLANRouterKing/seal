// Password-based encryption for private keys using Web Crypto API

import { getEncryptionKey } from './encryptionKeyManager'

const SALT_LENGTH = 16
const IV_LENGTH = 12
const ITERATIONS = 100000

// Unified envelope for all encrypted data in IndexedDB
export interface EncryptedEnvelope {
  _e: 1  // Marker + version (short to save space)
  d: string  // Base64-encoded encrypted data
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  return typeof value === 'object' && value !== null && '_e' in value && (value as EncryptedEnvelope)._e === 1
}

export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptWithPassword(data: string, password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

  const key = await deriveKey(password, salt)

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  )

  // Combine salt + iv + encrypted data and encode as base64
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength)
  combined.set(salt, 0)
  combined.set(iv, salt.length)
  combined.set(new Uint8Array(encrypted), salt.length + iv.length)

  return btoa(String.fromCharCode(...combined))
}

export async function decryptWithPassword(encryptedData: string, password: string): Promise<string | null> {
  try {
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0))

    const salt = combined.slice(0, SALT_LENGTH)
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
    const data = combined.slice(SALT_LENGTH + IV_LENGTH)

    const key = await deriveKey(password, salt)

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    )

    return new TextDecoder().decode(decrypted)
  } catch {
    return null // Wrong password or corrupted data
  }
}

// Encrypt any value for IndexedDB storage - returns EncryptedEnvelope
export async function encryptForStorage<T>(data: T): Promise<EncryptedEnvelope> {
  const keyData = getEncryptionKey()
  if (!keyData) {
    throw new Error('No encryption key available')
  }

  const encoder = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const jsonData = JSON.stringify(data)

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    keyData.key,
    encoder.encode(jsonData)
  )

  // Combine iv + encrypted data and encode as base64
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(encrypted), iv.length)

  return {
    _e: 1,
    d: btoa(String.fromCharCode(...combined))
  }
}

// Decrypt EncryptedEnvelope from IndexedDB storage
export async function decryptFromStorage<T>(envelope: EncryptedEnvelope): Promise<T | null> {
  const keyData = getEncryptionKey()
  if (!keyData) {
    return null
  }

  try {
    const combined = Uint8Array.from(atob(envelope.d), c => c.charCodeAt(0))

    const iv = combined.slice(0, IV_LENGTH)
    const data = combined.slice(IV_LENGTH)

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      keyData.key,
      data
    )

    return JSON.parse(new TextDecoder().decode(decrypted)) as T
  } catch {
    return null
  }
}

// Generate a random salt for encryption
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
}

// Export salt length for external use
export { SALT_LENGTH }
