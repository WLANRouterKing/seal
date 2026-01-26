// NIP-13: Proof of Work for Nostr Events
import { type UnsignedEvent, type Event, getEventHash } from 'nostr-tools'

/**
 * Count leading zero bits in an event ID (hex string)
 */
export function countLeadingZeroBits(hex: string): number {
  let count = 0
  for (const char of hex) {
    const nibble = parseInt(char, 16)
    if (nibble === 0) {
      count += 4
    } else {
      // Count leading zeros in this nibble
      count += Math.clz32(nibble) - 28
      break
    }
  }
  return count
}

/**
 * Check if an event meets the minimum PoW difficulty
 */
export function verifyPoW(event: Event, minDifficulty: number): boolean {
  const difficulty = countLeadingZeroBits(event.id)
  return difficulty >= minDifficulty
}

/**
 * Get the PoW difficulty from an event's nonce tag
 */
export function getTargetDifficulty(event: Event): number | null {
  const nonceTag = event.tags.find((t) => t[0] === 'nonce')
  if (!nonceTag || nonceTag.length < 3) return null
  return parseInt(nonceTag[2], 10)
}

/**
 * Mine proof of work for an unsigned event
 * Returns the event with nonce tag added
 */
export async function minePoW(
  event: UnsignedEvent,
  targetDifficulty: number,
  onProgress?: (hashesChecked: number) => void
): Promise<UnsignedEvent> {
  const eventCopy = { ...event, tags: [...event.tags] }

  // Remove existing nonce tag if present
  eventCopy.tags = eventCopy.tags.filter((t) => t[0] !== 'nonce')

  let nonce = 0
  const startTime = Date.now()
  const reportInterval = 10000 // Report progress every 10k hashes

  while (true) {
    // Update nonce tag
    const tagsWithNonce = [
      ...eventCopy.tags.filter((t) => t[0] !== 'nonce'),
      ['nonce', nonce.toString(), targetDifficulty.toString()],
    ]

    // Create temporary event to get hash
    const tempEvent: UnsignedEvent = {
      ...eventCopy,
      tags: tagsWithNonce,
    }

    const hash = getEventHash(tempEvent)
    const difficulty = countLeadingZeroBits(hash)

    if (difficulty >= targetDifficulty) {
      console.log(`[PoW] Found valid nonce after ${nonce} attempts in ${Date.now() - startTime}ms`)
      return {
        ...eventCopy,
        tags: tagsWithNonce,
      }
    }

    nonce++

    // Report progress
    if (onProgress && nonce % reportInterval === 0) {
      onProgress(nonce)
    }

    // Yield to event loop every 1000 iterations to prevent blocking
    if (nonce % 1000 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
}

/**
 * Mine PoW using Web Workers for better performance (non-blocking)
 * Falls back to main thread if workers not available
 */
export async function minePoWAsync(event: UnsignedEvent, targetDifficulty: number): Promise<UnsignedEvent> {
  // For now, use the simple implementation
  // TODO: Implement Web Worker version for better UI responsiveness
  return minePoW(event, targetDifficulty)
}

// Default difficulty settings
export const POW_DIFFICULTY = {
  NONE: 0,
  LOW: 8, // ~256 hashes, instant
  MEDIUM: 16, // ~65k hashes, ~0.5 sec
  HIGH: 20, // ~1M hashes, ~5 sec
  EXTREME: 24, // ~16M hashes, ~1 min
} as const

// Default difficulty for Seal messages
export const DEFAULT_MESSAGE_DIFFICULTY = POW_DIFFICULTY.LOW
