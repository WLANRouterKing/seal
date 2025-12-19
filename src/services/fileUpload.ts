// File upload service for NIP-17 Kind 15 file messages
// Uses catbox.moe as default (anonymous, no auth required)
// Falls back to nostr.build with NIP-98 auth if available

import { nip44, finalizeEvent } from 'nostr-tools'
import { hexToBytes } from '@noble/hashes/utils'

export interface UploadResult {
  url: string
  hash: string  // SHA-256 hash of original file
  mimeType: string
  size: number
  dimensions?: { width: number; height: number }
}

// Calculate SHA-256 hash of file
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
export async function encryptFile(
  fileData: ArrayBuffer,
  senderPrivateKey: string,
  recipientPubkey: string
): Promise<{ encrypted: string; nonce: string }> {
  const senderPrivateKeyBytes = hexToBytes(senderPrivateKey)
  const conversationKey = nip44.v2.utils.getConversationKey(
    senderPrivateKeyBytes,
    recipientPubkey
  )

  // Convert ArrayBuffer to base64 for encryption
  const base64Data = btoa(
    new Uint8Array(fileData).reduce((data, byte) => data + String.fromCharCode(byte), '')
  )

  const encrypted = nip44.v2.encrypt(base64Data, conversationKey)

  return {
    encrypted,
    nonce: '' // NIP-44 handles nonce internally
  }
}

// Upload file to catbox.moe (anonymous, no auth required)
// https://catbox.moe/tools.php
export async function uploadToCatbox(file: File): Promise<UploadResult> {
  const formData = new FormData()
  formData.append('reqtype', 'fileupload')
  formData.append('fileToUpload', file)

  const response = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    throw new Error(`Catbox upload failed: ${response.status} ${response.statusText}`)
  }

  // Catbox returns the URL directly as text
  const url = await response.text()

  if (!url.startsWith('https://')) {
    throw new Error(`Catbox upload failed: ${url}`)
  }

  const fileBuffer = await file.arrayBuffer()
  const hash = await calculateHash(fileBuffer)

  let dimensions: { width: number; height: number } | undefined
  if (file.type.startsWith('image/')) {
    try {
      dimensions = await getImageDimensions(file)
    } catch {
      // Ignore dimension errors
    }
  }

  return {
    url: url.trim(),
    hash,
    mimeType: file.type,
    size: file.size,
    dimensions
  }
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

// Upload file to nostr.build with NIP-98 authentication
export async function uploadToNostrBuild(file: File, privateKey?: string): Promise<UploadResult> {
  const formData = new FormData()
  formData.append('file', file)

  const headers: HeadersInit = {}

  // Add NIP-98 auth if private key provided
  if (privateKey) {
    const fileBuffer = await file.arrayBuffer()
    const payloadHash = await calculateHash(fileBuffer)
    headers['Authorization'] = createNip98AuthHeader(
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

  const uploadData = result.data[0]
  const fileBuffer = await file.arrayBuffer()
  const hash = await calculateHash(fileBuffer)

  let dimensions: { width: number; height: number } | undefined
  if (file.type.startsWith('image/')) {
    try {
      dimensions = await getImageDimensions(file)
    } catch {
      // Ignore dimension errors
    }
  }

  return {
    url: uploadData.url,
    hash,
    mimeType: file.type,
    size: file.size,
    dimensions
  }
}

// Upload to litterbox.catbox.moe (temporary storage, 72h max)
export async function uploadToLitterbox(file: File): Promise<UploadResult> {
  const formData = new FormData()
  formData.append('reqtype', 'fileupload')
  formData.append('time', '72h')
  formData.append('fileToUpload', file)

  const response = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    throw new Error(`Litterbox upload failed: ${response.status} ${response.statusText}`)
  }

  const url = await response.text()

  if (!url.startsWith('https://')) {
    throw new Error(`Litterbox upload failed: ${url}`)
  }

  const fileBuffer = await file.arrayBuffer()
  const hash = await calculateHash(fileBuffer)

  let dimensions: { width: number; height: number } | undefined
  if (file.type.startsWith('image/')) {
    try {
      dimensions = await getImageDimensions(file)
    } catch {
      // Ignore dimension errors
    }
  }

  return {
    url: url.trim(),
    hash,
    mimeType: file.type,
    size: file.size,
    dimensions
  }
}

// Main upload function - tries catbox.moe first, falls back to litterbox
export async function uploadFile(file: File, privateKey?: string): Promise<UploadResult> {
  // Try nostr.build with auth if private key provided
  if (privateKey) {
    try {
      return await uploadToNostrBuild(file, privateKey)
    } catch (error) {
      console.warn('nostr.build upload failed:', error)
    }
  }

  // Try catbox.moe (permanent, anonymous)
  try {
    return await uploadToCatbox(file)
  } catch (error) {
    console.warn('catbox.moe upload failed, trying litterbox:', error)
  }

  // Fallback to litterbox (temporary 72h, anonymous)
  return await uploadToLitterbox(file)
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
