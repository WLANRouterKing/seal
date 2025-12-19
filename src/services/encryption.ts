// Password-based encryption for private keys using Web Crypto API

import { getEncryptionKey } from './encryptionKeyManager'

const SALT_LENGTH = 16
const IV_LENGTH = 12
const ITERATIONS = 100000
const ENCRYPTED_PREFIX = 'ENC:'

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

export function isEncrypted(data: string): boolean {
  // Simple check - encrypted data is base64 encoded
  try {
    const decoded = atob(data)
    // Encrypted data should have at least salt + iv + some content
    return decoded.length >= SALT_LENGTH + IV_LENGTH + 16
  } catch {
    return false
  }
}

// Check if data is encrypted for storage (has ENC: prefix)
export function isStorageEncrypted(data: string): boolean {
  return data.startsWith(ENCRYPTED_PREFIX)
}

// Encrypt data for IndexedDB storage using the key from encryptionKeyManager
export async function encryptForStorage(data: string): Promise<string> {
  const keyData = getEncryptionKey()
  if (!keyData) {
    // No encryption key set - return data as-is
    return data
  }

  const encoder = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    keyData.key,
    encoder.encode(data)
  )

  // Combine iv + encrypted data and encode as base64
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(encrypted), iv.length)

  return ENCRYPTED_PREFIX + btoa(String.fromCharCode(...combined))
}

// Decrypt data from IndexedDB storage using the key from encryptionKeyManager
export async function decryptFromStorage(encryptedData: string): Promise<string | null> {
  // If not encrypted, return as-is
  if (!encryptedData.startsWith(ENCRYPTED_PREFIX)) {
    return encryptedData
  }

  const keyData = getEncryptionKey()
  if (!keyData) {
    // No encryption key set - cannot decrypt
    return null
  }

  try {
    const base64Data = encryptedData.slice(ENCRYPTED_PREFIX.length)
    const combined = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))

    const iv = combined.slice(0, IV_LENGTH)
    const data = combined.slice(IV_LENGTH)

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      keyData.key,
      data
    )

    return new TextDecoder().decode(decrypted)
  } catch {
    return null // Decryption failed
  }
}

// Generate a random salt for encryption
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
}

// Export salt length for external use
export { SALT_LENGTH }
