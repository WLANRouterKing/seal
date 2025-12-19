import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/authStore'

interface SecuritySettingsProps {
  onBack: () => void
}

export default function SecuritySettings({ onBack }: SecuritySettingsProps) {
  const { t } = useTranslation()
  const { hasPassword, lock } = useAuthStore()
  const [showSetPassword, setShowSetPassword] = useState(false)
  const [showRemovePassword, setShowRemovePassword] = useState(false)

  return (
    <div className="flex flex-col h-full bg-theme-bg">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-theme-surface border-b border-theme">
        <button
          onClick={onBack}
          className="p-1 hover:bg-theme-surface rounded-lg transition-colors"
        >
          <svg className="w-6 h-6 text-theme" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-theme">{t('securitySettings.title')}</h1>
      </header>

      {showSetPassword && (
        <SetPasswordForm
          onSuccess={() => setShowSetPassword(false)}
          onCancel={() => setShowSetPassword(false)}
        />
      )}

      {showRemovePassword && (
        <RemovePasswordForm
          onSuccess={() => setShowRemovePassword(false)}
          onCancel={() => setShowRemovePassword(false)}
        />
      )}

      {!showSetPassword && !showRemovePassword && (
        <div className="flex-1 overflow-y-auto">
          <div className="py-4">
            <h3 className="px-4 pb-2 text-xs font-medium text-theme-muted uppercase tracking-wider">
              {t('securitySettings.passwordProtection')}
            </h3>

            {!hasPassword ? (
              <button
                onClick={() => setShowSetPassword(true)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-theme-surface transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-theme font-medium">{t('securitySettings.setPassword')}</p>
                    <p className="text-xs text-theme-muted">{t('securitySettings.setPasswordHint')}</p>
                  </div>
                </div>
                <svg className="w-5 h-5 text-theme-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ) : (
              <>
                <div className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-theme font-medium">{t('securitySettings.passwordEnabled')}</p>
                      <p className="text-xs text-green-500">{t('securitySettings.keysProtected')}</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={lock}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-theme-surface transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-theme font-medium">{t('securitySettings.lockNow')}</p>
                    <p className="text-xs text-theme-muted">{t('securitySettings.lockNowHint')}</p>
                  </div>
                </button>

                <button
                  onClick={() => setShowRemovePassword(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-theme-surface transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-red-400 font-medium">{t('securitySettings.removePassword')}</p>
                    <p className="text-xs text-theme-muted">{t('securitySettings.removePasswordHint')}</p>
                  </div>
                </button>
              </>
            )}
          </div>

          <div className="px-4 py-4">
            <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
              <p className="text-yellow-500 text-sm font-medium mb-1">{t('common.important')}</p>
              <p className="text-theme-secondary text-xs">
                {hasPassword
                  ? t('securitySettings.importantWithPassword')
                  : t('securitySettings.importantWithoutPassword')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SetPasswordForm({
  onSuccess,
  onCancel
}: {
  onSuccess: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [password, setPasswordValue] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { setPassword } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError(t('securitySettings.errors.tooShort'))
      return
    }

    if (password !== confirmPassword) {
      setError(t('securitySettings.errors.noMatch'))
      return
    }

    setIsLoading(true)
    const success = await setPassword(password)
    setIsLoading(false)

    if (success) {
      onSuccess()
    } else {
      setError(t('securitySettings.errors.setFailed'))
    }
  }

  return (
    <div className="flex-1 px-4 py-6">
      <h2 className="text-xl font-semibold text-theme mb-2">{t('securitySettings.createPasswordTitle')}</h2>
      <p className="text-theme-secondary text-sm mb-6">
        {t('securitySettings.createPasswordHint')}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-2">
            {t('securitySettings.passwordLabel')}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPasswordValue(e.target.value)}
            className="input-field"
            placeholder={t('securitySettings.passwordPlaceholder')}
            autoComplete="new-password"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-2">
            {t('securitySettings.confirmPasswordLabel')}
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input-field"
            placeholder={t('securitySettings.confirmPasswordPlaceholder')}
            autoComplete="new-password"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary flex-1"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={isLoading || !password || !confirmPassword}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {isLoading ? t('securitySettings.setting') : t('securitySettings.setPasswordButton')}
          </button>
        </div>
      </form>
    </div>
  )
}

function RemovePasswordForm({
  onSuccess,
  onCancel
}: {
  onSuccess: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [password, setPasswordValue] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { removePassword } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    setIsLoading(true)
    const success = await removePassword(password)
    setIsLoading(false)

    if (success) {
      onSuccess()
    } else {
      setError(t('securitySettings.errors.incorrect'))
    }
  }

  return (
    <div className="flex-1 px-4 py-6">
      <h2 className="text-xl font-semibold text-theme mb-2">{t('securitySettings.removePasswordTitle')}</h2>
      <p className="text-theme-secondary text-sm mb-6">
        {t('securitySettings.removePasswordHint2')}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-2">
            {t('securitySettings.currentPasswordLabel')}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPasswordValue(e.target.value)}
            className="input-field"
            placeholder={t('securitySettings.currentPasswordPlaceholder')}
            autoComplete="current-password"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary flex-1"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={isLoading || !password}
            className="btn-primary flex-1 disabled:opacity-50 bg-red-500 hover:bg-red-600"
          >
            {isLoading ? t('securitySettings.removing') : t('securitySettings.removePasswordButton')}
          </button>
        </div>
      </form>
    </div>
  )
}
