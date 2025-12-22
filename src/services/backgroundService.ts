// Background Service for keeping relay connections alive
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service'
import { relayPool } from './relay'

class BackgroundService {
  private isRunning = false
  private appStateListenerRegistered = false

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
      // Request permission for notifications (needed for foreground service)
      const permResult = await ForegroundService.requestPermissions()
      console.log('[BackgroundService] Permission result:', permResult)

      // Start foreground service
      await ForegroundService.startForegroundService({
        id: 1,
        title: 'Seal Messenger',
        body: 'Listening for new messages',
        smallIcon: 'ic_stat_notification',
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

    } catch (error) {
      console.error('[BackgroundService] Failed to start:', error)
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return

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

  private visibilityListenerRegistered = false

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
