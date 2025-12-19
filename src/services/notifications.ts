// Web Notifications Service for new messages

class NotificationService {
  private permission: NotificationPermission = 'default'
  private enabled: boolean = true

  async init(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications')
      return false
    }

    this.permission = Notification.permission
    console.log('Notification permission:', this.permission)

    if (this.permission === 'default') {
      this.permission = await Notification.requestPermission()
      console.log('Notification permission after request:', this.permission)
    }

    return this.permission === 'granted'
  }

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false

    this.permission = await Notification.requestPermission()
    return this.permission === 'granted'
  }

  isSupported(): boolean {
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

  async showNotification(
    title: string,
    options?: {
      body?: string
      icon?: string
      tag?: string
      data?: unknown
      silent?: boolean
    }
  ): Promise<void> {
    if (!this.isEnabled()) return

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
        notification.close()
      }

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000)
    } catch (error) {
      console.error('Failed to show notification:', error)
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

    console.log('Showing notification:', { senderName, preview, permission: this.permission, enabled: this.enabled, hasFocus: document.hasFocus() })

    await this.showNotification(senderName, {
      body: preview,
      tag: `message-${senderPubkey}`,
      data: { senderPubkey }
    })
  }
}

export const notificationService = new NotificationService()
