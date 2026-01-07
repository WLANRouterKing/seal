// Push Notification Service
// Handles registration with seal-push-server
// Uses UnifiedPush on Android, SSE on Web/Electron

import { Capacitor, registerPlugin } from '@capacitor/core'
import { usePushStore, generateNtfyTopic } from '../stores/pushStore'
import { useRelayStore } from '../stores/relayStore'
import { useAuthStore } from '../stores/authStore'
import { notificationService } from './notifications'

// Check if running in Electron
const isElectron = (): boolean => {
  return window.electronAPI?.isElectron === true
}

// Check if running on Android
const isAndroid = (): boolean => {
  return Capacitor.getPlatform() === 'android'
}

// UnifiedPush plugin interface
interface UnifiedPushPlugin {
  register(): Promise<{ distributor: string }>
  unregister(): Promise<void>
  getEndpoint(): Promise<{ endpoint: string | null }>
  getDistributors(): Promise<{ distributors: string[]; count: number }>
  isRegistered(): Promise<{ registered: boolean }>
  addListener(
    eventName: 'onEndpoint',
    callback: (data: { endpoint: string }) => void
  ): Promise<{ remove: () => void }>
  addListener(
    eventName: 'onMessage',
    callback: (data: { message: string }) => void
  ): Promise<{ remove: () => void }>
  addListener(
    eventName: 'onRegistrationFailed',
    callback: (data: { reason: string }) => void
  ): Promise<{ remove: () => void }>
  addListener(
    eventName: 'onUnregistered',
    callback: () => void
  ): Promise<{ remove: () => void }>
}

// Register the native plugin (only available on Android)
const UnifiedPush = isAndroid()
  ? registerPlugin<UnifiedPushPlugin>('UnifiedPush')
  : null

class PushService {
  private ntfyEventSource: EventSource | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private isInitialized: boolean = false
  private listenerRemovers: Array<{ remove: () => void }> = []

  async init(): Promise<void> {
    if (this.isInitialized) return
    this.isInitialized = true

    const { enabled, isRegistered } = usePushStore.getState()

    if (isAndroid() && UnifiedPush) {
      // Setup UnifiedPush listeners
      await this.setupUnifiedPushListeners()

      // Check if already registered with UnifiedPush
      const { endpoint } = await UnifiedPush.getEndpoint()
      if (endpoint && enabled) {
        usePushStore.getState().setUnifiedPushEndpoint(endpoint)
        console.log('[PushService] UnifiedPush endpoint restored:', endpoint)
      }
    } else if (enabled && isRegistered) {
      // Web/Electron: Reconnect to ntfy on app restart
      await this.connectToNtfy()
    }

    console.log('[PushService] Initialized', { enabled, isRegistered, platform: Capacitor.getPlatform() })
  }

  private async setupUnifiedPushListeners(): Promise<void> {
    if (!UnifiedPush) return

    // Listen for new endpoint
    const endpointListener = await UnifiedPush.addListener('onEndpoint', async (data) => {
      console.log('[PushService] UnifiedPush endpoint received:', data.endpoint)
      usePushStore.getState().setUnifiedPushEndpoint(data.endpoint)

      // Register with push server using the new endpoint
      try {
        await this.registerWithPushServer(data.endpoint)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to register with push server'
        console.error('[PushService] Push server registration failed:', error)
        usePushStore.getState().setError(message)
      }
    })
    this.listenerRemovers.push(endpointListener)

    // Listen for messages (when app is in foreground)
    const messageListener = await UnifiedPush.addListener('onMessage', (data) => {
      console.log('[PushService] UnifiedPush message received:', data.message)
      // Notification is already shown by native code
      // This is just for handling in-app if needed
    })
    this.listenerRemovers.push(messageListener)

    // Listen for registration failures
    const failListener = await UnifiedPush.addListener('onRegistrationFailed', (data) => {
      console.error('[PushService] UnifiedPush registration failed:', data.reason)
      usePushStore.getState().setError(`Registration failed: ${data.reason}`)
    })
    this.listenerRemovers.push(failListener)

    // Listen for unregistration
    const unregListener = await UnifiedPush.addListener('onUnregistered', () => {
      console.log('[PushService] UnifiedPush unregistered')
      usePushStore.getState().setUnifiedPushEndpoint(null)
      usePushStore.getState().setRegistered(false)
    })
    this.listenerRemovers.push(unregListener)
  }

  async enable(): Promise<boolean> {
    const store = usePushStore.getState()
    const authStore = useAuthStore.getState()

    if (!authStore.keys?.npub) {
      store.setError('Not logged in')
      return false
    }

    try {
      if (isAndroid() && UnifiedPush) {
        // Android: Use UnifiedPush
        return await this.enableUnifiedPush()
      } else {
        // Web/Electron: Use SSE
        return await this.enableSSE()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed'
      store.setError(message)
      console.error('[PushService] Registration failed:', error)
      return false
    }
  }

  private async enableUnifiedPush(): Promise<boolean> {
    if (!UnifiedPush) return false

    const store = usePushStore.getState()

    // Check for distributors
    const { distributors, count } = await UnifiedPush.getDistributors()
    console.log('[PushService] Available distributors:', distributors)

    if (count === 0) {
      store.setError('No UnifiedPush distributor found. Please install the ntfy app from F-Droid.')
      return false
    }

    // Register with UnifiedPush
    const { distributor } = await UnifiedPush.register()
    console.log('[PushService] Registered with distributor:', distributor)

    store.setEnabled(true)
    store.setError(null)

    // The endpoint will come async via the onEndpoint listener
    // Registration with push server happens there
    return true
  }

  private async enableSSE(): Promise<boolean> {
    const store = usePushStore.getState()
    const authStore = useAuthStore.getState()
    const relayStore = useRelayStore.getState()

    // Generate topic if not exists
    let topic = store.ntfyTopic
    if (!topic) {
      topic = generateNtfyTopic()
      store.setNtfyTopic(topic)
    }

    // Register with push server
    const response = await fetch(`${store.pushServerUrl}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        npub: authStore.keys!.npub,
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

    console.log('[PushService] SSE registered successfully', { topic })
    return true
  }

  private async registerWithPushServer(endpoint: string): Promise<void> {
    const store = usePushStore.getState()
    const authStore = useAuthStore.getState()
    const relayStore = useRelayStore.getState()

    if (!authStore.keys?.npub) {
      throw new Error('Not logged in')
    }

    const requestBody = {
      npub: authStore.keys.npub,
      endpoint: endpoint, // UnifiedPush endpoint URL
      relays: relayStore.activeRelayUrls
    }

    console.log('[PushService] Registering with push server:', {
      pushServerUrl: store.pushServerUrl,
      endpoint: endpoint,
      relayCount: relayStore.activeRelayUrls.length,
      relays: relayStore.activeRelayUrls
    })

    // Register with push server using UnifiedPush endpoint
    const response = await fetch(`${store.pushServerUrl}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('[PushService] Push server error:', response.status, error)
      throw new Error(error || `HTTP ${response.status}`)
    }

    store.setRegistered(true)
    console.log('[PushService] Registered with push server using UnifiedPush endpoint')
  }

  async disable(): Promise<void> {
    const store = usePushStore.getState()
    const authStore = useAuthStore.getState()

    if (isAndroid() && UnifiedPush) {
      // Android: Unregister from UnifiedPush
      try {
        await UnifiedPush.unregister()
      } catch (error) {
        console.warn('[PushService] UnifiedPush unregister failed:', error)
      }
      store.setUnifiedPushEndpoint(null)
    } else {
      // Web/Electron: Disconnect from ntfy
      this.disconnectFromNtfy()
    }

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
    if (isAndroid() && store.unifiedPushEndpoint) {
      await this.registerWithPushServer(store.unifiedPushEndpoint)
    } else {
      await this.enable()
    }
  }

  getStatus(): { enabled: boolean; registered: boolean; error: string | null } {
    const store = usePushStore.getState()
    return {
      enabled: store.enabled,
      registered: store.isRegistered,
      error: store.lastError
    }
  }

  // Check if UnifiedPush is available (Android only)
  async hasUnifiedPushDistributor(): Promise<boolean> {
    if (!isAndroid() || !UnifiedPush) return false

    const { count } = await UnifiedPush.getDistributors()
    return count > 0
  }
}

export const pushService = new PushService()
