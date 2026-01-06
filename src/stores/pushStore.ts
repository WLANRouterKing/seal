import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PushState {
  // Settings
  enabled: boolean
  pushServerUrl: string
  ntfyServerUrl: string
  ntfyTopic: string | null

  // State
  isRegistered: boolean
  lastError: string | null

  // Actions
  setEnabled: (enabled: boolean) => void
  setPushServerUrl: (url: string) => void
  setNtfyServerUrl: (url: string) => void
  setNtfyTopic: (topic: string | null) => void
  setRegistered: (registered: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

const DEFAULT_PUSH_SERVER = 'https://push.sealchat.app'
const DEFAULT_NTFY_SERVER = 'https://ntfy.sh'

// Generate a random topic for this device
function generateNtfyTopic(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = 'seal-'
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export const usePushStore = create<PushState>()(
  persist(
    (set) => ({
      enabled: false,
      pushServerUrl: DEFAULT_PUSH_SERVER,
      ntfyServerUrl: DEFAULT_NTFY_SERVER,
      ntfyTopic: null,
      isRegistered: false,
      lastError: null,

      setEnabled: (enabled) => set({ enabled }),

      setPushServerUrl: (url) => set({
        pushServerUrl: url,
        isRegistered: false // Need to re-register with new server
      }),

      setNtfyServerUrl: (url) => set({ ntfyServerUrl: url }),

      setNtfyTopic: (topic) => set({ ntfyTopic: topic }),

      setRegistered: (registered) => set({ isRegistered: registered }),

      setError: (error) => set({ lastError: error }),

      reset: () => set({
        enabled: false,
        pushServerUrl: DEFAULT_PUSH_SERVER,
        ntfyServerUrl: DEFAULT_NTFY_SERVER,
        ntfyTopic: null,
        isRegistered: false,
        lastError: null,
      }),
    }),
    {
      name: 'seal-push-storage',
      version: 1,
    }
  )
)

export { generateNtfyTopic, DEFAULT_PUSH_SERVER, DEFAULT_NTFY_SERVER }
