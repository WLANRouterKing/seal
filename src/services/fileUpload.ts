// File upload service for NIP-17 Kind 15 file messages
// Uses nostr.build with NIP-98 authentication
// Files are encrypted with NIP-44 before upload for privacy

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

// Encrypt file content with NIP-44
function encryptFileData(
  fileData: ArrayBuffer,
  senderPrivateKey: string,
  recipientPubkey: string
): string {
  const senderPrivateKeyBytes = hexToBytes(senderPrivateKey)
  const conversationKey = nip44.v2.utils.getConversationKey(
    senderPrivateKeyBytes,
    recipientPubkey
  )

  // Convert ArrayBuffer to base64 for encryption
  const base64Data = btoa(
    new Uint8Array(fileData).reduce((data, byte) => data + String.fromCharCode(byte), '')
  )

  return nip44.v2.encrypt(base64Data, conversationKey)
}

// Decrypt file content with NIP-44
export function decryptFileData(
  encryptedData: string,
  recipientPrivateKey: string,
  senderPubkey: string
): ArrayBuffer {
  const recipientPrivateKeyBytes = hexToBytes(recipientPrivateKey)
  const conversationKey = nip44.v2.utils.getConversationKey(
    recipientPrivateKeyBytes,
    senderPubkey
  )

  const base64Data = nip44.v2.decrypt(encryptedData, conversationKey)

  // Convert base64 back to ArrayBuffer
  const binaryString = atob(base64Data)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
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

  const encryptedText = await response.text()
  const decryptedData = decryptFileData(encryptedText, recipientPrivateKey, senderPubkey)

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

// Create NIP-98 authorization header for authenticated uploads
function createNip98AuthHeader(
  url: string,
  method: string,
  privateKey: string,
  payloadHash?: string
): string {
  const now = Math.floor(Date.now() / 1000)

  const tags: string[][] = [
    ['u', url],
    ['method', method]
  ]

  if (payloadHash) {
    tags.push(['payload', payloadHash])
  }

  const event = finalizeEvent({
    kind: 27235,
    created_at: now,
    tags,
    content: ''
  }, hexToBytes(privateKey))

  return `Nostr ${btoa(JSON.stringify(event))}`
}

// Upload encrypted file to nostr.build with NIP-98 authentication
async function uploadEncryptedToNostrBuild(
  encryptedData: string,
  privateKey: string
): Promise<string> {
  // Create a text file with the encrypted content
  const blob = new Blob([encryptedData], { type: 'text/plain' })
  const file = new File([blob], 'encrypted.txt', { type: 'text/plain' })

  const formData = new FormData()
  formData.append('file', file)

  const fileBuffer = await file.arrayBuffer()
  const payloadHash = await calculateHash(fileBuffer)

  const headers: HeadersInit = {
    'Authorization': createNip98AuthHeader(
      'https://nostr.build/api/v2/upload/files',
      'POST',
      privateKey,
      payloadHash
    )
  }

  const response = await fetch('https://nostr.build/api/v2/upload/files', {
    method: 'POST',
    headers,
    body: formData
  })

  if (!response.ok) {
    throw new Error(`nostr.build upload failed: ${response.status} ${response.statusText}`)
  }

  const result = await response.json()

  if (result.status !== 'success' || !result.data?.[0]) {
    throw new Error('nostr.build upload failed: Invalid response')
  }

  return result.data[0].url
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

  // Encrypt the file with NIP-44
  const encryptedData = encryptFileData(fileBuffer, privateKey, recipientPubkey)

  // Upload encrypted data to nostr.build
  const url = await uploadEncryptedToNostrBuild(encryptedData, privateKey)

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
