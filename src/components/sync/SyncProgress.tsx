import { useTranslation } from 'react-i18next'

interface SyncProgressProps {
  current: number
  total: number
  isSending: boolean
}

export function SyncProgress({ current, total, isSending }: SyncProgressProps) {
  const { t } = useTranslation()
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="w-20 h-20 relative">
        {/* Circular progress */}
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="40"
            cy="40"
            r="36"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            className="text-theme-border"
          />
          <circle
            cx="40"
            cy="40"
            r="36"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            className="text-primary-500 transition-all duration-300"
            strokeDasharray={`${2 * Math.PI * 36}`}
            strokeDashoffset={`${2 * Math.PI * 36 * (1 - percentage / 100)}`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-semibold">{percentage}%</span>
        </div>
      </div>

      <div className="text-center">
        <p className="text-lg font-medium">
          {isSending
            ? (t('sync.sending') || 'Sending...')
            : (t('sync.receiving') || 'Receiving...')
          }
        </p>
        <p className="text-theme-text-secondary text-sm">
          {current} / {total} {t('sync.chunks') || 'chunks'}
        </p>
      </div>

      {/* Linear progress bar */}
      <div className="w-full max-w-xs h-2 bg-theme-border rounded-full overflow-hidden">
        <div
          className="h-full bg-primary-500 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <p className="text-theme-text-secondary text-sm">
        {t('sync.doNotClose') || 'Do not close this screen'}
      </p>
    </div>
  )
}
