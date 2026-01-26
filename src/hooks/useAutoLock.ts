import { useEffect, useRef } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
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

    const resetTimer = () => {
      lastActivityRef.current = Date.now()

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      timeoutRef.current = setTimeout(() => {
        lock()
      }, timeout)
    }

    // Check if we should lock based on last activity
    const checkAndLock = () => {
      const inactiveTime = Date.now() - lastActivityRef.current
      if (inactiveTime >= timeout) {
        lock()
      } else {
        // Restart timer for remaining time
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
        timeoutRef.current = setTimeout(() => {
          lock()
        }, timeout - inactiveTime)
      }
    }

    // Events to track user activity
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']

    // Add event listeners
    events.forEach((event) => {
      document.addEventListener(event, resetTimer, { passive: true })
    })

    // Handle app state change on native platforms
    let appStateListener: { remove: () => void } | null = null
    if (Capacitor.isNativePlatform()) {
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          // App came to foreground - check if we should lock
          checkAndLock()
        }
      }).then((listener) => {
        appStateListener = listener
      })
    }

    // Handle visibility change for web
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Tab became visible - check if we should lock
        checkAndLock()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Start the timer
    resetTimer()

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, resetTimer)
      })
      document.removeEventListener('visibilitychange', handleVisibilityChange)

      if (appStateListener) {
        appStateListener.remove()
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [hasPassword, keys, lock, timeout])
}
