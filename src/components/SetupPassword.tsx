import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/authStore'

interface SetupPasswordProps {
  onComplete: () => void
}

export default function SetupPassword({ onComplete }: SetupPasswordProps) {
  const { t } = useTranslation()
  const { setPassword, keys } = useAuthStore()
  const [password, setPasswordValue] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSetPassword = async () => {
    if (password.length < 6) {
      setError(t('setupPassword.errors.tooShort'))
      return
    }

    if (password !== confirmPassword) {
      setError(t('setupPassword.errors.noMatch'))
      return
    }

    setIsLoading(true)
    setError('')

    const success = await setPassword(password)
    if (success) {
      onComplete()
    } else {
      setError(t('setupPassword.errors.failed'))
    }
    setIsLoading(false)
  }

  const handleSkip = () => {
    onComplete()
  }

  return (
    <div className="min-h-full bg-theme-bg flex flex-col">
      {/* Header */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Icon */}
        <div className="w-20 h-20 rounded-full bg-primary-500/20 flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-theme-text mb-2">
          {t('setupPassword.title')}
        </h1>
        <p className="text-theme-muted text-center mb-8 max-w-sm">
          {t('setupPassword.subtitle')}
        </p>

        {/* Key Preview */}
        {keys && (
          <div className="w-full max-w-sm bg-theme-surface rounded-xl p-4 mb-6 border border-theme-border">
            <p className="text-xs text-theme-muted mb-1">{t('setupPassword.yourPublicKey')}</p>
            <p className="text-sm text-theme-text font-mono break-all">
              {keys.npub.slice(0, 20)}...{keys.npub.slice(-8)}
            </p>
          </div>
        )}

        {/* Password Form */}
        <div className="w-full max-w-sm space-y-4">
          <div>
            <label className="block text-sm text-theme-muted mb-2">
              {t('setupPassword.password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPasswordValue(e.target.value)}
              placeholder={t('setupPassword.passwordPlaceholder')}
              className="w-full px-4 py-3 bg-theme-surface border border-theme-border rounded-xl text-theme-text placeholder-gray-500 focus:outline-none focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm text-theme-muted mb-2">
              {t('setupPassword.confirmPassword')}
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('setupPassword.confirmPlaceholder')}
              className="w-full px-4 py-3 bg-theme-surface border border-theme-border rounded-xl text-theme-text placeholder-gray-500 focus:outline-none focus:border-primary-500"
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}

          <button
            onClick={handleSetPassword}
            disabled={isLoading || !password || !confirmPassword}
            className="w-full py-3 bg-primary-500 text-theme-text font-medium rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? t('setupPassword.saving') : t('setupPassword.setButton')}
          </button>
        </div>

        {/* Warning */}
        <div className="w-full max-w-sm mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm text-yellow-500 font-medium">{t('common.important')}</p>
              <p className="text-xs text-theme-muted mt-1">
                {t('setupPassword.importantNote')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Skip Button */}
      <div className="px-6 pb-8">
        <button
          onClick={handleSkip}
          className="w-full py-3 text-theme-muted hover:text-theme-text transition-colors text-sm"
        >
          {t('setupPassword.skipButton')}
        </button>
      </div>
    </div>
  )
}
