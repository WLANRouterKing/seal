import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (nsec.trim()) {
      onImport(nsec.trim())
    }
  }

  return (
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
  )
}
