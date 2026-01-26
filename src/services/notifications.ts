// Notifications Service with Capacitor Local Notifications support for Android
// and Electron Notifications support for Desktop
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

// Electron API type declaration
declare global {
  interface Window {
    electronAPI?: {
      showNotification: (title: string, body: string) => Promise<void>
      isElectron: boolean
    }
  }
}

type NotificationCallback = (data: { senderPubkey: string }) => void

// Check if running in Electron
const isElectron = (): boolean => {
  return window.electronAPI?.isElectron === true
}

class NotificationService {
  private permission: NotificationPermission = 'default'
  private enabled: boolean = true
  private isNativePlatform: boolean = false
  private isElectronPlatform: boolean = false
  private onNotificationTap: NotificationCallback | null = null
  private pushToken: string | null = null
  private notificationId: number = 0

  async init(): Promise<boolean> {
    this.isElectronPlatform = isElectron()
    this.isNativePlatform = Capacitor.isNativePlatform()

    if (this.isElectronPlatform) {
      return this.initElectronNotifications()
    } else if (this.isNativePlatform) {
      return this.initNativeNotifications()
    } else {
      return this.initWebNotifications()
    }
  }

  private async initElectronNotifications(): Promise<boolean> {
    // Electron uses native Notification API which is always available
    // No permission request needed, they just work
    this.permission = 'granted'
    console.log('[Notifications] Electron notifications initialized')
    return true
  }

  private async initWebNotifications(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications')
      return false
    }

    this.permission = Notification.permission
    console.log('[Notifications] Web permission:', this.permission)

    if (this.permission === 'default') {
      this.permission = await Notification.requestPermission()
      console.log('[Notifications] Web permission after request:', this.permission)
    }

    return this.permission === 'granted'
  }

  private async initNativeNotifications(): Promise<boolean> {
    try {
      // Request local notification permissions
      const localPermStatus = await LocalNotifications.requestPermissions()
      console.log('[Notifications] Local notification permission:', localPermStatus.display)

      // Listen for local notification taps
      LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        console.log('[Notifications] Local notification action:', action)
        const data = action.notification.extra
        if (data?.senderPubkey && this.onNotificationTap) {
          this.onNotificationTap({ senderPubkey: data.senderPubkey })
        }
      })

      this.permission = localPermStatus.display === 'granted' ? 'granted' : 'denied'
      return this.permission === 'granted'
    } catch (error) {
      console.error('[Notifications] Failed to initialize native notifications:', error)
      return false
    }
  }

  async requestPermission(): Promise<boolean> {
    if (this.isElectronPlatform) {
      // Electron notifications are always available
      this.permission = 'granted'
      return true
    }

    if (this.isNativePlatform) {
      const localResult = await LocalNotifications.requestPermissions()
      const granted = localResult.display === 'granted'
      if (granted) this.permission = 'granted'
      return granted
    }

    if (!('Notification' in window)) return false
    this.permission = await Notification.requestPermission()
    return this.permission === 'granted'
  }

  isSupported(): boolean {
    if (this.isElectronPlatform || this.isNativePlatform) {
      return true
    }
    return 'Notification' in window
  }

  isEnabled(): boolean {
    return this.enabled && this.permission === 'granted'
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  getPermission(): NotificationPermission {
    return this.permission
  }

  getPushToken(): string | null {
    return this.pushToken
  }

  setOnNotificationTap(callback: NotificationCallback): void {
    this.onNotificationTap = callback
  }

  private async showLocalNotification(
    title: string,
    options?: {
      body?: string
      icon?: string
      tag?: string
      data?: Record<string, string>
      silent?: boolean
    }
  ): Promise<void> {
    if (!this.isEnabled()) return

    if (this.isNativePlatform) {
      try {
        this.notificationId++
        await LocalNotifications.schedule({
          notifications: [
            {
              id: this.notificationId,
              title: title,
              body: options?.body || '',
              extra: options?.data,
              sound: options?.silent ? undefined : 'default',
              smallIcon: 'ic_stat_notification',
              iconColor: '#0ea5e9',
            },
          ],
        })
        console.log('[Notifications] Local notification scheduled:', title)
      } catch (error) {
        console.error('[Notifications] Failed to show local notification:', error)
      }
    } else {
      await this.showNotification(title, options)
    }
  }

  async showNotification(
    title: string,
    options?: {
      body?: string
      icon?: string
      tag?: string
      data?: Record<string, string>
      silent?: boolean
    }
  ): Promise<void> {
    if (!this.isEnabled()) {
      console.log('[Notifications] Skipping notification - not enabled:', {
        enabled: this.enabled,
        permission: this.permission,
      })
      return
    }

    // Electron platform
    if (this.isElectronPlatform) {
      try {
        await window.electronAPI?.showNotification(title, options?.body || '')
        console.log('[Notifications] Electron notification sent:', title)
      } catch (error) {
        console.error('[Notifications] Failed to show Electron notification:', error)
      }
      return
    }

    // Capacitor native platform
    if (this.isNativePlatform) {
      await this.showLocalNotification(title, options)
      return
    }

    // Web platform
    try {
      const notification = new Notification(title, {
        body: options?.body,
        icon: options?.icon || '/favicon.svg',
        tag: options?.tag,
        data: options?.data,
        silent: options?.silent ?? false,
      })

      notification.onclick = () => {
        window.focus()
        if (options?.data?.senderPubkey && this.onNotificationTap) {
          this.onNotificationTap({ senderPubkey: options.data.senderPubkey })
        }
        notification.close()
      }

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000)
    } catch (error) {
      console.error('[Notifications] Failed to show web notification:', error)
    }
  }

  async showMessageNotification(senderName: string, senderPubkey: string): Promise<void> {
    console.log('[Notifications] Attempting to show message notification:', {
      senderName,
      permission: this.permission,
      enabled: this.enabled,
      isNative: this.isNativePlatform,
      isElectron: this.isElectronPlatform,
      isEnabled: this.isEnabled(),
    })

    // If not enabled, try to request permission
    if (!this.isEnabled() && this.permission !== 'denied') {
      console.log('[Notifications] Not enabled, requesting permission...')
      await this.requestPermission()
    }

    // show simple notification without message content (privacy)
    await this.showNotification('Seal', {
      body: 'New message',
      tag: `message-${senderPubkey}`,
      data: { senderPubkey },
    })
  }
}

export const notificationService = new NotificationService()
