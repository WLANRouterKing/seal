import { useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useRelayStore } from '../stores/relayStore'
import { relayPool } from '../services/relay'
import { notificationService } from '../services/notifications'
import { NIP17_KIND } from '../utils/constants'

/**
 * Subscribe to new messages while locked and show generic notifications
 * (without decrypting content for security)
 */
export function useLockedNotifications() {
  const { isLocked, publicInfo } = useAuthStore()
  const { relays } = useRelayStore()
  const processedIds = useRef(new Set<string>())
  // Track when we started subscribing - only notify for events after this
  const subscribeTime = useRef<number>(0)
  // Track if initial sync is complete (EOSE received)
  const initialSyncDone = useRef(false)

  const connectedCount = relays.filter(r => r.status === 'connected').length

  useEffect(() => {
    // Only run when locked and we have public info
    if (!isLocked || !publicInfo || connectedCount === 0) return

    const connectedRelays = relayPool.getConnectedUrls()
    if (connectedRelays.length === 0) return

    // Reset sync state and record subscribe time
    initialSyncDone.current = false
    subscribeTime.current = Math.floor(Date.now() / 1000)

    // Subscribe to gift-wrapped messages for our pubkey
    const unsubscribe = relayPool.subscribe(
      connectedRelays,
      [{ kinds: [NIP17_KIND.GIFT_WRAP], '#p': [publicInfo.publicKey] }],
      (event) => {
        // Skip if already processed
        if (processedIds.current.has(event.id)) return
        processedIds.current.add(event.id)

        // Only show notifications for events that arrived after initial sync
        // This prevents showing notifications for old messages on app start
        if (!initialSyncDone.current) return

        // Also check timestamp - only notify for recent events (within last 60 seconds)
        const eventAge = Math.floor(Date.now() / 1000) - event.created_at
        if (eventAge > 60) return

        // Show generic notification (can't decrypt without private key)
        notificationService.showNotification('New Message', {
          body: 'You have a new encrypted message. Unlock to read.',
          tag: 'locked-message',
          silent: false
        })
      },
      () => {
        // EOSE callback - initial sync is complete
        initialSyncDone.current = true
      }
    )

    return unsubscribe
  }, [isLocked, publicInfo, connectedCount])
}
