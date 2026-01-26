import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the crypto.subtle before importing the module
const mockAesKey = { type: 'secret' }
vi.stubGlobal('crypto', {
  ...globalThis.crypto,
  subtle: {
    digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer),
    generateKey: vi.fn().mockResolvedValue(mockAesKey),
    exportKey: vi.fn().mockResolvedValue(new Uint8Array(32).buffer),
    importKey: vi.fn().mockResolvedValue(mockAesKey),
    encrypt: vi.fn().mockResolvedValue(new Uint8Array(100).buffer),
    decrypt: vi.fn().mockResolvedValue(new Uint8Array(50).buffer),
  },
  getRandomValues: vi.fn((arr: Uint8Array) => arr),
})

// Mock nostr-tools nip44
vi.mock('nostr-tools', () => ({
  nip44: {
    v2: {
      utils: {
        getConversationKey: vi.fn().mockReturnValue(new Uint8Array(32)),
      },
      encrypt: vi.fn().mockReturnValue('encrypted-key-data'),
      decrypt: vi.fn().mockReturnValue(btoa(String.fromCharCode(...new Uint8Array(32)))),
    },
  },
  finalizeEvent: vi.fn().mockReturnValue({
    id: 'test-event-id',
    pubkey: 'test-pubkey',
    sig: 'test-sig',
  }),
}))

// Mock @noble/hashes/utils
vi.mock('@noble/hashes/utils', async () => {
  const actual = await vi.importActual('@noble/hashes/utils')
  return {
    ...actual,
    hexToBytes: vi.fn().mockReturnValue(new Uint8Array(32)),
  }
})

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
    it('should upload encrypted file via Blossom and return result', async () => {
      const testUrl = 'https://blossom.primal.net/abc123.bin'
      // Blossom upload succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: testUrl,
          sha256: 'abc123',
          size: 100,
        }),
      })

      const file = createMockFile('test content', 'test.png', 'image/png')
      const privateKey = '0'.repeat(64) // Mock 32-byte hex private key
      const recipientPubkey = '1'.repeat(64) // Mock 32-byte hex public key

      const result = await uploadFile(file, privateKey, recipientPubkey)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://blossom.primal.net/upload',
        expect.objectContaining({
          method: 'PUT',
        })
      )
      expect(result.url).toBe(testUrl)
      expect(result.mimeType).toBe('image/png')
      expect(result.encrypted).toBe(true)
    })

    it('should throw error when all upload endpoints fail', async () => {
      // All endpoints fail (Blossom + NIP-96)
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Server error',
      })

      const file = createMockFile('test', 'test.png', 'image/png')
      const privateKey = '0'.repeat(64)
      const recipientPubkey = '1'.repeat(64)

      await expect(uploadFile(file, privateKey, recipientPubkey)).rejects.toThrow('All upload endpoints failed')
    })

    it('should fallback to NIP-96 when Blossom fails', async () => {
      const testUrl = 'https://nostr.build/i/test.bin'

      // Blossom endpoints fail
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'error' })
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'error' })

      // NIP-96 (nostr.build) succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          nip94_event: {
            tags: [['url', testUrl]],
          },
        }),
      })

      const file = createMockFile('test', 'test.png', 'image/png')
      const privateKey = '0'.repeat(64)
      const recipientPubkey = '1'.repeat(64)

      const result = await uploadFile(file, privateKey, recipientPubkey)

      expect(result.url).toBe(testUrl)
      expect(result.encrypted).toBe(true)
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
    it('should return decrypted data as ArrayBuffer', async () => {
      // Create mock encrypted data with proper format:
      // [4 bytes key length][encrypted key][12 bytes IV][encrypted data]
      const encryptedKey = new TextEncoder().encode('encrypted-key-data')
      const keyLength = encryptedKey.length
      const iv = new Uint8Array(12)
      const encryptedFileData = new Uint8Array(50)

      const mockData = new Uint8Array(4 + keyLength + 12 + 50)
      new DataView(mockData.buffer).setUint32(0, keyLength, false)
      mockData.set(encryptedKey, 4)
      mockData.set(iv, 4 + keyLength)
      mockData.set(encryptedFileData, 4 + keyLength + 12)

      const privateKey = '0'.repeat(64)
      const senderPubkey = '1'.repeat(64)

      const result = await decryptFileData(mockData.buffer, privateKey, senderPubkey)

      // Should return an ArrayBuffer
      expect(result).toBeInstanceOf(ArrayBuffer)
    })
  })
})

describe('uploadFile hash calculation', () => {
  it('should return a hash in the result', async () => {
    // Mock Blossom success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        url: 'https://blossom.primal.net/test.bin',
        sha256: 'abc123',
        size: 100,
      }),
    })

    const file = createMockFile('hello world', 'test.png', 'image/png')
    const privateKey = '0'.repeat(64)
    const recipientPubkey = '1'.repeat(64)

    const result = await uploadFile(file, privateKey, recipientPubkey)

    // Hash should be a 64-character hex string (mocked returns zeros)
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/)
  })
})
