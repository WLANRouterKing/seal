import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Code,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  Textarea,
} from '@mantine/core'
import { IconArrowLeft, IconDevices, IconQrcode } from '@tabler/icons-react'
import { QRCodeScanner } from '../sync/QRCodeScanner'
import { getPrimarySession, onDevicesChanged } from '../../services/devices/primary'
import { inspectRequest, now, type InspectedRequest } from '../../services/devices/protocol'
import type { LinkedDevice, PrimarySession } from '../../services/devices/session'

export default function LinkedDevices({ onBack }: { onBack(): void }) {
  const { t } = useTranslation()
  const [session, setSession] = useState<PrimarySession>()
  const [devices, setDevices] = useState<LinkedDevice[]>([])
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [input, setInput] = useState('')
  const [request, setRequest] = useState<InspectedRequest>()
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<string>()
  const [clock, setClock] = useState(now())
  useEffect(() => {
    let alive = true
    const update = () => {
      getPrimarySession()
        .then((value) => {
          if (alive) {
            setSession(value)
            setDevices(value.list())
          }
        })
        .catch((err) => {
          if (alive) setError(err.message)
        })
    }
    update()
    const unsubscribe = onDevicesChanged(update)
    const timer = setInterval(() => setClock(now()), 1000)
    return () => {
      alive = false
      unsubscribe()
      clearInterval(timer)
    }
  }, [])
  const inspect = useCallback((text: string) => {
    try {
      setRequest(inspectRequest(text))
      setConfirmed(false)
      setScanning(false)
      setError('')
    } catch (err) {
      setError((err as Error).message)
      setScanning(false)
    }
  }, [])
  const perform = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
      if (session) setDevices(session.list())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Stack p="md" style={{ overflowY: 'auto', height: '100%' }}>
      <Group>
        <ActionIcon aria-label={t('common.back')} variant="subtle" onClick={onBack}>
          <IconArrowLeft />
        </ActionIcon>
        <IconDevices />
        <Text fw={600}>{t('devices.title')}</Text>
      </Group>
      <Alert color="blue">{t('devices.primaryRequired')}</Alert>
      <Text size="sm">{t('devices.security')}</Text>
      {error && <Alert color="red">{error}</Alert>}
      <Button
        disabled={!session || busy}
        onClick={() => {
          setAdding(true)
          setRequest(undefined)
          setInput('')
          setConfirmed(false)
        }}
      >
        {t('devices.add')}
      </Button>
      {!devices.filter((device) => device.status !== 'removed').length && <Text c="dimmed">{t('devices.empty')}</Text>}
      {devices
        .filter((device) => device.status !== 'removed')
        .map((device) => (
          <Paper withBorder p="md" key={device.pubkey}>
            <Stack gap="xs">
              <Group justify="space-between">
                <Text fw={500}>{device.name}</Text>
                <Badge color={device.status === 'linked' ? 'green' : 'yellow'}>{t(`devices.${device.status}`)}</Badge>
              </Group>
              <Text size="xs" style={{ overflowWrap: 'anywhere' }}>
                {device.pubkey}
              </Text>
              <Text size="sm">
                {device.lastSeen
                  ? t('devices.lastSeen', { date: new Date(device.lastSeen * 1000).toLocaleString() })
                  : t('devices.waiting')}
              </Text>
              {device.status === 'pending' && device.expires > clock && (
                <Button variant="light" disabled={busy} onClick={() => perform(() => session!.resend(device.pubkey))}>
                  {t('devices.resend')}
                </Button>
              )}
              <Button color="red" variant="light" disabled={busy} onClick={() => setRemoving(device.pubkey)}>
                {t('devices.remove')}
              </Button>
            </Stack>
          </Paper>
        ))}
      <Modal
        opened={adding}
        onClose={() => {
          if (!busy) {
            setAdding(false)
            setScanning(false)
          }
        }}
        title={t('devices.add')}
      >
        <Stack>
          <Text size="sm">{t('devices.instructions')}</Text>
          {error && <Alert color="red">{error}</Alert>}
          {scanning ? (
            <QRCodeScanner onScan={inspect} onCancel={() => setScanning(false)} />
          ) : !request ? (
            <>
              <Button leftSection={<IconQrcode />} onClick={() => setScanning(true)}>
                {t('devices.scan')}
              </Button>
              <Textarea
                label={t('devices.paste')}
                value={input}
                onChange={(event) => setInput(event.currentTarget.value)}
                maxLength={4096}
                autosize
                minRows={3}
              />
              <Button variant="light" disabled={!input.trim()} onClick={() => inspect(input)}>
                {t('devices.inspect')}
              </Button>
            </>
          ) : (
            <>
              <Text fw={600}>{request.name}</Text>
              <Text size="sm">{t('devices.compare')}</Text>
              <Code style={{ overflowWrap: 'anywhere' }}>{request.code}</Code>
              <Text size="xs">
                {t('devices.relays')}: {request.relays.join(', ')}
              </Text>
              <Text size="sm">{t('devices.expires', { seconds: Math.max(0, request.expires - clock) })}</Text>
              <Checkbox
                label={t('devices.confirmCode')}
                checked={confirmed}
                onChange={(event) => setConfirmed(event.currentTarget.checked)}
              />
              <Button
                loading={busy}
                disabled={!confirmed || request.expires <= clock}
                onClick={() =>
                  perform(async () => {
                    await session!.approve(request, request.code)
                    setAdding(false)
                    setRequest(undefined)
                  })
                }
              >
                {t('devices.approve')}
              </Button>
            </>
          )}
        </Stack>
      </Modal>
      <Modal
        opened={!!removing}
        onClose={() => {
          if (!busy) setRemoving(undefined)
        }}
        title={t('devices.remove')}
      >
        <Stack>
          <Text>{t('devices.removeExplanation')}</Text>
          <Button
            color="red"
            loading={busy}
            onClick={() =>
              perform(async () => {
                await session!.remove(removing!)
                setRemoving(undefined)
              })
            }
          >
            {t('devices.remove')}
          </Button>
        </Stack>
      </Modal>
    </Stack>
  )
}
