import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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

  // Start as sender (show QR code)
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

  // Start as receiver (scan QR code)
  const startAsReceiver = () => {
    setIsSender(false)
    setState('scanning')
  }

  // Handle QR code scanned (receiver side)
  const handleQRScanned = async (data: string) => {
    try {
      const { code, answerData: answer } = await webrtc.processOffer(data)
      setConfirmCode(code)
      setAnswerData(answer)
      setState('confirming')

      // Wait for connection after sender enters code
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

  // Handle code entered (sender side)
  const handleCodeEntered = async (code: string, answer: string) => {
    try {
      const connected = await webrtc.completeConnection(answer, code)
      if (connected) {
        setState('connected')
        // Sender starts transfer after connection
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

  // Start data transfer
  const startTransfer = async () => {
    setState('transferring')

    try {
      if (isSender) {
        // Export and send data
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
        // Receive data
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

  // Confirm ready to receive (receiver side)
  const handleConfirmReceive = () => {
    startTransfer()
  }

  // Reset to initial state
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

  // Close and go back
  const handleClose = () => {
    webrtc.close()
    onBack()
  }

  return (
    <div className="flex flex-col h-full bg-theme-bg">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-theme-surface border-b border-theme-border">
        <button
          onClick={handleClose}
          className="p-2 -ml-2 hover:bg-theme-hover rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold">{t('sync.title')}</h1>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-4">
        {state === 'idle' && (
          <div className="flex flex-col gap-6">
            <p className="text-theme-text-secondary text-center">
              {t('sync.description')}
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={startAsSender}
                className="btn-primary py-4 text-lg"
              >
                <svg className="w-6 h-6 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {t('sync.sendData')}
              </button>

              <button
                onClick={startAsReceiver}
                className="btn-secondary py-4 text-lg"
              >
                <svg className="w-6 h-6 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {t('sync.receiveData')}
              </button>
            </div>
          </div>
        )}

        {state === 'showing_qr' && (
          <QRCodeDisplay
            qrData={qrData}
            onCodeEntered={handleCodeEntered}
            onCancel={handleReset}
          />
        )}

        {state === 'scanning' && (
          <QRCodeScanner
            onScan={handleQRScanned}
            onCancel={handleReset}
          />
        )}

        {state === 'confirming' && (
          <div className="flex flex-col items-center gap-6">
            <div className="text-center">
              <p className="text-theme-text-secondary mb-4">
                {t('sync.tellOtherDevice')}
              </p>
              <div className="text-4xl font-mono font-bold tracking-wider bg-theme-surface p-6 rounded-xl">
                {confirmCode}
              </div>
            </div>

            <div className="w-full">
              <p className="text-sm text-theme-text-secondary mb-2">
                {t('sync.copyAnswerData') || 'Copy this connection data to the other device:'}
              </p>
              <div className="relative">
                <textarea
                  readOnly
                  value={answerData}
                  className="input-field w-full h-20 font-mono text-xs resize-none"
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                />
                <button
                  onClick={() => navigator.clipboard.writeText(answerData)}
                  className="absolute top-2 right-2 p-1 bg-theme-surface rounded hover:bg-theme-hover"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>

            <p className="text-theme-text-secondary text-sm">
              {t('sync.waitingForConnection') || 'Waiting for connection...'}
            </p>
            <button onClick={handleReset} className="btn-secondary">
              {t('sync.cancel')}
            </button>
          </div>
        )}

        {state === 'connected' && !isSender && (
          <div className="flex flex-col items-center gap-6">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-medium">{t('sync.connected') || 'Connected!'}</p>
            <p className="text-theme-text-secondary text-center">
              {t('sync.readyToReceive')}
            </p>
            <button onClick={handleConfirmReceive} className="btn-primary py-3 px-8">
              {t('sync.confirm')}
            </button>
            <button onClick={handleReset} className="btn-secondary">
              {t('sync.cancel')}
            </button>
          </div>
        )}

        {state === 'transferring' && (
          <SyncProgress
            current={progress.current}
            total={progress.total}
            isSending={isSender}
          />
        )}

        {state === 'complete' && stats && (
          <div className="flex flex-col items-center gap-6">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-xl font-semibold">{t('sync.complete')}</p>
            <div className="text-theme-text-secondary text-center">
              <p>{stats.messages} {t('sync.messages') || 'messages'}</p>
              <p>{stats.contacts} {t('sync.contacts') || 'contacts'}</p>
              <p>{stats.relays} {t('sync.relays') || 'relays'}</p>
            </div>
            <button onClick={handleClose} className="btn-primary py-3 px-8">
              {t('sync.done') || 'Done'}
            </button>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center gap-6">
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-xl font-semibold text-red-500">{t('sync.error')}</p>
            {error && <p className="text-theme-text-secondary">{error}</p>}
            <button onClick={handleReset} className="btn-primary py-3 px-8">
              {t('sync.retry')}
            </button>
            <button onClick={handleClose} className="btn-secondary">
              {t('sync.cancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
