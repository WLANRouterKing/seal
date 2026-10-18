import { Capacitor, registerPlugin } from '@capacitor/core'

interface NativeSecureUnlock {
  availability(): Promise<{ available: boolean; kind: string }>
  enroll(): Promise<{ id: string; secret: string }>
  unlock(options: { id: string }): Promise<{ id: string; secret: string }>
  remove(options: { id: string }): Promise<void>
}
const plugin = registerPlugin<NativeSecureUnlock>('SecureUnlock')
export function nativeUnlockProvider(): 'android' | 'ios' | 'desktop' | null {
  if (Capacitor.isNativePlatform()) {
    const platform = Capacitor.getPlatform()
    return platform === 'android' || platform === 'ios' ? platform : null
  }
  return typeof window !== 'undefined' && window.electronAPI?.secureUnlock ? 'desktop' : null
}
export function nativeUnlockBridge(): NativeSecureUnlock {
  if (nativeUnlockProvider() === 'desktop') {
    const bridge = window.electronAPI!.secureUnlock!
    return {
      availability: () => bridge.availability(),
      enroll: () => bridge.enroll(),
      unlock: ({ id }) => bridge.unlock(id),
      remove: ({ id }) => bridge.remove(id),
    }
  }
  return plugin
}
