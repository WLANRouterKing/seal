import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Stack, Group, Text, Paper, ActionIcon, Button, ThemeIcon, Box, Code, TextInput } from '@mantine/core'
import { IconArrowLeft, IconUpload, IconDownload, IconCheck, IconX } from '@tabler/icons-react'
import { QRCodeSVG } from 'qrcode.react'
import { QRCodeScanner } from './QRCodeScanner'
import { SyncProgress } from './SyncProgress'
import { WebRTCSync } from '../../services/webrtc'
import {
  exportSyncData,
  importSyncData,
  serializeSyncData,
  deserializeSyncData,
  type SyncStats,
} from '../../services/syncService'

type SyncState =
  | 'idle'
  | 'showing_qr' // Sender: showing offer QR
  | 'scanning_answer' // Sender: scanning answer QR from receiver
  | 'entering_code' // Sender: entering confirmation code
  | 'scanning' // Receiver: scanning offer QR
  | 'confirming' // Receiver: showing answer QR + code
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
  const [codeInput, setCodeInput] = useState('')

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

  // Sender: move from showing QR to scanning answer QR
  const handleSenderNextStep = () => {
    setState('scanning_answer')
  }

  // Sender: scanned answer QR from receiver
  const handleAnswerScanned = async (data: string) => {
    try {
      setAnswerData(data)
      setState('entering_code')
    } catch (err) {
      console.error('Failed to process answer:', err)
      setError(t('sync.error'))
      setState('error')
    }
  }

  // Sender: entered confirmation code
  const handleCodeSubmit = async (code: string) => {
    try {
      console.log('[Sync] Completing connection with code:', code)
      console.log('[Sync] Answer data length:', answerData.length)
      const connected = await webrtc.completeConnection(answerData, code)
      console.log('[Sync] Connection result:', connected)
      if (connected) {
        setState('connected')
        startTransfer()
      } else {
        setError(t('sync.codeInvalid') || 'Invalid confirmation code')
        setState('error')
      }
    } catch (err) {
      console.error('Failed to complete connection:', err)
      setError(t('sync.error') + ': ' + (err instanceof Error ? err.message : String(err)))
      setState('error')
    }
  }

  // Receiver: scanned offer QR
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

  const startTransfer = async () => {
    setState('transferring')

    try {
      if (isSender) {
        console.log('[Sync] Starting export...')
        const data = await exportSyncData()
        console.log('[Sync] Export complete, messages:', data.messages.length)
        const json = serializeSyncData(data)

        await webrtc.sendSyncData(json, (sent, total) => {
          setProgress({ current: sent, total })
        })

        setStats({
          messages: data.messages.length,
          contacts: data.contacts.length,
          relays: data.relays.length,
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
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Not logged in')) {
        setError(t('sync.notLoggedIn') || 'You must be logged in to sync data')
      } else {
        setError(t('sync.error') + ': ' + msg)
      }
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
    setCodeInput('')
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
          <Text fw={500} size="lg">
            {t('sync.title')}
          </Text>
        </Group>
      </Paper>

      <Box p="md" style={{ flex: 1, overflow: 'auto' }}>
        {state === 'idle' && (
          <Stack gap="lg" align="center">
            <Text c="dimmed" ta="center">
              {t('sync.description')}
            </Text>
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
          <Stack align="center" gap="lg">
            <Text c="dimmed" ta="center">
              {t('sync.showingQR')}
            </Text>
            <Box p="md" bg="white" style={{ borderRadius: 'var(--mantine-radius-lg)' }}>
              <QRCodeSVG value={qrData} size={280} level="L" includeMargin />
            </Box>
            <Text size="sm" c="dimmed" ta="center">
              {t('sync.step1of2') || 'Step 1/2: Let the other device scan this code'}
            </Text>
            <Button color="cyan" onClick={handleSenderNextStep}>
              {t('sync.next') || 'Next: Scan Response'}
            </Button>
            <Button variant="default" onClick={handleReset}>
              {t('sync.cancel')}
            </Button>
          </Stack>
        )}

        {state === 'scanning_answer' && <QRCodeScanner onScan={handleAnswerScanned} onCancel={handleReset} />}

        {state === 'entering_code' && (
          <Stack align="center" gap="lg">
            <Text c="dimmed" ta="center">
              {t('sync.enterCodeFromDevice') || 'Enter the code shown on the other device'}
            </Text>
            <TextInput
              value={codeInput}
              onChange={(e) => {
                const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                if (val.length <= 6) {
                  setCodeInput(val.length > 3 ? val.slice(0, 3) + '-' + val.slice(3) : val)
                }
              }}
              placeholder="XXX-XXX"
              maxLength={7}
              size="xl"
              styles={{
                input: {
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: '2rem',
                  letterSpacing: '0.2em',
                  width: 200,
                },
              }}
              autoFocus
            />
            <Button
              color="cyan"
              onClick={() => handleCodeSubmit(codeInput)}
              disabled={codeInput.replace('-', '').length !== 6}
            >
              {t('sync.connect') || 'Connect'}
            </Button>
            <Button variant="default" onClick={handleReset}>
              {t('sync.cancel')}
            </Button>
          </Stack>
        )}

        {state === 'scanning' && <QRCodeScanner onScan={handleQRScanned} onCancel={handleReset} />}

        {state === 'confirming' && (
          <Stack align="center" gap="lg">
            <Text c="dimmed" ta="center">
              {t('sync.step2of2') || 'Step 2/2: Let the other device scan this code'}
            </Text>
            <Box p="md" bg="white" style={{ borderRadius: 'var(--mantine-radius-lg)' }}>
              <QRCodeSVG value={answerData} size={280} level="L" includeMargin />
            </Box>
            <Text size="sm" c="dimmed" ta="center">
              {t('sync.tellOtherDevice')}
            </Text>
            <Paper p="xl" withBorder>
              <Code fz="2rem" fw={700} style={{ letterSpacing: '0.2em' }}>
                {confirmCode}
              </Code>
            </Paper>
            <Text c="dimmed" size="sm">
              {t('sync.waitingForConnection') || 'Waiting for connection...'}
            </Text>
            <Button variant="default" onClick={handleReset}>
              {t('sync.cancel')}
            </Button>
          </Stack>
        )}

        {state === 'connected' && !isSender && (
          <Stack align="center" gap="lg">
            <ThemeIcon size={64} radius="xl" color="green" variant="light">
              <IconCheck size={32} />
            </ThemeIcon>
            <Text size="lg" fw={500}>
              {t('sync.connected') || 'Connected!'}
            </Text>
            <Text c="dimmed" ta="center">
              {t('sync.readyToReceive')}
            </Text>
            <Button color="cyan" onClick={handleConfirmReceive}>
              {t('sync.confirm')}
            </Button>
            <Button variant="default" onClick={handleReset}>
              {t('sync.cancel')}
            </Button>
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
            <Text size="xl" fw={600}>
              {t('sync.complete')}
            </Text>
            <Stack gap={4} align="center">
              <Text c="dimmed">
                {stats.messages} {t('sync.messages') || 'messages'}
              </Text>
              <Text c="dimmed">
                {stats.contacts} {t('sync.contacts') || 'contacts'}
              </Text>
              <Text c="dimmed">
                {stats.relays} {t('sync.relays') || 'relays'}
              </Text>
            </Stack>
            <Button color="cyan" onClick={handleClose}>
              {t('sync.done') || 'Done'}
            </Button>
          </Stack>
        )}

        {state === 'error' && (
          <Stack align="center" gap="lg">
            <ThemeIcon size={80} radius="xl" color="red" variant="light">
              <IconX size={40} />
            </ThemeIcon>
            <Text size="xl" fw={600} c="red">
              {t('sync.error')}
            </Text>
            {error && <Text c="dimmed">{error}</Text>}
            <Button color="cyan" onClick={handleReset}>
              {t('sync.retry')}
            </Button>
            <Button variant="default" onClick={handleClose}>
              {t('sync.cancel')}
            </Button>
          </Stack>
        )}
      </Box>
    </Stack>
  )
}
