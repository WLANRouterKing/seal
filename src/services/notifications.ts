// Notifications Service with Capacitor Push Notifications support for Android
import { Capacitor } from '@capacitor/core'
import { PushNotifications, type Token, type ActionPerformed, type PushNotificationSchema } from '@capacitor/push-notifications'
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

      // Check push notification permission status
      let permStatus = await PushNotifications.checkPermissions()
      console.log('[Notifications] Push permission status:', permStatus.receive)

      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions()
      }

      if (permStatus.receive !== 'granted') {
        console.warn('[Notifications] Push notifications not granted')
        // Still allow local notifications
      }

      // Try to register for push notifications if granted
      if (permStatus.receive === 'granted') {
        await PushNotifications.register()

        // Listen for registration success
        PushNotifications.addListener('registration', (token: Token) => {
          this.pushToken = token.value
          console.log('[Notifications] Push registration success, token:', token.value)
        })

        // Listen for registration errors
        PushNotifications.addListener('registrationError', (error) => {
          console.error('[Notifications] Push registration error:', error)
        })

        // Listen for push notifications received while app is in foreground
        PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
          console.log('[Notifications] Push received in foreground:', notification)
          this.showLocalNotification(notification.title || 'New message', {
            body: notification.body,
            data: notification.data
          })
        })

        // Listen for notification tap actions
        PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
          console.log('[Notifications] Push notification action:', action)
          const data = action.notification.data
          if (data?.senderPubkey && this.onNotificationTap) {
            this.onNotificationTap({ senderPubkey: data.senderPubkey })
          }
        })
      }

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
      const pushResult = await PushNotifications.requestPermissions()
      const granted = localResult.display === 'granted' || pushResult.receive === 'granted'
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
    // Format preview - handle images
    let preview = messagePreview
    const hasImage = messagePreview.includes('[img:data:image/')
    const textContent = messagePreview.replace(/\[img:data:image\/[^\]]+\]/g, '').trim()

    if (hasImage && textContent) {
      preview = `📷 ${textContent}`
    } else if (hasImage) {
      preview = '📷 Photo'
    }

    // Truncate if too long
    if (preview.length > 100) {
      preview = preview.substring(0, 100) + '...'
    }

    console.log('[Notifications] Showing message notification:', {
      senderName,
      preview,
      permission: this.permission,
      enabled: this.enabled,
      isNative: this.isNativePlatform,
      hasFocus: typeof document !== 'undefined' ? document.hasFocus() : false
    })

    await this.showNotification(senderName, {
      body: preview,
      tag: `message-${senderPubkey}`,
      data: { senderPubkey }
    })
  }
}

export const notificationService = new NotificationService()
