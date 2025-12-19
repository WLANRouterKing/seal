import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { uploadToCatbox, uploadToLitterbox, uploadFile, compressImage } from './fileUpload'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Helper to create a file with proper arrayBuffer support
function createMockFile(content: string, name: string, type: string): File {
  const blob = new Blob([content], { type })
  return new File([blob], name, { type })
}

describe('fileUpload', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('uploadToCatbox', () => {
    it('should upload file to catbox.moe and return URL', async () => {
      const testUrl = 'https://files.catbox.moe/abc123.png'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => testUrl
      })

      const file = createMockFile('test content', 'test.png', 'image/png')
      const result = await uploadToCatbox(file)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://catbox.moe/user/api.php',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData)
        })
      )
      expect(result.url).toBe(testUrl)
      expect(result.mimeType).toBe('image/png')
    })

    it('should throw error on failed upload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      })

      const file = createMockFile('test', 'test.png', 'image/png')
      await expect(uploadToCatbox(file)).rejects.toThrow('Catbox upload failed: 500')
    })

    it('should throw error on invalid response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'Error: file too large'
      })

      const file = createMockFile('test', 'test.png', 'image/png')
      await expect(uploadToCatbox(file)).rejects.toThrow('Catbox upload failed: Error: file too large')
    })
  })

  describe('uploadToLitterbox', () => {
    it('should upload file with 72h expiration', async () => {
      const testUrl = 'https://litter.catbox.moe/xyz789.jpg'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => testUrl
      })

      const file = createMockFile('test', 'test.jpg', 'image/jpeg')
      const result = await uploadToLitterbox(file)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://litterbox.catbox.moe/resources/internals/api.php',
        expect.objectContaining({
          method: 'POST'
        })
      )

      // Check that 72h time parameter was included
      const formData = mockFetch.mock.calls[0][1].body as FormData
      expect(formData.get('time')).toBe('72h')
      expect(result.url).toBe(testUrl)
    })
  })

  describe('uploadFile', () => {
    it('should try catbox first, then litterbox on failure', async () => {
      // First call (catbox) fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable'
      })
      // Second call (litterbox) succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'https://litter.catbox.moe/fallback.png'
      })

      const file = createMockFile('test', 'test.png', 'image/png')
      const result = await uploadFile(file)

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(result.url).toBe('https://litter.catbox.moe/fallback.png')
    })

    it('should return catbox result on first success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'https://files.catbox.moe/success.png'
      })

      const file = createMockFile('test', 'test.png', 'image/png')
      const result = await uploadFile(file)

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(result.url).toBe('https://files.catbox.moe/success.png')
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
})

describe('uploadFile hash calculation', () => {
  it('should calculate SHA-256 hash of file content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => 'https://files.catbox.moe/test.png'
    })

    const file = createMockFile('hello world', 'test.png', 'image/png')
    const result = await uploadFile(file)

    // Hash should be a 64-character hex string
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/)
  })
})
