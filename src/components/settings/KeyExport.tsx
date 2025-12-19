import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/authStore'
import { copyToClipboard } from '../../utils/format'

interface KeyExportProps {
  onBack: () => void
}

export default function KeyExport({ onBack }: KeyExportProps) {
  const { t } = useTranslation()
  const { keys } = useAuthStore()
  const [showPrivate, setShowPrivate] = useState(false)
  const [copiedPub, setCopiedPub] = useState(false)
  const [copiedPriv, setCopiedPriv] = useState(false)

  const handleCopyPublic = async () => {
    if (keys) {
      await copyToClipboard(keys.npub)
      setCopiedPub(true)
      setTimeout(() => setCopiedPub(false), 2000)
    }
  }

  const handleCopyPrivate = async () => {
    if (keys) {
      await copyToClipboard(keys.nsec)
      setCopiedPriv(true)
      setTimeout(() => setCopiedPriv(false), 2000)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-theme-surface border-b border-theme-border">
        <button
          onClick={onBack}
          className="p-1 hover:bg-theme-hover rounded-lg transition-colors"
        >
          <svg className="w-6 h-6 text-theme-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-lg font-medium text-theme-text">{t('keyExport.title')}</h2>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 scrollbar-hide">
        {/* Public Key */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-300">
              {t('keyExport.publicKeyLabel')}
            </label>
            <button
              onClick={handleCopyPublic}
              className="text-primary-500 text-sm hover:text-primary-400"
            >
              {copiedPub ? t('common.copied') : t('common.copy')}
            </button>
          </div>
          <div className="bg-theme-surface border border-theme-border rounded-xl p-4">
            <p className="font-mono text-sm text-theme-text break-all leading-relaxed">
              {keys?.npub}
            </p>
          </div>
          <p className="mt-2 text-xs text-theme-muted">
            {t('keyExport.publicKeyHint')}
          </p>
        </div>

        {/* Private Key */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-300">
              {t('keyExport.privateKeyLabel')}
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowPrivate(!showPrivate)}
                className="text-theme-muted text-sm hover:text-theme-text"
              >
                {showPrivate ? t('common.hide') : t('common.show')}
              </button>
              {showPrivate && (
                <button
                  onClick={handleCopyPrivate}
                  className="text-primary-500 text-sm hover:text-primary-400"
                >
                  {copiedPriv ? t('common.copied') : t('common.copy')}
                </button>
              )}
            </div>
          </div>
          <div className="bg-theme-surface border border-theme-border rounded-xl p-4">
            {showPrivate ? (
              <p className="font-mono text-sm text-theme-text break-all leading-relaxed">
                {keys?.nsec}
              </p>
            ) : (
              <p className="font-mono text-sm text-theme-muted">
                ••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••
              </p>
            )}
          </div>
        </div>

        {/* Warning */}
        <div className="bg-red-900/20 border border-red-600/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-red-400 font-medium text-sm mb-1">{t('common.warning')}</p>
              <ul className="text-red-400/80 text-xs space-y-1">
                <li>• {t('keyExport.warnings.neverShare')}</li>
                <li>• {t('keyExport.warnings.impersonate')}</li>
                <li>• {t('keyExport.warnings.storeSecurely')}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
