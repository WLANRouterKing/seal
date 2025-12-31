import { describe, it, expect } from 'vitest'
import { truncateKey, formatTimestamp } from './format'

describe('format utilities', () => {
  describe('truncateKey', () => {
    it('should truncate long keys', () => {
      const key = 'npub1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd'
      const result = truncateKey(key, 8)
      expect(result).toBe('npub1234...7890abcd')
    })

    it('should not truncate short strings', () => {
      const key = 'short'
      const result = truncateKey(key, 8)
      expect(result).toBe('short')
    })

    it('should handle custom length', () => {
      const key = 'abcdefghijklmnopqrstuvwxyz'
      const result = truncateKey(key, 4)
      expect(result).toBe('abcd...wxyz')
    })
  })

  describe('formatTimestamp', () => {
    it('should format today timestamps as time only', () => {
      const now = Math.floor(Date.now() / 1000)
      const result = formatTimestamp(now)
      // Should be time format (HH:MM or H:MM AM/PM depending on locale)
      expect(result).toMatch(/^\d{1,2}:\d{2}(\s?(AM|PM))?$/)
    })

    it('should format old timestamps with date', () => {
      // 30 days ago
      const oldTimestamp = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60)
      const result = formatTimestamp(oldTimestamp)
      // Should include date info (e.g. "Dec 1", "1. Dez", etc.)
      expect(result.length).toBeGreaterThanOrEqual(5)
    })
  })
})
