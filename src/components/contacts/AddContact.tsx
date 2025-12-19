import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QRCodeScanner } from '../sync/QRCodeScanner'

interface AddContactProps {
  onAdd: (npub: string, name?: string) => void
  onCancel: () => void
  error: string | null
}

type InputMode = 'manual' | 'scan'

export default function AddContact({ onAdd, onCancel, error }: AddContactProps) {
  const { t } = useTranslation()
  const [npub, setNpub] = useState('')
  const [name, setName] = useState('')
  const [mode, setMode] = useState<InputMode>('manual')
  const [scanError, setScanError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (npub.trim()) {
      onAdd(npub.trim(), name.trim() || undefined)
    }
  }

  const handleScan = (data: string) => {
    setScanError(null)
    // Check if it's a valid npub
    if (data.startsWith('npub1')) {
      setNpub(data)
      setMode('manual')
    } else {
      setScanError(t('contacts.invalidQR'))
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-theme-surface border-b border-theme-border">
        <button
          onClick={onCancel}
          className="p-1 hover:bg-theme-hover rounded-lg transition-colors"
        >
          <svg className="w-6 h-6 text-theme-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-lg font-medium text-theme-text">{t('contacts.addContact')}</h2>
      </header>

      {/* Mode Toggle */}
      <div className="flex border-b border-theme-border">
        <button
          onClick={() => setMode('manual')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            mode === 'manual'
              ? 'text-primary-500 border-b-2 border-primary-500'
              : 'text-theme-muted hover:text-theme-text'
          }`}
        >
          {t('contacts.enterManually')}
        </button>
        <button
          onClick={() => { setMode('scan'); setScanError(null) }}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            mode === 'scan'
              ? 'text-primary-500 border-b-2 border-primary-500'
              : 'text-theme-muted hover:text-theme-text'
          }`}
        >
          {t('contacts.scanQR')}
        </button>
      </div>

      {mode === 'manual' ? (
        /* Manual Input Form */
        <form onSubmit={handleSubmit} className="flex-1 px-4 py-6 space-y-4">
          <div>
            <label htmlFor="npub" className="block text-sm font-medium text-gray-300 mb-2">
              {t('contacts.publicKeyLabel')}
            </label>
            <textarea
              id="npub"
              value={npub}
              onChange={(e) => setNpub(e.target.value)}
              placeholder="npub1..."
              className="input-field h-24 resize-none font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="mt-1 text-xs text-theme-muted">
              {t('contacts.publicKeyHint')}
            </p>
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
              {t('contacts.nameLabel')}
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('contacts.displayNamePlaceholder')}
              className="input-field"
            />
            <p className="mt-1 text-xs text-theme-muted">
              {t('contacts.nameHint')}
            </p>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!npub.trim()}
            className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('contacts.addContact')}
          </button>
        </form>
      ) : (
        /* QR Scanner */
        <div className="flex-1 px-4 py-6">
          <p className="text-theme-muted text-sm text-center mb-4">
            {t('contacts.scanQRHint')}
          </p>

          {scanError && (
            <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-3 mb-4">
              <p className="text-red-400 text-sm text-center">{scanError}</p>
            </div>
          )}

          <QRCodeScanner
            onScan={handleScan}
            onCancel={() => setMode('manual')}
          />
        </div>
      )}
    </div>
  )
}
