import { useTranslation } from 'react-i18next'

interface LanguageSettingsProps {
  onBack: () => void
}

export default function LanguageSettings({ onBack }: LanguageSettingsProps) {
  const { t, i18n } = useTranslation()

  const languages = [
    { code: 'en', label: 'English', native: 'English' },
    { code: 'de', label: 'German', native: 'Deutsch' },
  ]

  const handleChange = (code: string) => {
    i18n.changeLanguage(code)
  }

  return (
    <div className="flex flex-col h-full bg-theme-bg">
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
        <h1 className="text-lg font-semibold text-theme-text">{t('settings.language')}</h1>
      </header>

      {/* Language Options */}
      <div className="flex-1 overflow-y-auto">
        <div className="py-4">
          <div className="space-y-1">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleChange(lang.code)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-theme-hover transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <span className="text-blue-500 font-medium text-sm">
                      {lang.code.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-left">
                    <p className="text-theme-text font-medium">{lang.native}</p>
                    <p className="text-xs text-theme-muted">{lang.label}</p>
                  </div>
                </div>

                {/* Radio indicator */}
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  i18n.language.startsWith(lang.code)
                    ? 'border-primary-500 bg-primary-500'
                    : 'border-theme-muted'
                }`}>
                  {i18n.language.startsWith(lang.code) && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
