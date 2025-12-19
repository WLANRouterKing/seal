import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const hasScanned = useRef(false)

  useEffect(() => {
    let mounted = true

    const startScanner = async () => {
      if (!containerRef.current || hasScanned.current) return

      try {
        const scanner = new Html5Qrcode('qr-reader')
        scannerRef.current = scanner

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

            // Stop scanner before calling onScan
            scanner.stop().then(() => {
              if (mounted) {
                onScan(decodedText)
              }
            }).catch(console.error)
          },
          () => {
            // Ignore scan failures (no QR code in view)
          }
        )

        if (mounted) {
          setIsStarting(false)
        }
      } catch (err) {
        console.error('Failed to start scanner:', err)
        if (mounted) {
          setError(t('sync.cameraError') || 'Failed to access camera')
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

  const handleCancel = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(console.error)
    }
    onCancel()
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-theme-text-secondary text-center">
        {t('sync.scanning')}
      </p>

      <div
        ref={containerRef}
        className="relative w-full max-w-[300px] aspect-square bg-black rounded-xl overflow-hidden"
      >
        <div id="qr-reader" className="w-full h-full" />

        {isStarting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent" />
          </div>
        )}

        {/* Scanning overlay */}
        {!isStarting && !error && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Corner markers */}
            <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-white/80 rounded-tl-lg" />
            <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-white/80 rounded-tr-lg" />
            <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-white/80 rounded-bl-lg" />
            <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-white/80 rounded-br-lg" />
          </div>
        )}
      </div>

      {error && (
        <div className="text-red-500 text-center p-4 bg-red-500/10 rounded-lg">
          {error}
        </div>
      )}

      <button onClick={handleCancel} className="btn-secondary">
        {t('sync.cancel')}
      </button>
    </div>
  )
}
