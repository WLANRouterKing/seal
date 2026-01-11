import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { StatusBar } from '@capacitor/status-bar'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { useAuthStore } from './stores/authStore'
import { useRelayStore } from './stores/relayStore'
import { useContactStore } from './stores/contactStore'
import { useMessageStore } from './stores/messageStore'
import { useBlockedContactStore } from './stores/blockedContactStore'
import { nsecToPrivateKey, npubToPubkey } from './services/keys'
import { notificationService } from './services/notifications'
import { backgroundService } from './services/backgroundService'
import { pushService } from './services/pushService'
import { useAutoLock } from './hooks/useAutoLock'
import { useLockedNotifications } from './hooks/useLockedNotifications'
import Layout from './components/Layout'
import LockScreen from './components/LockScreen'
import SetupPassword from './components/SetupPassword'
import Onboarding from './pages/Onboarding'
import Chat from './pages/Chat'
import Contacts from './pages/Contacts'
import Settings from './pages/Settings'
import {Group, Paper, Stack} from "@mantine/core";
import {Rings} from "react-loader-spinner";

function App() {
  const { keys, isLocked, hasPassword, publicInfo, isLoading, isInitialized, setupComplete, completeSetup, initialize: initAuth } = useAuthStore()
  const { initialize: initRelays, relays } = useRelayStore()
  const { initialize: initContacts } = useContactStore()
  const { initialize: initMessages, subscribeToMessages, setActiveChat } = useMessageStore()
  const { initialize: initBlockedContacts } = useBlockedContactStore()

  // Count connected relays to re-subscribe when connections change
  const connectedCount = relays.filter(r => r.status === 'connected').length

  // Auto-lock after 5 minutes of inactivity
  useAutoLock(5 * 60 * 1000)

  // Show notifications even when locked
  useLockedNotifications()

  // Configure status bar on native platforms
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      StatusBar.setOverlaysWebView({ overlay: false })
    }
  }, [])

  // Handle deeplinks (e.g. com.seal.app://chat/{pubkey})
  useEffect(() => {
    const handleDeeplink = (event: { url: string }) => {
      console.log('[Deeplink] Received:', event.url)
      try {
        // Parse URL - handle both com.seal.app:// and seal:// schemes
        const url = new URL(event.url)
        const path = url.hostname + url.pathname // hostname contains first path segment for custom schemes

        if (path.startsWith('chat/')) {
          const pubkey = path.replace('chat/', '')
          if (pubkey) {
            console.log('[Deeplink] Opening chat with:', pubkey)
            setActiveChat(pubkey)
          }
        }
      } catch (error) {
        console.error('[Deeplink] Failed to parse URL:', error)
      }
    }

    // Listen for deeplinks when app is already running
    const listener = CapApp.addListener('appUrlOpen', handleDeeplink)

    // Check if app was opened via deeplink (cold start)
    CapApp.getLaunchUrl().then((result) => {
      if (result?.url) {
        handleDeeplink({ url: result.url })
      }
    })

    return () => {
      listener.then(l => l.remove())
    }
  }, [setActiveChat])

  useEffect(() => {
    initAuth()
  }, [initAuth])

    // Initialize relays, notifications and background service when we have an account (even if locked)
    useEffect(() => {
        if (keys || (hasPassword && publicInfo)) {
            initRelays()
            notificationService.init().then(() => {
                backgroundService.start().then(() => {
                    pushService.init()
                })
            })
        }
    }, [keys, hasPassword, publicInfo, initRelays])

    // Initialize contacts and messages only when unlocked
    useEffect(() => {
        if (keys) {
            const pubkey = npubToPubkey(keys.npub)
            const privateKey = nsecToPrivateKey(keys.nsec)
            if (pubkey && privateKey) {
                initBlockedContacts().then(() => {
                    initContacts().then(() => initMessages(pubkey, privateKey))
                })

            }
        }
    }, [keys, initContacts, initMessages])

    // Subscribe to messages when unlocked and relays are connected
    useEffect(() => {
        if (keys && connectedCount > 0) {
            const pubkey = npubToPubkey(keys.npub)
            const privateKey = nsecToPrivateKey(keys.nsec)
            if (pubkey && privateKey) {
                return subscribeToMessages(pubkey, privateKey)
            }
        }
    }, [keys, connectedCount, subscribeToMessages])

    if (!isInitialized || isLoading) {
        return (
            <Stack h="100%" gap={0}>
                <Paper p="sm" radius={0} style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <Group
                        style={{flex: 1, alignItems: 'center', justifyContent: 'center', height: '100vh', minWidth: 0}}>
                        <Rings
                            visible={true}
                            height="80"
                            width="80"
                            color="cyan"
                            ariaLabel="rings-loading"
                            wrapperStyle={{}}
                            wrapperClass=""
                        />
                    </Group>
                </Paper>
            </Stack>
        )
    }

    if (isLocked) {
        return <LockScreen/>
    }

    if (!keys) {
        return (
            <Routes>
                <Route path="/onboarding" element={<Onboarding/>}/>
                <Route path="*" element={<Navigate to="/onboarding" replace/>}/>
            </Routes>
        )
    }

    // Show password setup screen for new accounts
    if (!setupComplete) {
        return <SetupPassword onComplete={completeSetup}/>
    }

    return (
        <Routes>
            <Route element={<Layout/>}>
                <Route path="/" element={<Chat/>}/>
                <Route path="/contacts" element={<Contacts/>}/>
                <Route path="/settings" element={<Settings/>}/>
            </Route>
            <Route path="/onboarding" element={<Navigate to="/" replace/>}/>
            <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes>
    )
}

export default App
