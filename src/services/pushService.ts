// Push Notification Service
// Handles registration with seal-push-server and ntfy.sh subscription

import { Capacitor } from '@capacitor/core'
import { usePushStore, generateNtfyTopic } from '../stores/pushStore'
import { useRelayStore } from '../stores/relayStore'
import { useAuthStore } from '../stores/authStore'
import { notificationService } from './notifications'

// Check if running in Electron
const isElectron = (): boolean => {
  return window.electronAPI?.isElectron === true
}

class PushService {
  private ntfyEventSource: EventSource | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private isInitialized: boolean = false

  async init(): Promise<void> {
    if (this.isInitialized) return
    this.isInitialized = true

    const { enabled, isRegistered } = usePushStore.getState()

    if (enabled && isRegistered) {
      // Reconnect to ntfy on app restart
      await this.connectToNtfy()
    }

    console.log('[PushService] Initialized', { enabled, isRegistered })
  }

  async enable(): Promise<boolean> {
    const store = usePushStore.getState()
    const authStore = useAuthStore.getState()
    const relayStore = useRelayStore.getState()

    if (!authStore.keys?.npub) {
      store.setError('Not logged in')
      return false
    }

    // Generate topic if not exists
    let topic = store.ntfyTopic
    if (!topic) {
      topic = generateNtfyTopic()
      store.setNtfyTopic(topic)
    }

    // Register with push server
    try {
      const response = await fetch(`${store.pushServerUrl}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          npub: authStore.keys.npub,
          ntfy_topic: topic,
          relays: relayStore.activeRelayUrls
        })
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error || `HTTP ${response.status}`)
      }

      store.setRegistered(true)
      store.setEnabled(true)
      store.setError(null)

      // Connect to ntfy for foreground notifications
      await this.connectToNtfy()

      console.log('[PushService] Registered successfully', { topic })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed'
      store.setError(message)
      console.error('[PushService] Registration failed:', error)
      return false
    }
  }

  async disable(): Promise<void> {
    const store = usePushStore.getState()
    const authStore = useAuthStore.getState()

    // Disconnect from ntfy
    this.disconnectFromNtfy()

    // Unregister from push server
    if (store.isRegistered && authStore.keys?.npub) {
      try {
        await fetch(`${store.pushServerUrl}/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ npub: authStore.keys.npub })
        })
      } catch (error) {
        console.warn('[PushService] Unsubscribe failed:', error)
      }
    }

    store.setEnabled(false)
    store.setRegistered(false)
    store.setError(null)

    console.log('[PushService] Disabled')
  }

  private async connectToNtfy(): Promise<void> {
    const store = usePushStore.getState()

    if (!store.ntfyTopic || !store.enabled) return

    // Close existing connection
    this.disconnectFromNtfy()

    const ntfyUrl = `${store.ntfyServerUrl}/${store.ntfyTopic}/sse`

    try {
      this.ntfyEventSource = new EventSource(ntfyUrl)

      this.ntfyEventSource.onopen = () => {
        console.log('[PushService] Connected to ntfy')
        store.setError(null)
      }

      this.ntfyEventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.event === 'message') {
            this.handlePushNotification(data)
          }
        } catch {
          // Ignore non-JSON messages (keepalive etc)
        }
      }

      this.ntfyEventSource.onerror = () => {
        console.warn('[PushService] ntfy connection error, reconnecting...')
        this.scheduleReconnect()
      }
    } catch (error) {
      console.error('[PushService] Failed to connect to ntfy:', error)
      this.scheduleReconnect()
    }
  }

  private disconnectFromNtfy(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ntfyEventSource) {
      this.ntfyEventSource.close()
      this.ntfyEventSource = null
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      const { enabled, isRegistered } = usePushStore.getState()
      if (enabled && isRegistered) {
        this.connectToNtfy()
      }
    }, 5000) // Reconnect after 5 seconds
  }

  private handlePushNotification(data: { title?: string; message?: string }): void {
    // Only show notification if app is in background or on desktop/web
    // On mobile, the system notification should be handled natively
    const isNative = Capacitor.isNativePlatform()
    const isElectronApp = isElectron()

    if (!isNative || isElectronApp) {
      // Show notification via our notification service
      notificationService.showNotification(
        data.title || 'Seal',
        { body: data.message || 'New message' }
      )
    }

    console.log('[PushService] Received push notification:', data)
  }

  async updateRelays(): Promise<void> {
    const store = usePushStore.getState()

    if (!store.enabled || !store.isRegistered) return

    // Re-register with updated relay list
    await this.enable()
  }

  getStatus(): { enabled: boolean; registered: boolean; error: string | null } {
    const store = usePushStore.getState()
    return {
      enabled: store.enabled,
      registered: store.isRegistered,
      error: store.lastError
    }
  }
}

export const pushService = new PushService()
