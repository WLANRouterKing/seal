import {useEffect} from 'react'
import {Navigate, Route, Routes} from 'react-router-dom'
import {StatusBar} from '@capacitor/status-bar'
import {Capacitor} from '@capacitor/core'
import {useAuthStore} from './stores/authStore'
import {useRelayStore} from './stores/relayStore'
import {useContactStore} from './stores/contactStore'
import {useMessageStore} from './stores/messageStore'
import {npubToPubkey, nsecToPrivateKey} from './services/keys'
import {notificationService} from './services/notifications'
import {backgroundService} from './services/backgroundService'
import {pushService} from './services/pushService'
import {useAutoLock} from './hooks/useAutoLock'
import {useLockedNotifications} from './hooks/useLockedNotifications'
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
    const {
        keys,
        isLocked,
        hasPassword,
        publicInfo,
        isLoading,
        isInitialized,
        setupComplete,
        completeSetup,
        initialize: initAuth
    } = useAuthStore()
    const {initialize: initRelays, relays} = useRelayStore()
    const {initialize: initContacts} = useContactStore()
    const {initialize: initMessages, subscribeToMessages} = useMessageStore()

    // Count connected relays to re-subscribe when connections change
    const connectedCount = relays.filter(r => r.status === 'connected').length

    // Auto-lock after 5 minutes of inactivity
    useAutoLock(5 * 60 * 1000)

    // Show notifications even when locked
    useLockedNotifications()

    // Configure status bar on native platforms
    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            StatusBar.setOverlaysWebView({overlay: false})
        }
    }, [])

    useEffect(() => {
        initAuth()
    }, [initAuth])

    // Initialize relays, notifications and background service when we have an account (even if locked)
    useEffect(() => {
        if (keys || (hasPassword && publicInfo)) {
            initRelays()
            notificationService.init()
            backgroundService.start()
            pushService.init()
        }
    }, [keys, hasPassword, publicInfo, initRelays])

    // Initialize contacts and messages only when unlocked
    useEffect(() => {
        if (keys) {
            const pubkey = npubToPubkey(keys.npub)
            const privateKey = nsecToPrivateKey(keys.nsec)
            if (pubkey && privateKey) {
                initContacts()
                initMessages(pubkey, privateKey)
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
                    <Group style={{flex: 1, alignItems: 'center', justifyContent: 'center', height: '100vh', minWidth: 0}}>
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
        return <LockScreen />
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
