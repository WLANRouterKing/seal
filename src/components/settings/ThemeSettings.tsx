import { useTranslation } from 'react-i18next'
import { useThemeStore } from '../../stores/themeStore'

interface ThemeSettingsProps {
  onBack: () => void
}

export default function ThemeSettings({ onBack }: ThemeSettingsProps) {
  const { t } = useTranslation()
  const { theme, setTheme } = useThemeStore()

  const themes = [
    { id: 'dark' as const, label: t('settings.themeDark'), description: t('themeSettings.darkDesc') },
    { id: 'light' as const, label: t('settings.themeLight'), description: t('themeSettings.lightDesc') },
    { id: 'system' as const, label: t('settings.themeSystem'), description: t('themeSettings.systemDesc') },
  ]

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
        <h1 className="text-lg font-semibold text-theme">{t('themeSettings.title')}</h1>
      </header>

      {/* Theme Options */}
      <div className="flex-1 overflow-y-auto">
        <div className="py-4">
          <h3 className="px-4 pb-2 text-xs font-medium text-theme-muted uppercase tracking-wider">
            {t('themeSettings.themeLabel')}
          </h3>

          <div className="space-y-1">
            {themes.map((themeOption) => (
              <button
                key={themeOption.id}
                onClick={() => setTheme(themeOption.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-theme-surface transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    themeOption.id === 'dark' ? 'bg-gray-800' :
                    themeOption.id === 'light' ? 'bg-gray-200' :
                    'bg-gradient-to-br from-gray-800 to-gray-200'
                  }`}>
                    {themeOption.id === 'dark' && (
                      <svg className="w-5 h-5 text-theme-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                    )}
                    {themeOption.id === 'light' && (
                      <svg className="w-5 h-5 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    )}
                    {themeOption.id === 'system' && (
                      <svg className="w-5 h-5 text-theme-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>
                  <div className="text-left">
                    <p className="text-theme font-medium">{themeOption.label}</p>
                    <p className="text-xs text-theme-muted">{themeOption.description}</p>
                  </div>
                </div>

                {/* Radio indicator */}
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  theme === themeOption.id
                    ? 'border-primary-500 bg-primary-500'
                    : 'border-theme-muted'
                }`}>
                  {theme === themeOption.id && (
                    <svg className="w-3 h-3 text-theme-text" fill="currentColor" viewBox="0 0 20 20">
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
