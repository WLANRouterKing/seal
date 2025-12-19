import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/authStore'
import { truncateKey } from '../utils/format'

export default function LockScreen() {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const { unlock, publicInfo, isLoading, error, clearError, logout } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    if (password.trim()) {
      await unlock(password)
      setPassword('')
    }
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center bg-theme-bg px-6 py-12">
      <div className="w-full max-w-xs">
        {/* Lock Icon */}
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 bg-primary-500/20 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-theme-text text-center mb-2">{t('lockScreen.title')}</h1>

        {publicInfo && (
          <p className="text-theme-muted text-center mb-8 text-sm">
            {truncateKey(publicInfo.npub, 12)}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('lockScreen.placeholder')}
              className="input-field text-center"
              autoFocus
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={!password.trim() || isLoading}
            className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t('lockScreen.unlocking')}
              </span>
            ) : (
              t('lockScreen.unlock')
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button
            onClick={logout}
            className="text-red-400 text-sm hover:text-red-300 transition-colors"
          >
            {t('lockScreen.logout')}
          </button>
        </div>
      </div>
    </div>
  )
}
