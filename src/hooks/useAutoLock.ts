import { useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/authStore'

// Auto-lock timeout in milliseconds (default: 5 minutes)
const DEFAULT_TIMEOUT = 5 * 60 * 1000

export function useAutoLock(timeout: number = DEFAULT_TIMEOUT) {
  const { hasPassword, lock, keys } = useAuthStore()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastActivityRef = useRef<number>(0)

  useEffect(() => {
    // Only enable auto-lock if password protection is on and user is logged in
    if (!hasPassword || !keys) return

    // Initialize last activity time on mount
    lastActivityRef.current = Date.now()

    const resetTimer = () => {
      lastActivityRef.current = Date.now()

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      timeoutRef.current = setTimeout(() => {
        lock()
      }, timeout)
    }

    // Events to track user activity
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']

    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, resetTimer, { passive: true })
    })

    // Handle visibility change (lock when tab becomes hidden)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Check if user was inactive for more than 1 minute before hiding
        const inactiveTime = Date.now() - lastActivityRef.current
        if (inactiveTime > 60000) {
          lock()
        }
      } else {
        // Reset timer when becoming visible
        resetTimer()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Start the timer
    resetTimer()

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, resetTimer)
      })
      document.removeEventListener('visibilitychange', handleVisibilityChange)

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [hasPassword, keys, lock, timeout])
}
