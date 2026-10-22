import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Center, Loader, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { hasLinkedVault } from '../services/devices/storage'
import Onboarding from './Onboarding'
import LinkDevice from './LinkDevice'
import Privacy from './Privacy'

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
  return (
    <Routes>
      <Route path="/link-device" element={<LinkDevice />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="*" element={<EntryGate key={location.pathname} inviteHash={inviteHash} />} />
    </Routes>
  )
}
