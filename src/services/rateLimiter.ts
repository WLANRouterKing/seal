/**
 * Rate limiter for login attempts
 * Stores state in IndexedDB to persist across page reloads
 */

const DB_NAME = 'seal-rate-limit'
const STORE_NAME = 'attempts'
const KEY = 'login'

interface RateLimitState {
  failedAttempts: number
  lastAttempt: number
  lockoutUntil: number | null
}

const LOCKOUT_TIERS = [
  { attempts: 3, duration: 30 * 1000 },      // 30 seconds after 3 attempts
  { attempts: 5, duration: 5 * 60 * 1000 },  // 5 minutes after 5 attempts
  { attempts: 10, duration: 30 * 60 * 1000 }, // 30 minutes after 10 attempts
  { attempts: 15, duration: 60 * 60 * 1000 }, // 1 hour after 15 attempts
]

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

async function getState(): Promise<RateLimitState> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(KEY)

      request.onsuccess = () => {
        db.close()
        resolve(request.result || { failedAttempts: 0, lastAttempt: 0, lockoutUntil: null })
      }
      request.onerror = () => {
        db.close()
        resolve({ failedAttempts: 0, lastAttempt: 0, lockoutUntil: null })
      }
    })
  } catch {
    return { failedAttempts: 0, lastAttempt: 0, lockoutUntil: null }
  }
}

async function setState(state: RateLimitState): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.put(state, KEY)

      request.onsuccess = () => {
        db.close()
        resolve()
      }
      request.onerror = () => {
        db.close()
        reject(request.error)
      }
    })
  } catch (error) {
    console.error('Failed to save rate limit state:', error)
  }
}

function getLockoutDuration(attempts: number): number {
  let duration = 0
  for (const tier of LOCKOUT_TIERS) {
    if (attempts >= tier.attempts) {
      duration = tier.duration
    }
  }
  return duration
}

export interface RateLimitCheck {
  allowed: boolean
  remainingMs: number
  attempts: number
}

export async function checkRateLimit(): Promise<RateLimitCheck> {
  const state = await getState()
  const now = Date.now()

  // Check if currently locked out
  if (state.lockoutUntil && now < state.lockoutUntil) {
    return {
      allowed: false,
      remainingMs: state.lockoutUntil - now,
      attempts: state.failedAttempts
    }
  }

  // Lockout expired, allow attempt
  return {
    allowed: true,
    remainingMs: 0,
    attempts: state.failedAttempts
  }
}

export async function recordFailedAttempt(): Promise<RateLimitCheck> {
  const state = await getState()
  const now = Date.now()

  const newAttempts = state.failedAttempts + 1
  const lockoutDuration = getLockoutDuration(newAttempts)
  const lockoutUntil = lockoutDuration > 0 ? now + lockoutDuration : null

  const newState: RateLimitState = {
    failedAttempts: newAttempts,
    lastAttempt: now,
    lockoutUntil
  }

  await setState(newState)

  return {
    allowed: !lockoutUntil,
    remainingMs: lockoutUntil ? lockoutDuration : 0,
    attempts: newAttempts
  }
}

export async function resetRateLimit(): Promise<void> {
  await setState({
    failedAttempts: 0,
    lastAttempt: 0,
    lockoutUntil: null
  })
}

export function formatRemainingTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000)
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}