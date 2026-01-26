/**
 * Master Key Management
 *
 * This implements a key-slot based encryption system similar to LUKS/VeraCrypt.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────┐
 * │                  Master Key                      │
 * │    (random 256-bit, encrypts nsec + DB data)    │
 * └─────────────────────────────────────────────────┘
 *                       │
 *         ┌─────────────┴─────────────┐
 *         ▼                           ▼
 * ┌───────────────┐           ┌───────────────┐
 * │ Password Slot │           │ Passkey Slot  │
 * │ (AES-GCM wrap)│           │ (AES-GCM wrap)│
 * └───────────────┘           └───────────────┘
 *
 * - Master Key: Randomly generated, never stored in plain text
 * - Slots: Master Key wrapped (encrypted) with derived keys
 * - Unlock: Any valid slot can unwrap the Master Key
 * - Adding/removing slots doesn't require re-encrypting all data
 */

import { deriveKey, generateSalt } from './encryption'

const MASTER_KEY_LENGTH = 32 // 256 bits
const WRAP_IV_LENGTH = 12 // 96 bits for AES-GCM

// Helper to convert Uint8Array to ArrayBuffer (fixes TypeScript crypto.subtle type issues)
function toBuffer(arr: Uint8Array): ArrayBuffer {
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer
}

export interface KeySlot {
  type: 'password' | 'passkey'
  salt: string // Base64-encoded salt for key derivation
  wrappedKey: string // Base64-encoded wrapped master key (IV + ciphertext)
}

/**
 * Generate a new random master key
 */
export function generateMasterKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(MASTER_KEY_LENGTH))
}

/**
 * Derive a wrapping key from a password
 */
export async function deriveWrappingKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
  return deriveKey(password, salt)
}

/**
 * Derive a wrapping key from passkey authentication result
 */
export async function deriveWrappingKeyFromPasskey(passkeyKey: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  // Import the passkey-derived bytes as key material
  const keyMaterial = await crypto.subtle.importKey('raw', toBuffer(passkeyKey), 'HKDF', false, ['deriveKey'])

  // Derive AES-GCM key using HKDF
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: toBuffer(salt),
      info: new TextEncoder().encode('seal-master-key-wrap'),
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  )
}

/**
 * Wrap (encrypt) the master key with a derived key
 */
export async function wrapMasterKey(masterKey: Uint8Array, wrappingKey: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(WRAP_IV_LENGTH))

  // Import master key as CryptoKey for wrapping
  const masterCryptoKey = await crypto.subtle.importKey(
    'raw',
    toBuffer(masterKey),
    { name: 'AES-GCM', length: 256 },
    true, // extractable for wrapping
    ['encrypt', 'decrypt']
  )

  // Wrap the key
  const wrapped = await crypto.subtle.wrapKey('raw', masterCryptoKey, wrappingKey, {
    name: 'AES-GCM',
    iv: toBuffer(iv),
  })

  // Combine IV + wrapped key
  const combined = new Uint8Array(iv.length + wrapped.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(wrapped), iv.length)

  return uint8ArrayToBase64(combined)
}

/**
 * Unwrap (decrypt) the master key with a derived key
 */
export async function unwrapMasterKey(wrappedKey: string, wrappingKey: CryptoKey): Promise<Uint8Array | null> {
  try {
    const combined = base64ToUint8Array(wrappedKey)
    const iv = combined.slice(0, WRAP_IV_LENGTH)
    const wrapped = combined.slice(WRAP_IV_LENGTH)

    const masterCryptoKey = await crypto.subtle.unwrapKey(
      'raw',
      toBuffer(wrapped),
      wrappingKey,
      { name: 'AES-GCM', iv: toBuffer(iv) },
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    )

    // Export to raw bytes
    const exported = await crypto.subtle.exportKey('raw', masterCryptoKey)
    return new Uint8Array(exported)
  } catch (error) {
    console.error('Failed to unwrap master key:', error)
    return null
  }
}

/**
 * Create a password slot for the master key
 */
export async function createPasswordSlot(masterKey: Uint8Array, password: string): Promise<KeySlot> {
  const salt = generateSalt()
  const wrappingKey = await deriveWrappingKeyFromPassword(password, salt)
  const wrappedKey = await wrapMasterKey(masterKey, wrappingKey)

  return {
    type: 'password',
    salt: uint8ArrayToBase64(salt),
    wrappedKey,
  }
}

/**
 * Create a passkey slot for the master key
 */
export async function createPasskeySlot(masterKey: Uint8Array, passkeyKey: Uint8Array): Promise<KeySlot> {
  const salt = generateSalt()
  const wrappingKey = await deriveWrappingKeyFromPasskey(passkeyKey, salt)
  const wrappedKey = await wrapMasterKey(masterKey, wrappingKey)

  return {
    type: 'passkey',
    salt: uint8ArrayToBase64(salt),
    wrappedKey,
  }
}

/**
 * Unlock master key using a password slot
 */
export async function unlockWithPasswordSlot(slot: KeySlot, password: string): Promise<Uint8Array | null> {
  if (slot.type !== 'password') return null

  const salt = base64ToUint8Array(slot.salt)
  const wrappingKey = await deriveWrappingKeyFromPassword(password, salt)
  return unwrapMasterKey(slot.wrappedKey, wrappingKey)
}

/**
 * Unlock master key using a passkey slot
 */
export async function unlockWithPasskeySlot(slot: KeySlot, passkeyKey: Uint8Array): Promise<Uint8Array | null> {
  if (slot.type !== 'passkey') return null

  const salt = base64ToUint8Array(slot.salt)
  const wrappingKey = await deriveWrappingKeyFromPasskey(passkeyKey, salt)
  return unwrapMasterKey(slot.wrappedKey, wrappingKey)
}

/**
 * Derive DB encryption key from master key
 * Uses HKDF to derive a separate key for database encryption
 */
export async function deriveDatabaseKey(masterKey: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey('raw', toBuffer(masterKey), 'HKDF', false, ['deriveKey'])

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: toBuffer(salt),
      info: new TextEncoder().encode('seal-database-encryption'),
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// Utility functions
function uint8ArrayToBase64(array: Uint8Array): string {
  return btoa(String.fromCharCode(...array))
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Encrypt data with the master key
 */
export async function encryptWithMasterKey(data: string, masterKey: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoder = new TextEncoder()

  const cryptoKey = await crypto.subtle.importKey('raw', toBuffer(masterKey), { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
  ])

  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toBuffer(iv) }, cryptoKey, encoder.encode(data))

  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)

  return uint8ArrayToBase64(combined)
}

/**
 * Decrypt data with the master key
 */
export async function decryptWithMasterKey(encryptedData: string, masterKey: Uint8Array): Promise<string | null> {
  try {
    const combined = base64ToUint8Array(encryptedData)
    const iv = combined.slice(0, 12)
    const ciphertext = combined.slice(12)

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      toBuffer(masterKey),
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    )

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toBuffer(iv) },
      cryptoKey,
      toBuffer(ciphertext)
    )

    return new TextDecoder().decode(decrypted)
  } catch (error) {
    console.error('Failed to decrypt with master key:', error)
    return null
  }
}

// Re-export for convenience
export { generateSalt }
