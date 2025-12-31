import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { useRelayStore } from './stores/relayStore'
import { useContactStore } from './stores/contactStore'
import { useMessageStore } from './stores/messageStore'
import { notificationService } from './services/notifications'
import { backgroundService } from './services/backgroundService'
import { useAutoLock } from './hooks/useAutoLock'
import { useLockedNotifications } from './hooks/useLockedNotifications'
import Layout from './components/Layout'
import LockScreen from './components/LockScreen'
import SetupPassword from './components/SetupPassword'
import Onboarding from './pages/Onboarding'
import Chat from './pages/Chat'
import Contacts from './pages/Contacts'
import Settings from './pages/Settings'

function App() {
  const { keys, isLocked, hasPassword, publicInfo, isLoading, isInitialized, setupComplete, completeSetup, initialize: initAuth } = useAuthStore()
  const { initialize: initRelays, relays } = useRelayStore()
  const { initialize: initContacts } = useContactStore()
  const { initialize: initMessages, subscribeToMessages } = useMessageStore()

  // Count connected relays to re-subscribe when connections change
  const connectedCount = relays.filter(r => r.status === 'connected').length

  // Auto-lock after 5 minutes of inactivity
  useAutoLock(5 * 60 * 1000)

  // Show notifications even when locked
  useLockedNotifications()

  useEffect(() => {
    initAuth()
  }, [initAuth])

  // Initialize relays, notifications and background service when we have an account (even if locked)
  useEffect(() => {
    if (keys || (hasPassword && publicInfo)) {
      initRelays()
      notificationService.init()
      backgroundService.start()
    }
  }, [keys, hasPassword, publicInfo, initRelays])

  // Initialize contacts and messages only when unlocked
  useEffect(() => {
    if (keys) {
      initContacts()
      initMessages(keys.publicKey, keys.privateKey)
    }
  }, [keys, initContacts, initMessages])

  // Subscribe to messages when unlocked and relays are connected
  useEffect(() => {
    if (keys && connectedCount > 0) {
      const unsubscribe = subscribeToMessages(keys.publicKey, keys.privateKey)
      return unsubscribe
    }
  }, [keys, connectedCount, subscribeToMessages])

  if (!isInitialized || isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-theme-bg">
        <div className="flex flex-col items-center">
          <div className="animate-spin w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full mb-4" />
          <p className="text-theme-muted">Loading...</p>
        </div>
      </div>
    )
  }

  if (isLocked) {
    return <LockScreen />
  }

  if (!keys) {
    return (
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    )
  }

  // Show password setup screen for new accounts
  if (!setupComplete) {
    return <SetupPassword onComplete={completeSetup} />
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Chat />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="/onboarding" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
