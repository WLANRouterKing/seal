import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MantineProvider, createTheme } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import App from './App'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './index.css'
import './i18n'
import { useThemeStore } from './stores/themeStore'

// Load dev tools in development mode (exposes window.devTools)
if (import.meta.env.DEV) {
  import('./utils/devTools')
}
import { registerSW } from 'virtual:pwa-register'

const theme = createTheme({
  primaryColor: 'cyan',
  colors: {
    dark: [
      '#C1C2C5',
      '#A6A7AB',
      '#909296',
      '#5c5f66',
      '#373A40',
      '#2C2E33',
      '#25262b',
      '#1A1B1E',
      '#141517',
      '#0f0f0f',
    ],
  },
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  defaultRadius: 'md',
  cursorType: 'pointer',
})

// Register service worker with auto-update
const updateSW = registerSW({
  onNeedRefresh() {
    // Auto-update when new content is available
    updateSW(true)
  },
  onOfflineReady() {
    console.log('App ready to work offline')
  },
  onRegisteredSW(_swUrl, registration) {
    // Check for updates every hour
    if (registration) {
      setInterval(() => {
        registration.update()
      }, 60 * 60 * 1000)
    }
  }
})

// Extracted to separate component for fast refresh compatibility
export function Root() {
  const effectiveTheme = useThemeStore(state => state.getEffectiveTheme())

  return (
    <MantineProvider theme={theme} defaultColorScheme={effectiveTheme} forceColorScheme={effectiveTheme}>
      <Notifications position="top-right" />
      <App />
    </MantineProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </StrictMode>
)
