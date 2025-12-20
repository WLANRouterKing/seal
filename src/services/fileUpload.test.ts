import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the crypto.subtle.digest before importing the module
vi.stubGlobal('crypto', {
  ...globalThis.crypto,
  subtle: {
    digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer)
  }
})

// Mock nostr-tools nip44
vi.mock('nostr-tools', () => ({
  nip44: {
    v2: {
      utils: {
        getConversationKey: vi.fn().mockReturnValue(new Uint8Array(32))
      },
      encrypt: vi.fn().mockReturnValue('encrypted-data'),
      decrypt: vi.fn().mockReturnValue('base64data')
    }
  },
  finalizeEvent: vi.fn().mockReturnValue({
    id: 'test-event-id',
    pubkey: 'test-pubkey',
    sig: 'test-sig'
  })
}))

// Mock @noble/hashes/utils
vi.mock('@noble/hashes/utils', () => ({
  hexToBytes: vi.fn().mockReturnValue(new Uint8Array(32))
}))

// Now import the module
const { uploadFile, compressImage, decryptFileData } = await import('./fileUpload')

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Helper to create a file with proper arrayBuffer support
function createMockFile(content: string, name: string, type: string): File {
  const blob = new Blob([content], { type })
  const file = new File([blob], name, { type })
  // Mock arrayBuffer to return a proper ArrayBuffer
  file.arrayBuffer = vi.fn().mockResolvedValue(new TextEncoder().encode(content).buffer)
  return file
}

describe('fileUpload', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('uploadFile', () => {
    it('should upload encrypted file to nostr.build and return result', async () => {
      const testUrl = 'https://nostr.build/i/abc123.txt'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'success',
          data: [{ url: testUrl }]
        })
      })

      const file = createMockFile('test content', 'test.png', 'image/png')
      const privateKey = '0'.repeat(64) // Mock 32-byte hex private key
      const recipientPubkey = '1'.repeat(64) // Mock 32-byte hex public key

      const result = await uploadFile(file, privateKey, recipientPubkey)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://nostr.build/api/v2/upload/files',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData)
        })
      )
      expect(result.url).toBe(testUrl)
      expect(result.mimeType).toBe('image/png')
      expect(result.encrypted).toBe(true)
    })

    it('should throw error on failed upload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      })

      const file = createMockFile('test', 'test.png', 'image/png')
      const privateKey = '0'.repeat(64)
      const recipientPubkey = '1'.repeat(64)

      await expect(uploadFile(file, privateKey, recipientPubkey)).rejects.toThrow('nostr.build upload failed: 500')
    })

    it('should throw error on invalid response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'error',
          message: 'File too large'
        })
      })

      const file = createMockFile('test', 'test.png', 'image/png')
      const privateKey = '0'.repeat(64)
      const recipientPubkey = '1'.repeat(64)

      await expect(uploadFile(file, privateKey, recipientPubkey)).rejects.toThrow('Invalid response')
    })
  })

  describe('compressImage', () => {
    it('should return original file if not an image', async () => {
      const file = createMockFile('test', 'test.txt', 'text/plain')
      const result = await compressImage(file)
      expect(result).toBe(file)
    })

    it('should return original file if already small', async () => {
      const smallContent = 'x'.repeat(50 * 1024) // 50KB
      const file = createMockFile(smallContent, 'small.png', 'image/png')
      const result = await compressImage(file)
      expect(result).toBe(file)
    })
  })

  describe('decryptFileData', () => {
    it('should return decrypted data as ArrayBuffer', () => {
      const encryptedData = 'encrypted-test-data'
      const privateKey = '0'.repeat(64)
      const senderPubkey = '1'.repeat(64)

      // Mock returns 'base64data' which atob can decode
      const result = decryptFileData(encryptedData, privateKey, senderPubkey)

      // Should return an ArrayBuffer
      expect(result).toBeInstanceOf(ArrayBuffer)
    })
  })
})

describe('uploadFile hash calculation', () => {
  it('should return a hash in the result', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'success',
        data: [{ url: 'https://nostr.build/i/test.txt' }]
      })
    })

    const file = createMockFile('hello world', 'test.png', 'image/png')
    const privateKey = '0'.repeat(64)
    const recipientPubkey = '1'.repeat(64)

    const result = await uploadFile(file, privateKey, recipientPubkey)

    // Hash should be a 64-character hex string (mocked returns zeros)
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/)
  })
})
