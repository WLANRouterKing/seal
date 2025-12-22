// Background Service for keeping relay connections alive
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service'
import { BatteryOptimization } from '@capawesome-team/capacitor-android-battery-optimization'
import { relayPool } from './relay'

class BackgroundService {
  private isRunning = false
  private appStateListenerRegistered = false
  private visibilityListenerRegistered = false
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null

  async start(): Promise<void> {
    // Always register visibility listener for PWA/browser
    this.registerVisibilityListener()

    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      console.log('[BackgroundService] Not on Android, skipping foreground service')
      return
    }

    if (this.isRunning) {
      console.log('[BackgroundService] Already running')
      return
    }

    try {
      // Request battery optimization exemption first
      await this.requestBatteryOptimizationExemption()

      // Request permission for notifications (needed for foreground service)
      const permResult = await ForegroundService.requestPermissions()
      console.log('[BackgroundService] Permission result:', permResult)

      // Start foreground service with dataSync type for better persistence
      await ForegroundService.startForegroundService({
        id: 1,
        title: 'Seal Messenger',
        body: 'Listening for new messages',
        smallIcon: 'ic_stat_notification',
        silent: true, // Don't make sound on updates
        buttons: [
          {
            title: 'Open',
            id: 1
          }
        ]
      })

      this.isRunning = true
      console.log('[BackgroundService] Started successfully')

      // Listen for button clicks
      ForegroundService.addListener('buttonClicked', (event) => {
        console.log('[BackgroundService] Button clicked:', event)
        // Button click will bring app to foreground automatically
      })

      // Register app state listener to reconnect relays on resume
      this.registerAppStateListener()

      // Start periodic health check for relay connections
      this.startHealthCheck()

    } catch (error) {
      console.error('[BackgroundService] Failed to start:', error)
    }
  }

  private async requestBatteryOptimizationExemption(): Promise<void> {
    try {
      const { enabled } = await BatteryOptimization.isBatteryOptimizationEnabled()

      if (enabled) {
        console.log('[BackgroundService] Battery optimization is enabled, requesting exemption...')
        await BatteryOptimization.requestIgnoreBatteryOptimization()
        console.log('[BackgroundService] Battery optimization exemption requested')
      } else {
        console.log('[BackgroundService] Battery optimization already disabled')
      }
    } catch (error) {
      console.error('[BackgroundService] Failed to request battery optimization exemption:', error)
      // Continue anyway - the service might still work
    }
  }

  private startHealthCheck(): void {
    // Check relay connections every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      const connectedUrls = relayPool.getConnectedUrls()
      console.log(`[BackgroundService] Health check: ${connectedUrls.length} relays connected`)

      // If no relays connected, try to reconnect
      if (connectedUrls.length === 0) {
        console.log('[BackgroundService] No relays connected, attempting reconnect...')
        await relayPool.reconnectAll()
      }

      // Update notification with connection status
      if (this.isRunning) {
        const status = connectedUrls.length > 0
          ? `Connected to ${connectedUrls.length} relays`
          : 'Reconnecting...'
        await this.updateNotification(status)
      }
    }, 30000) // 30 seconds
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return

    this.stopHealthCheck()

    try {
      await ForegroundService.stopForegroundService()
      this.isRunning = false
      console.log('[BackgroundService] Stopped')
    } catch (error) {
      console.error('[BackgroundService] Failed to stop:', error)
    }
  }

  async updateNotification(body: string): Promise<void> {
    if (!this.isRunning) return

    try {
      await ForegroundService.updateForegroundService({
        id: 1,
        title: 'Seal Messenger',
        body,
        smallIcon: 'ic_stat_notification'
      })
    } catch (error) {
      console.error('[BackgroundService] Failed to update notification:', error)
    }
  }

  isServiceRunning(): boolean {
    return this.isRunning
  }

  private registerAppStateListener(): void {
    if (this.appStateListenerRegistered) return

    App.addListener('appStateChange', async ({ isActive }) => {
      console.log(`[BackgroundService] App state changed: ${isActive ? 'foreground' : 'background'}`)

      if (isActive) {
        // App came to foreground - reconnect relays
        console.log('[BackgroundService] Reconnecting relays...')
        await relayPool.reconnectAll()
      }
    })

    // Also handle resume event explicitly
    App.addListener('resume', async () => {
      console.log('[BackgroundService] App resumed, reconnecting relays...')
      await relayPool.reconnectAll()
    })

    this.appStateListenerRegistered = true
    console.log('[BackgroundService] App state listener registered')
  }

  private registerVisibilityListener(): void {
    if (this.visibilityListenerRegistered) return

    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        console.log('[BackgroundService] Page became visible, reconnecting relays...')
        await relayPool.reconnectAll()
      }
    })

    this.visibilityListenerRegistered = true
    console.log('[BackgroundService] Visibility listener registered')
  }
}

export const backgroundService = new BackgroundService()
