import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Html5Qrcode } from 'html5-qrcode'
import { Stack, Center, Text, Button, ThemeIcon, Box, Textarea, Alert, SegmentedControl, Loader } from '@mantine/core'
import { IconArrowLeft, IconAlertTriangle, IconLock } from '@tabler/icons-react'
import { useAuthStore } from '../stores/authStore'
import KeyGeneration from '../components/onboarding/KeyGeneration'
import BackupPhrase from '../components/onboarding/BackupPhrase'

type Step = 'welcome' | 'generate' | 'import' | 'backup'

export default function Onboarding() {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>('welcome')
  const [generatedNsec, setGeneratedNsec] = useState<string>('')
  const navigate = useNavigate()
  const { createKeys, importKeys, isLoading, error, clearError } = useAuthStore()

  const handleGenerate = async () => {
    setStep('generate')
    const keys = await createKeys()
    setGeneratedNsec(keys.nsec)
    setStep('backup')
  }

  const handleImport = async (nsec: string) => {
    clearError()
    const success = await importKeys(nsec)
    if (success) {
      navigate('/')
    }
  }

  const handleComplete = () => {
    navigate('/')
  }

  if (step === 'generate') {
    return <KeyGeneration isLoading={isLoading} />
  }

  if (step === 'backup') {
    return <BackupPhrase nsec={generatedNsec} onComplete={handleComplete} />
  }

  if (step === 'import') {
    return (
      <Stack h="100vh" gap={0} p="md">
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={20} />}
          onClick={() => setStep('welcome')}
          mb="lg"
          style={{ alignSelf: 'flex-start' }}
        >
          {t('common.back')}
        </Button>

        <Text size="xl" fw={700} mb="xs">
          {t('onboarding.importTitle')}
        </Text>
        <Text c="dimmed" mb="lg">
          {t('onboarding.importSubtitle')}
        </Text>

        <ImportForm onImport={handleImport} isLoading={isLoading} error={error} />
      </Stack>
    )
  }

  return (
    <Center h="100vh" p="md">
      <Stack align="center" gap="lg" maw={320}>
        <ThemeIcon size={80} radius="xl" variant="light" color="cyan">
          <IconLock size={40} />
        </ThemeIcon>

        <Text size="xl" fw={700} ta="center">
          {t('onboarding.title')}
        </Text>
        <Text c="dimmed" ta="center">
          {t('onboarding.subtitle')}
        </Text>

        <Stack w="100%" gap="sm" mt="md">
          <Button size="lg" color="cyan" onClick={handleGenerate} loading={isLoading} fullWidth>
            {t('onboarding.createAccount')}
          </Button>

          <Button size="lg" variant="default" onClick={() => setStep('import')} fullWidth>
            {t('onboarding.importKey')}
          </Button>
        </Stack>

        <Text size="xs" c="dimmed" ta="center" mt="md">
          {t('onboarding.privacyNote')}
        </Text>
      </Stack>
    </Center>
  )
}

function ImportForm({
  onImport,
  isLoading,
  error,
}: {
  onImport: (nsec: string) => void
  isLoading: boolean
  error: string | null
}) {
  const { t } = useTranslation()
  const [nsec, setNsec] = useState('')
  const [mode, setMode] = useState<string>('text')
  const [scanError, setScanError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (nsec.trim()) {
      onImport(nsec.trim())
    }
  }

  const handleQRScan = (data: string) => {
    if (data.startsWith('nsec1')) {
      setNsec(data)
      setMode('text')
      onImport(data)
    } else {
      setScanError(t('onboarding.invalidQR') || 'Invalid QR code - not an nsec key')
    }
  }

  return (
    <Stack gap="md">
      <SegmentedControl
        fullWidth
        value={mode}
        onChange={(value) => {
          setMode(value)
          setScanError('')
        }}
        data={[
          { label: t('onboarding.pasteKey') || 'Paste Key', value: 'text' },
          { label: t('onboarding.scanQR') || 'Scan QR', value: 'qr' },
        ]}
      />

      {mode === 'text' && (
        <Box component="form" onSubmit={handleSubmit}>
          <Stack gap="md">
            <Textarea
              label={t('onboarding.privateKeyLabel')}
              placeholder="nsec1..."
              value={nsec}
              onChange={(e) => setNsec(e.target.value)}
              minRows={3}
              autoComplete="off"
              spellCheck={false}
              styles={{ input: { fontFamily: 'monospace', fontSize: '0.875rem' } }}
            />

            {error && (
              <Alert color="red" icon={<IconAlertTriangle size={16} />}>
                {error}
              </Alert>
            )}

            <Button type="submit" color="cyan" fullWidth disabled={!nsec.trim()} loading={isLoading}>
              {t('onboarding.importButton')}
            </Button>

            <Text size="xs" c="dimmed" ta="center">
              {t('onboarding.importWarning')}
            </Text>
          </Stack>
        </Box>
      )}

      {mode === 'qr' && (
        <Stack gap="md">
          <KeyQRScanner onScan={handleQRScan} />
          {scanError && (
            <Alert color="red" icon={<IconAlertTriangle size={16} />}>
              {scanError}
            </Alert>
          )}
          {isLoading && (
            <Text c="dimmed" size="sm" ta="center">
              {t('onboarding.importing')}
            </Text>
          )}
          {error && (
            <Alert color="red" icon={<IconAlertTriangle size={16} />}>
              {error}
            </Alert>
          )}
        </Stack>
      )}
    </Stack>
  )
}

function KeyQRScanner({ onScan }: { onScan: (data: string) => void }) {
  const { t } = useTranslation()
  const [error, setError] = useState('')
  const [isStarting, setIsStarting] = useState(true)
  const hasScanned = React.useRef(false)
  const scannerRef = React.useRef<Html5Qrcode | null>(null)

  React.useEffect(() => {
    let mounted = true

    const startScanner = async () => {
      if (hasScanned.current) return

      try {
        console.log('[KeyQRScanner] Starting camera...')

        // Check if getUserMedia is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Camera API not available')
        }

        // First request camera permission explicitly
        console.log('[KeyQRScanner] Requesting camera permission...')
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        console.log('[KeyQRScanner] Camera permission granted')

        // Stop the stream immediately - we just needed to trigger permission
        stream.getTracks().forEach((track) => track.stop())

        console.log('[KeyQRScanner] Initializing Html5Qrcode...')
        const scanner = new Html5Qrcode('key-qr-reader', {
          useBarCodeDetectorIfSupported: false,
          verbose: false,
        })
        scannerRef.current = scanner

        console.log('[KeyQRScanner] Starting scanner...')
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
          },
          (decodedText) => {
            if (hasScanned.current) return
            hasScanned.current = true

            scanner
              .stop()
              .then(() => {
                if (mounted) {
                  onScan(decodedText)
                }
              })
              .catch(console.error)
          },
          () => {}
        )

        console.log('[KeyQRScanner] Scanner started successfully')
        if (mounted) {
          setIsStarting(false)
        }
      } catch (err) {
        console.error('[KeyQRScanner] Failed to start scanner:', err)
        if (mounted) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          console.error('[KeyQRScanner] Error message:', errorMsg)
          if (errorMsg.includes('Permission') || errorMsg.includes('NotAllowed') || errorMsg.includes('denied')) {
            setError(
              t('sync.cameraPermissionDenied') ||
                'Camera permission denied. Please allow camera access in your device settings.'
            )
          } else {
            setError((t('sync.cameraError') || 'Failed to access camera') + ': ' + errorMsg)
          }
          setIsStarting(false)
        }
      }
    }

    startScanner()

    return () => {
      mounted = false
      if (scannerRef.current) {
        scannerRef.current.stop().catch(console.error)
      }
    }
  }, [onScan, t])

  return (
    <Stack align="center" gap="md">
      <Box
        pos="relative"
        w={280}
        h={280}
        bg="black"
        style={{ borderRadius: 'var(--mantine-radius-lg)', overflow: 'hidden' }}
      >
        <div id="key-qr-reader" style={{ width: '100%', height: '100%' }} />

        {isStarting && (
          <Center pos="absolute" style={{ inset: 0 }} bg="rgba(0,0,0,0.8)">
            <Loader color="white" />
          </Center>
        )}
      </Box>

      {error && (
        <Alert color="red" icon={<IconAlertTriangle size={16} />}>
          {error}
        </Alert>
      )}

      <Text size="xs" c="dimmed" ta="center">
        {t('onboarding.scanKeyQR') || 'Point camera at the QR code showing your private key'}
      </Text>
    </Stack>
  )
}
