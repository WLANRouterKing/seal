import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Html5Qrcode } from 'html5-qrcode'
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

  return (
    <div className="min-h-full flex flex-col bg-theme-bg">
      {step === 'welcome' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
          <div className="w-20 h-20 bg-primary-500 rounded-full flex items-center justify-center mb-8">
            <svg className="w-10 h-10 text-theme-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>

          <h1 className="text-3xl font-bold text-theme-text mb-4">{t('onboarding.title')}</h1>
          <p className="text-theme-muted text-center mb-12 max-w-xs">
            {t('onboarding.subtitle')}
          </p>

          <div className="w-full max-w-xs space-y-4">
            <button
              onClick={handleGenerate}
              disabled={isLoading}
              className="btn-primary w-full py-3 text-lg"
            >
              {isLoading ? t('onboarding.creating') : t('onboarding.createAccount')}
            </button>

            <button
              onClick={() => setStep('import')}
              className="btn-secondary w-full py-3"
            >
              {t('onboarding.importKey')}
            </button>
          </div>

          <p className="text-xs text-theme-muted mt-8 text-center max-w-xs">
            {t('onboarding.privacyNote')}
          </p>
        </div>
      )}

      {step === 'generate' && (
        <KeyGeneration isLoading={isLoading} />
      )}

      {step === 'import' && (
        <div className="flex-1 flex flex-col px-6 py-8">
          <button
            onClick={() => setStep('welcome')}
            className="flex items-center text-theme-muted hover:text-theme-text mb-8"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('common.back')}
          </button>

          <h2 className="text-2xl font-bold text-theme-text mb-2">{t('onboarding.importTitle')}</h2>
          <p className="text-theme-muted mb-8">
            {t('onboarding.importSubtitle')}
          </p>

          <ImportForm
            onImport={handleImport}
            isLoading={isLoading}
            error={error}
          />
        </div>
      )}

      {step === 'backup' && (
        <BackupPhrase nsec={generatedNsec} onComplete={handleComplete} />
      )}
    </div>
  )
}

function ImportForm({
  onImport,
  isLoading,
  error
}: {
  onImport: (nsec: string) => void
  isLoading: boolean
  error: string | null
}) {
  const { t } = useTranslation()
  const [nsec, setNsec] = useState('')
  const [mode, setMode] = useState<'text' | 'qr'>('text')
  const [scanError, setScanError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (nsec.trim()) {
      onImport(nsec.trim())
    }
  }

  const handleQRScan = (data: string) => {
    // Check if it's a valid nsec
    if (data.startsWith('nsec1')) {
      setNsec(data)
      setMode('text')
      // Auto-submit after successful scan
      onImport(data)
    } else {
      setScanError(t('onboarding.invalidQR') || 'Invalid QR code - not an nsec key')
    }
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setMode('text')}
          className={`flex-1 py-2 px-4 rounded-lg transition-colors ${
            mode === 'text'
              ? 'bg-primary-500 text-white'
              : 'bg-theme-surface text-theme-text hover:bg-theme-hover'
          }`}
        >
          <svg className="w-5 h-5 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span className="text-sm">{t('onboarding.pasteKey') || 'Paste Key'}</span>
        </button>
        <button
          type="button"
          onClick={() => { setMode('qr'); setScanError('') }}
          className={`flex-1 py-2 px-4 rounded-lg transition-colors ${
            mode === 'qr'
              ? 'bg-primary-500 text-white'
              : 'bg-theme-surface text-theme-text hover:bg-theme-hover'
          }`}
        >
          <svg className="w-5 h-5 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
          <span className="text-sm">{t('onboarding.scanQR') || 'Scan QR'}</span>
        </button>
      </div>

      {mode === 'text' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="nsec" className="block text-sm font-medium text-gray-300 mb-2">
              {t('onboarding.privateKeyLabel')}
            </label>
            <textarea
              id="nsec"
              value={nsec}
              onChange={(e) => setNsec(e.target.value)}
              placeholder="nsec1..."
              className="input-field h-24 resize-none font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={!nsec.trim() || isLoading}
            className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? t('onboarding.importing') : t('onboarding.importButton')}
          </button>

          <p className="text-xs text-theme-muted text-center">
            {t('onboarding.importWarning')}
          </p>
        </form>
      )}

      {mode === 'qr' && (
        <div className="space-y-4">
          <KeyQRScanner onScan={handleQRScan} />
          {scanError && (
            <p className="text-red-400 text-sm text-center">{scanError}</p>
          )}
          {isLoading && (
            <p className="text-theme-muted text-sm text-center">{t('onboarding.importing')}</p>
          )}
          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}
        </div>
      )}
    </div>
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
        const scanner = new Html5Qrcode('key-qr-reader')
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

            scanner.stop().then(() => {
              if (mounted) {
                onScan(decodedText)
              }
            }).catch(console.error)
          },
          () => {}
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

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-[280px] aspect-square bg-black rounded-xl overflow-hidden">
        <div id="key-qr-reader" className="w-full h-full" />

        {isStarting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent" />
          </div>
        )}

        {!isStarting && !error && (
          <div className="absolute inset-0 pointer-events-none">
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

      <p className="text-xs text-theme-muted text-center">
        {t('onboarding.scanKeyQR') || 'Point camera at the QR code showing your private key'}
      </p>
    </div>
  )
}
