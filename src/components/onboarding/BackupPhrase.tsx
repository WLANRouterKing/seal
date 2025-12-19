import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { copyToClipboard } from '../../utils/format'

interface BackupPhraseProps {
  nsec: string
  onComplete: () => void
}

export default function BackupPhrase({ nsec, onComplete }: BackupPhraseProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const handleCopy = async () => {
    await copyToClipboard(nsec)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex-1 flex flex-col px-6 py-8">
      <div className="flex-1">
        <h2 className="text-2xl font-bold text-theme-text mb-2">{t('backup.title')}</h2>
        <p className="text-theme-muted mb-6">
          {t('backup.subtitle')}
        </p>

        <div className="bg-theme-surface border border-theme-border rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-theme-muted uppercase tracking-wide">{t('backup.privateKeyLabel')}</span>
            <button
              onClick={handleCopy}
              className="text-primary-500 text-sm hover:text-primary-400 transition-colors"
            >
              {copied ? t('common.copied') : t('common.copy')}
            </button>
          </div>
          <p className="font-mono text-sm text-theme-text break-all leading-relaxed">
            {nsec}
          </p>
        </div>

        <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-yellow-500 font-medium text-sm mb-1">{t('common.important')}</p>
              <ul className="text-yellow-500/80 text-xs space-y-1">
                <li>• {t('backup.warnings.neverShare')}</li>
                <li>• {t('backup.warnings.storeSecurely')}</li>
                <li>• {t('backup.warnings.ifLost')}</li>
              </ul>
            </div>
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1 w-5 h-5 rounded border-theme-border bg-theme-surface text-primary-500 focus:ring-primary-500 focus:ring-offset-0"
          />
          <span className="text-gray-300 text-sm">
            {t('backup.confirmLabel')}
          </span>
        </label>
      </div>

      <button
        onClick={onComplete}
        disabled={!confirmed}
        className="btn-primary w-full py-3 mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {t('backup.continueButton')}
      </button>
    </div>
  )
}
