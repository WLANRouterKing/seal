import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Stack,
  Group,
  Text,
  Paper,
  ActionIcon,
  Button,
  ThemeIcon,
  Box,
  Code,
  CopyButton,
  Textarea,
} from '@mantine/core'
import { IconArrowLeft, IconUpload, IconDownload, IconCheck, IconX } from '@tabler/icons-react'
import { QRCodeDisplay } from './QRCodeDisplay'
import { QRCodeScanner } from './QRCodeScanner'
import { SyncProgress } from './SyncProgress'
import { WebRTCSync } from '../../services/webrtc'
import {
  exportSyncData,
  importSyncData,
  serializeSyncData,
  deserializeSyncData,
  type SyncStats
} from '../../services/syncService'

type SyncState =
  | 'idle'
  | 'showing_qr'
  | 'scanning'
  | 'confirming'
  | 'connected'
  | 'transferring'
  | 'complete'
  | 'error'

interface SyncModalProps {
  onBack: () => void
}

export function SyncModal({ onBack }: SyncModalProps) {
  const { t } = useTranslation()
  const [state, setState] = useState<SyncState>('idle')
  const [webrtc] = useState(() => new WebRTCSync())
  const [qrData, setQrData] = useState('')
  const [confirmCode, setConfirmCode] = useState('')
  const [answerData, setAnswerData] = useState('')
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [stats, setStats] = useState<SyncStats | null>(null)
  const [error, setError] = useState('')
  const [isSender, setIsSender] = useState(false)

  const startAsSender = async () => {
    try {
      setIsSender(true)
      setState('showing_qr')
      const offer = await webrtc.createOffer()
      setQrData(offer)
    } catch (err) {
      console.error('Failed to create offer:', err)
      setError(t('sync.error'))
      setState('error')
    }
  }

  const startAsReceiver = () => {
    setIsSender(false)
    setState('scanning')
  }

  const handleQRScanned = async (data: string) => {
    try {
      const { code, answerData: answer } = await webrtc.processOffer(data)
      setConfirmCode(code)
      setAnswerData(answer)
      setState('confirming')

      const connected = await webrtc.waitForConnection()
      if (connected) {
        setState('connected')
      } else {
        setError(t('sync.error'))
        setState('error')
      }
    } catch (err) {
      console.error('Failed to process offer:', err)
      setError(t('sync.error'))
      setState('error')
    }
  }

  const handleCodeEntered = async (code: string, answer: string) => {
    try {
      const connected = await webrtc.completeConnection(answer, code)
      if (connected) {
        setState('connected')
        startTransfer()
      } else {
        setError(t('sync.codeInvalid') || 'Invalid confirmation code')
        setState('error')
      }
    } catch (err) {
      console.error('Failed to complete connection:', err)
      setError(t('sync.error'))
      setState('error')
    }
  }

  const startTransfer = async () => {
    setState('transferring')

    try {
      if (isSender) {
        const data = await exportSyncData()
        const json = serializeSyncData(data)

        await webrtc.sendSyncData(json, (sent, total) => {
          setProgress({ current: sent, total })
        })

        setStats({
          messages: data.messages.length,
          contacts: data.contacts.length,
          relays: data.relays.length
        })
        setState('complete')
      } else {
        const json = await webrtc.receiveSyncData((received, total) => {
          setProgress({ current: received, total })
        })

        const data = deserializeSyncData(json)
        const importStats = await importSyncData(data)

        setStats(importStats)
        setState('complete')
      }
    } catch (err) {
      console.error('Transfer failed:', err)
      setError(t('sync.error'))
      setState('error')
    }
  }

  const handleConfirmReceive = () => {
    startTransfer()
  }

  const handleReset = () => {
    webrtc.close()
    setState('idle')
    setQrData('')
    setConfirmCode('')
    setAnswerData('')
    setProgress({ current: 0, total: 0 })
    setStats(null)
    setError('')
  }

  const handleClose = () => {
    webrtc.close()
    onBack()
  }

  return (
    <Stack h="100%" gap={0}>
      <Paper p="sm" radius={0} style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
        <Group gap="sm">
          <ActionIcon variant="subtle" onClick={handleClose}>
            <IconArrowLeft size={24} />
          </ActionIcon>
          <Text fw={500} size="lg">{t('sync.title')}</Text>
        </Group>
      </Paper>

      <Box p="md" style={{ flex: 1, overflow: 'auto' }}>
        {state === 'idle' && (
          <Stack gap="lg" align="center">
            <Text c="dimmed" ta="center">{t('sync.description')}</Text>
            <Stack w="100%" maw={320}>
              <Button size="lg" color="cyan" leftSection={<IconUpload size={20} />} onClick={startAsSender}>
                {t('sync.sendData')}
              </Button>
              <Button size="lg" variant="default" leftSection={<IconDownload size={20} />} onClick={startAsReceiver}>
                {t('sync.receiveData')}
              </Button>
            </Stack>
          </Stack>
        )}

        {state === 'showing_qr' && (
          <QRCodeDisplay qrData={qrData} onCodeEntered={handleCodeEntered} onCancel={handleReset} />
        )}

        {state === 'scanning' && (
          <QRCodeScanner onScan={handleQRScanned} onCancel={handleReset} />
        )}

        {state === 'confirming' && (
          <Stack align="center" gap="lg">
            <Text c="dimmed" ta="center">{t('sync.tellOtherDevice')}</Text>
            <Paper p="xl" withBorder>
              <Code fz="2rem" fw={700} style={{ letterSpacing: '0.2em' }}>{confirmCode}</Code>
            </Paper>
            <Box w="100%">
              <Text size="sm" c="dimmed" mb="xs">{t('sync.copyAnswerData') || 'Copy this connection data:'}</Text>
              <CopyButton value={answerData}>
                {({ copied, copy }) => (
                  <Textarea
                    value={answerData}
                    readOnly
                    minRows={3}
                    styles={{ input: { fontFamily: 'monospace', fontSize: '0.75rem' } }}
                    onClick={copy}
                    rightSection={copied ? <IconCheck size={14} /> : null}
                  />
                )}
              </CopyButton>
            </Box>
            <Text c="dimmed" size="sm">{t('sync.waitingForConnection') || 'Waiting for connection...'}</Text>
            <Button variant="default" onClick={handleReset}>{t('sync.cancel')}</Button>
          </Stack>
        )}

        {state === 'connected' && !isSender && (
          <Stack align="center" gap="lg">
            <ThemeIcon size={64} radius="xl" color="green" variant="light">
              <IconCheck size={32} />
            </ThemeIcon>
            <Text size="lg" fw={500}>{t('sync.connected') || 'Connected!'}</Text>
            <Text c="dimmed" ta="center">{t('sync.readyToReceive')}</Text>
            <Button color="cyan" onClick={handleConfirmReceive}>{t('sync.confirm')}</Button>
            <Button variant="default" onClick={handleReset}>{t('sync.cancel')}</Button>
          </Stack>
        )}

        {state === 'transferring' && (
          <SyncProgress current={progress.current} total={progress.total} isSending={isSender} />
        )}

        {state === 'complete' && stats && (
          <Stack align="center" gap="lg">
            <ThemeIcon size={80} radius="xl" color="green" variant="light">
              <IconCheck size={40} />
            </ThemeIcon>
            <Text size="xl" fw={600}>{t('sync.complete')}</Text>
            <Stack gap={4} align="center">
              <Text c="dimmed">{stats.messages} {t('sync.messages') || 'messages'}</Text>
              <Text c="dimmed">{stats.contacts} {t('sync.contacts') || 'contacts'}</Text>
              <Text c="dimmed">{stats.relays} {t('sync.relays') || 'relays'}</Text>
            </Stack>
            <Button color="cyan" onClick={handleClose}>{t('sync.done') || 'Done'}</Button>
          </Stack>
        )}

        {state === 'error' && (
          <Stack align="center" gap="lg">
            <ThemeIcon size={80} radius="xl" color="red" variant="light">
              <IconX size={40} />
            </ThemeIcon>
            <Text size="xl" fw={600} c="red">{t('sync.error')}</Text>
            {error && <Text c="dimmed">{error}</Text>}
            <Button color="cyan" onClick={handleReset}>{t('sync.retry')}</Button>
            <Button variant="default" onClick={handleClose}>{t('sync.cancel')}</Button>
          </Stack>
        )}
      </Box>
    </Stack>
  )
}
