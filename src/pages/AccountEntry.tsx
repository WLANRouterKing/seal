import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Center, Loader, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { hasLinkedVault } from '../services/devices/storage'
import Onboarding from './Onboarding'
import LinkDevice from './LinkDevice'
import Privacy from './Privacy'
import Layout from '../components/Layout'
import Chat from './Chat'
import Contacts from './Contacts'
import LinkedAppSettings from '../components/settings/LinkedAppSettings'
import { useLinkedAppStore } from '../stores/linkedAppStore'

/** A linked installation intentionally has no account nsec. Do not treat it as a new account. */
function EntryGate({ inviteHash }: { inviteHash: string }) {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [accountMode, setAccountMode] = useState(false)
  const [linked, setLinked] = useState<boolean | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    hasLinkedVault().then(
      (exists) => {
        if (active) setLinked(exists)
      },
      () => {
        if (active) setFailed(true)
      }
    )
    return () => {
      active = false
    }
  }, [])
  if (failed) return <Alert color="red">{t('devices.storageFailed')}</Alert>
  if (linked === null)
    return (
      <Center h="100dvh">
        <Loader aria-label={t('devices.checking')} />
      </Center>
    )
  if (linked) {
    if (accountMode) return <Onboarding />
    return (
      <Center mih="100dvh" p="md">
        <Stack maw={420}>
          <Text size="xl" fw={600}>
            {t('devices.entryTitle')}
          </Text>
          <Text>{t('devices.entryDescription')}</Text>
          <Button onClick={() => navigate('/link-device')}>{t('devices.resume')}</Button>
          <Button variant="default" onClick={() => setAccountMode(true)}>
            {t('devices.useAccount')}
          </Button>
        </Stack>
      </Center>
    )
  }
  if (location.pathname !== '/onboarding') return <Navigate to={`/onboarding${inviteHash}`} replace />
  return <Onboarding />
}

export default function AccountEntry({ inviteHash }: { inviteHash: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  const active = useLinkedAppStore((state) => state.active)
  useEffect(() => {
    if (!active) return
    let timer: ReturnType<typeof setTimeout>
    const lock = () => {
      useLinkedAppStore.getState().lock()
      navigate('/link-device', { replace: true })
    }
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(lock, 5 * 60 * 1000)
    }
    const hidden = () => {
      if (document.hidden) lock()
    }
    const unsubscribe = useLinkedAppStore.subscribe((state) => {
      if (!state.active) navigate('/link-device', { replace: true })
    })
    window.addEventListener('pointerdown', reset)
    window.addEventListener('keydown', reset)
    document.addEventListener('visibilitychange', hidden)
    reset()
    return () => {
      clearTimeout(timer)
      unsubscribe()
      window.removeEventListener('pointerdown', reset)
      window.removeEventListener('keydown', reset)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [active, navigate])
  if (active)
    return (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Chat />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/settings" element={<LinkedAppSettings />} />
        </Route>
        <Route path="/privacy" element={<Privacy />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  return (
    <Routes>
      <Route path="/link-device" element={<LinkDevice />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="*" element={<EntryGate key={location.pathname} inviteHash={inviteHash} />} />
    </Routes>
  )
}
