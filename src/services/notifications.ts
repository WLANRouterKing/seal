// Notifications Service with Capacitor Local Notifications support for Android
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

type NotificationCallback = (data: { senderPubkey: string }) => void

class NotificationService {
  private permission: NotificationPermission = 'default'
  private enabled: boolean = true
  private isNativePlatform: boolean = false
  private onNotificationTap: NotificationCallback | null = null
  private pushToken: string | null = null
  private notificationId: number = 0

  async init(): Promise<boolean> {
    this.isNativePlatform = Capacitor.isNativePlatform()

    if (this.isNativePlatform) {
      return this.initNativeNotifications()
    } else {
      return this.initWebNotifications()
    }
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
    if (this.isNativePlatform) {
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
              iconColor: '#0ea5e9'
            }
          ]
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
    if (!this.isEnabled()) return

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
        silent: options?.silent ?? false
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

  async showMessageNotification(
    senderName: string,
    messagePreview: string,
    senderPubkey: string
  ): Promise<void> {
    console.log('[Notifications] Showing message notification:', {
      senderName,
      permission: this.permission,
      enabled: this.enabled,
      isNative: this.isNativePlatform,
      hasFocus: typeof document !== 'undefined' ? document.hasFocus() : false
    })

    if (this.isNativePlatform) {
      // On native: show simple notification without message content (privacy)
      await this.showNotification('Seal', {
        body: 'New encrypted message',
        tag: `message-${senderPubkey}`,
        data: { senderPubkey }
      })
    } else {
      // On web: show full notification with sender and preview
      let preview = messagePreview
      const hasImage = messagePreview.includes('[img:data:image/')
      const textContent = messagePreview.replace(/\[img:data:image\/[^\]]+\]/g, '').trim()

      if (hasImage && textContent) {
        preview = `📷 ${textContent}`
      } else if (hasImage) {
        preview = '📷 Photo'
      }

      if (preview.length > 100) {
        preview = preview.substring(0, 100) + '...'
      }

      await this.showNotification(senderName, {
        body: preview,
        tag: `message-${senderPubkey}`,
        data: { senderPubkey }
      })
    }
  }
}

export const notificationService = new NotificationService()
