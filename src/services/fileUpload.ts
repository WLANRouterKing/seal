// File upload service for NIP-17 Kind 15 file messages
// Uses nostr.build with NIP-98 authentication via nostrify
// Files are encrypted with AES-GCM (hybrid encryption) for unlimited file sizes
// The AES key is encrypted with NIP-44 and prepended to the file

import { nip44, finalizeEvent } from 'nostr-tools'
import { hexToBytes } from '@noble/hashes/utils'

export interface UploadResult {
  url: string
  hash: string  // SHA-256 hash of original (unencrypted) file
  mimeType: string  // Original mime type (before encryption)
  size: number  // Original size (before encryption)
  dimensions?: { width: number; height: number }
  encrypted: true  // Always encrypted
}

// Calculate SHA-256 hash of data
async function calculateHash(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Get image dimensions
function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(img.src)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

// Hybrid encryption: AES-GCM for file data, NIP-44 for the AES key
// Format: [4 bytes key length][NIP-44 encrypted key][12 bytes IV][AES-GCM encrypted data]
async function encryptFileData(
  fileData: ArrayBuffer,
  senderPrivateKey: string,
  recipientPubkey: string
): Promise<ArrayBuffer> {
  // Generate random AES-256 key
  const aesKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )

  // Export the raw key bytes
  const rawKey = await crypto.subtle.exportKey('raw', aesKey)

  // Generate random IV (12 bytes for AES-GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12))

  // Encrypt file data with AES-GCM
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    fileData
  )

  // Encrypt the AES key with NIP-44
  const senderPrivateKeyBytes = hexToBytes(senderPrivateKey)
  const conversationKey = nip44.v2.utils.getConversationKey(
    senderPrivateKeyBytes,
    recipientPubkey
  )

  // Convert raw key to base64 for NIP-44 encryption
  const keyBase64 = btoa(String.fromCharCode(...new Uint8Array(rawKey)))
  const encryptedKey = nip44.v2.encrypt(keyBase64, conversationKey)
  const encryptedKeyBytes = new TextEncoder().encode(encryptedKey)

  // Build final format: [4 bytes key length][encrypted key][12 bytes IV][encrypted data]
  const keyLengthBytes = new Uint8Array(4)
  new DataView(keyLengthBytes.buffer).setUint32(0, encryptedKeyBytes.length, false)

  const result = new Uint8Array(
    4 + encryptedKeyBytes.length + 12 + encryptedData.byteLength
  )
  result.set(keyLengthBytes, 0)
  result.set(encryptedKeyBytes, 4)
  result.set(iv, 4 + encryptedKeyBytes.length)
  result.set(new Uint8Array(encryptedData), 4 + encryptedKeyBytes.length + 12)

  return result.buffer
}

// Decrypt file content (hybrid decryption)
export async function decryptFileData(
  encryptedData: ArrayBuffer,
  recipientPrivateKey: string,
  senderPubkey: string
): Promise<ArrayBuffer> {
  const data = new Uint8Array(encryptedData)

  // Read key length
  const keyLength = new DataView(data.buffer).getUint32(0, false)

  // Extract encrypted key
  const encryptedKeyBytes = data.slice(4, 4 + keyLength)
  const encryptedKey = new TextDecoder().decode(encryptedKeyBytes)

  // Extract IV and encrypted data
  const iv = data.slice(4 + keyLength, 4 + keyLength + 12)
  const encryptedFileData = data.slice(4 + keyLength + 12)

  // Decrypt the AES key with NIP-44
  const recipientPrivateKeyBytes = hexToBytes(recipientPrivateKey)
  const conversationKey = nip44.v2.utils.getConversationKey(
    recipientPrivateKeyBytes,
    senderPubkey
  )

  const keyBase64 = nip44.v2.decrypt(encryptedKey, conversationKey)
  const rawKey = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0))

  // Import the AES key
  const aesKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )

  // Decrypt the file data
  return await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encryptedFileData
  )
}

// Download and decrypt a file from URL
export async function downloadAndDecryptFile(
  url: string,
  mimeType: string,
  recipientPrivateKey: string,
  senderPubkey: string
): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`)
  }

  const encryptedBuffer = await response.arrayBuffer()
  const decryptedData = await decryptFileData(encryptedBuffer, recipientPrivateKey, senderPubkey)

  return new Blob([decryptedData], { type: mimeType })
}

// Create object URL for decrypted file (for displaying in UI)
export async function getDecryptedFileUrl(
  url: string,
  mimeType: string,
  recipientPrivateKey: string,
  senderPubkey: string
): Promise<string> {
  const blob = await downloadAndDecryptFile(url, mimeType, recipientPrivateKey, senderPubkey)
  return URL.createObjectURL(blob)
}

// Create NIP-98 authorization header
async function createNip98Auth(
  url: string,
  method: string,
  privateKey: string
): Promise<string> {
  const event = finalizeEvent({
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', url],
      ['method', method]
    ],
    content: ''
  }, hexToBytes(privateKey))

  // Base64 encode the event JSON
  const eventJson = JSON.stringify(event)
  const base64 = btoa(eventJson)
  return `Nostr ${base64}`
}

// NIP-96 file upload endpoints
const NIP96_ENDPOINTS = [
  {
    name: 'nostr.build',
    url: 'https://nostr.build/api/v2/nip96/upload',
    supportsNoTransform: true
  },
  {
    name: 'nostrcheck.me',
    url: 'https://nostrcheck.me/api/v2/media',
    supportsNoTransform: true
  }
]

// Blossom (BUD-01) endpoints - pure blob storage, no processing
const BLOSSOM_ENDPOINTS = [
  'https://blossom.primal.net',
  'https://cdn.satellite.earth'
]

// Create Blossom authorization event (BUD-02)
async function createBlossomAuth(
  privateKey: string,
  fileHash: string,
  fileSize: number
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const expiration = now + 60 // 1 minute expiry

  const event = finalizeEvent({
    kind: 24242,
    created_at: now,
    tags: [
      ['t', 'upload'],
      ['x', fileHash],
      ['size', fileSize.toString()],
      ['expiration', expiration.toString()]
    ],
    content: 'Upload encrypted file'
  }, hexToBytes(privateKey))

  return `Nostr ${btoa(JSON.stringify(event))}`
}

// Upload to Blossom server (BUD-01) - pure blob storage, no processing
async function uploadToBlossom(
  encryptedData: ArrayBuffer,
  privateKey: string,
  mimeType: string
): Promise<string | null> {
  // Calculate SHA-256 hash of encrypted data
  const hashBuffer = await crypto.subtle.digest('SHA-256', encryptedData)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

  const blob = new Blob([encryptedData], { type: mimeType })

  for (const server of BLOSSOM_ENDPOINTS) {
    try {
      console.log(`[Blossom] Trying ${server}...`)

      const authHeader = await createBlossomAuth(privateKey, fileHash, encryptedData.byteLength)

      const response = await fetch(`${server}/upload`, {
        method: 'PUT',
        headers: {
          'Authorization': authHeader,
          'Content-Type': mimeType
        },
        body: blob
      })

      if (!response.ok) {
        const text = await response.text()
        console.error(`[Blossom] ${server} error:`, response.status, text)
        continue
      }

      const result = await response.json()
      console.log(`[Blossom] ${server} response:`, result)

      if (result.url) {
        console.log(`[Blossom] Success via ${server}`)
        return result.url
      }
    } catch (error) {
      console.error(`[Blossom] ${server} failed:`, error)
    }
  }

  return null
}

// Upload encrypted file with NIP-98 authentication (NIP-96 compliant)
async function uploadToNip96(
  encryptedData: ArrayBuffer,
  privateKey: string,
  originalMimeType: string
): Promise<string | null> {
  // Get file extension from mime type
  const ext = originalMimeType.split('/')[1]?.split('+')[0] || 'bin'

  // Create file - keep original mime type so servers accept it
  const blob = new Blob([encryptedData], { type: originalMimeType })
  const file = new File([blob], `encrypted.${ext}`, { type: originalMimeType })

  // Try each endpoint until one works
  for (const endpoint of NIP96_ENDPOINTS) {
    try {
      console.log(`[NIP-96] Trying ${endpoint.name}...`)

      const formData = new FormData()
      formData.append('file', file)

      // NIP-96: Request no transformation to preserve encrypted content
      if (endpoint.supportsNoTransform) {
        formData.append('no_transform', 'true')
      }

      // NIP-96: Provide content type hint
      formData.append('content_type', originalMimeType)

      const authHeader = await createNip98Auth(endpoint.url, 'POST', privateKey)

      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Authorization': authHeader
        },
        body: formData
      })

      const result = await response.json()
      console.log(`[NIP-96] ${endpoint.name} response:`, result)

      // Handle different response formats
      if (response.ok) {
        // NIP-96 standard format
        if (result.nip94_event?.tags) {
          const urlTag = result.nip94_event.tags.find((t: string[]) => t[0] === 'url')
          if (urlTag?.[1]) {
            console.log(`[NIP-96] Success via ${endpoint.name}`)
            return urlTag[1]
          }
        }
        // nostr.build legacy format
        if (result.status === 'success' && result.data?.[0]?.url) {
          console.log(`[NIP-96] Success via ${endpoint.name}`)
          return result.data[0].url
        }
      }

      console.warn(`[NIP-96] ${endpoint.name}: ${result.message || 'Unknown error'}`)
    } catch (error) {
      console.error(`[NIP-96] ${endpoint.name} failed:`, error)
    }
  }

  return null
}

// Upload encrypted file - tries Blossom first (blob storage), then NIP-96
async function uploadEncryptedFile(
  encryptedData: ArrayBuffer,
  privateKey: string,
  originalMimeType: string = 'application/octet-stream'
): Promise<string> {
  // Try Blossom first - designed for blob storage without processing
  const blossomUrl = await uploadToBlossom(encryptedData, privateKey, originalMimeType)
  if (blossomUrl) {
    return blossomUrl
  }

  // Fall back to NIP-96 with no_transform
  const nip96Url = await uploadToNip96(encryptedData, privateKey, originalMimeType)
  if (nip96Url) {
    return nip96Url
  }

  throw new Error('All upload endpoints failed')
}

// Main upload function - encrypts file and uploads to nostr.build
export async function uploadFile(
  file: File,
  privateKey: string,
  recipientPubkey: string
): Promise<UploadResult> {
  const fileBuffer = await file.arrayBuffer()

  // Calculate hash of original file (before encryption)
  const hash = await calculateHash(fileBuffer)

  // Get dimensions for images (before encryption)
  let dimensions: { width: number; height: number } | undefined
  if (file.type.startsWith('image/')) {
    try {
      dimensions = await getImageDimensions(file)
    } catch {
      // Ignore dimension errors
    }
  }

  // Encrypt the file with AES-GCM (hybrid encryption)
  const encryptedData = await encryptFileData(fileBuffer, privateKey, recipientPubkey)

  // Upload encrypted data to file host
  const url = await uploadEncryptedFile(encryptedData, privateKey, file.type)

  return {
    url,
    hash,
    mimeType: file.type,
    size: file.size,
    dimensions,
    encrypted: true
  }
}

// Compress image before upload (for better performance)
export async function compressImage(
  file: File,
  maxWidth: number = 1920,
  quality: number = 0.85
): Promise<File> {
  return new Promise((resolve, reject) => {
    // If not an image or already small, return as-is
    if (!file.type.startsWith('image/') || file.size < 100 * 1024) {
      resolve(file)
      return
    }

    const img = new Image()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    img.onload = () => {
      let { width, height } = img

      // Scale down if too large
      if (width > maxWidth) {
        height = (height / width) * maxWidth
        width = maxWidth
      }

      canvas.width = width
      canvas.height = height
      ctx?.drawImage(img, 0, 0, width, height)

      // Use WebP for better compression if supported
      const supportsWebP = canvas.toDataURL('image/webp').startsWith('data:image/webp')
      const mimeType = supportsWebP ? 'image/webp' : 'image/jpeg'
      const extension = supportsWebP ? 'webp' : 'jpg'

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File(
              [blob],
              file.name.replace(/\.[^.]+$/, `.${extension}`),
              { type: mimeType }
            )
            resolve(compressedFile)
          } else {
            reject(new Error('Failed to compress image'))
          }
        },
        mimeType,
        quality
      )

      URL.revokeObjectURL(img.src)
    }

    img.onerror = () => {
      URL.revokeObjectURL(img.src)
      reject(new Error('Failed to load image'))
    }

    img.src = URL.createObjectURL(file)
  })
}
