import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Stack, Text, Box, Alert, Button, Loader, Center, Badge } from '@mantine/core'
import { IconAlertTriangle, IconCamera } from '@tabler/icons-react'
import { Html5Qrcode } from 'html5-qrcode'

interface QRCodeScannerProps {
  onScan: (data: string) => void
  onCancel: () => void
}

export function QRCodeScanner({ onScan, onCancel }: QRCodeScannerProps) {
  const { t } = useTranslation()
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string>('')
  const [isStarting, setIsStarting] = useState(true)
  const [isScanning, setIsScanning] = useState(false)
  const hasScanned = useRef(false)

  useEffect(() => {
    let mounted = true

    const startScanner = async () => {
      if (!containerRef.current || hasScanned.current) return

      try {
        console.log('[QRScanner] Starting camera...')

        // Check if getUserMedia is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Camera API not available')
        }

        // First request camera permission explicitly
        console.log('[QRScanner] Requesting camera permission...')
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        })
        console.log('[QRScanner] Camera permission granted, tracks:', stream.getTracks().length)

        // Stop the stream immediately - we just needed to trigger permission
        stream.getTracks().forEach(track => track.stop())

        console.log('[QRScanner] Initializing Html5Qrcode...')
        // Disable native BarcodeDetector API to avoid Google Play Services dependency
        // This forces the library to use the JavaScript-based ZXing decoder
        const scanner = new Html5Qrcode('qr-reader', {
          useBarCodeDetectorIfSupported: false,
          verbose: false
        })
        scannerRef.current = scanner

        console.log('[QRScanner] Starting scanner...')
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1
          },
          (decodedText) => {
            if (hasScanned.current) return
            hasScanned.current = true

            scanner.stop().then(() => {
              if (mounted) {
                onScan(decodedText)
              }
            }).catch(console.error)
          },
          () => {}
        )

        console.log('[QRScanner] Scanner started successfully')
        if (mounted) {
          setIsStarting(false)
          setIsScanning(true)
        }
      } catch (err) {
        console.error('[QRScanner] Failed to start scanner:', err)
        if (mounted) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          console.error('[QRScanner] Error message:', errorMsg)
          if (errorMsg.includes('Permission') || errorMsg.includes('NotAllowed') || errorMsg.includes('denied')) {
            setError(t('sync.cameraPermissionDenied') || 'Camera permission denied. Please allow camera access in your device settings.')
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
      // Only stop if scanner is actually running
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(console.error)
      }
    }
  }, [onScan, t])

  const handleCancel = () => {
    // Only stop if scanner is actually running
    if (scannerRef.current?.isScanning) {
      scannerRef.current.stop().catch(console.error)
    }
    onCancel()
  }

  return (
    <Stack align="center" gap="md">
      <Text c="dimmed" ta="center">{t('sync.scanning')}</Text>

      {isScanning && (
        <Badge color="green" variant="dot" size="lg">
          <IconCamera size={14} style={{ marginRight: 4 }} />
          Kamera aktiv - Scanne...
        </Badge>
      )}

      <Box
        ref={containerRef}
        pos="relative"
        w={300}
        h={300}
        bg="black"
        style={{ borderRadius: 'var(--mantine-radius-lg)', overflow: 'hidden' }}
      >
        <div id="qr-reader" style={{ width: '100%', height: '100%' }} />

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

      <Button variant="default" onClick={handleCancel}>{t('sync.cancel')}</Button>
    </Stack>
  )
}
