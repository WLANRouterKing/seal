// Background Service for keeping relay connections alive
import { Capacitor } from '@capacitor/core'
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service'

class BackgroundService {
  private isRunning = false

  async start(): Promise<void> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      console.log('[BackgroundService] Not on Android, skipping')
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
}

export const backgroundService = new BackgroundService()
