import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Capacitor } from '@capacitor/core'

type Theme = 'dark' | 'light' | 'system'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  getEffectiveTheme: () => 'dark' | 'light'
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',

      setTheme: (theme: Theme) => {
        set({ theme })
        applyTheme(theme)
      },

      getEffectiveTheme: () => {
        const { theme } = get()
        if (theme === 'system') {
          return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        }
        return theme
      },
    }),
    {
      name: 'nostr-chat-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme)
        }
      },
    }
  )
)

function applyTheme(theme: Theme) {
  const root = document.documentElement
  const effectiveTheme =
    theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme

  root.classList.remove('dark', 'light')
  root.classList.add(effectiveTheme)

  // Set data-mantine-color-scheme for Mantine
  root.setAttribute('data-mantine-color-scheme', effectiveTheme)

  // Update meta theme-color for mobile browsers
  const metaThemeColor = document.querySelector('meta[name="theme-color"]')
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', effectiveTheme === 'dark' ? '#1a1b1e' : '#ffffff')
  }

  // Update native status bar on Android/iOS
  if (Capacitor.isNativePlatform()) {
    StatusBar.setStyle({ style: effectiveTheme === 'dark' ? Style.Light : Style.Dark })
    StatusBar.setBackgroundColor({ color: effectiveTheme === 'dark' ? '#1a1b1e' : '#ffffff' })
  }
}

// Listen for system theme changes
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const { theme } = useThemeStore.getState()
    if (theme === 'system') {
      applyTheme('system')
    }
  })
}
