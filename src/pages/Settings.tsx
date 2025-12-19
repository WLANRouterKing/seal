import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/authStore'
import { useRelayStore } from '../stores/relayStore'
import { useThemeStore } from '../stores/themeStore'
import { truncateKey, copyToClipboard } from '../utils/format'
import RelaySettings from '../components/settings/RelaySettings'
import KeyExport from '../components/settings/KeyExport'
import ThemeSettings from '../components/settings/ThemeSettings'
import SecuritySettings from '../components/settings/SecuritySettings'
import LanguageSettings from '../components/settings/LanguageSettings'
import { SyncModal } from '../components/sync/SyncModal'

type SettingsView = 'main' | 'relays' | 'keys' | 'theme' | 'security' | 'language' | 'sync'

export default function Settings() {
  const { t, i18n } = useTranslation()
  const [view, setView] = useState<SettingsView>('main')
  const { keys, logout, hasPassword } = useAuthStore()
  const { relays } = useRelayStore()
  const { theme } = useThemeStore()

  const connectedCount = relays.filter(r => r.status === 'connected').length

  if (view === 'relays') {
    return <RelaySettings onBack={() => setView('main')} />
  }

  if (view === 'keys') {
    return <KeyExport onBack={() => setView('main')} />
  }

  if (view === 'theme') {
    return <ThemeSettings onBack={() => setView('main')} />
  }

  if (view === 'security') {
    return <SecuritySettings onBack={() => setView('main')} />
  }

  if (view === 'language') {
    return <LanguageSettings onBack={() => setView('main')} />
  }

  if (view === 'sync') {
    return <SyncModal onBack={() => setView('main')} />
  }

  const themeLabel = theme === 'dark' ? t('settings.themeDark') : theme === 'light' ? t('settings.themeLight') : t('settings.themeSystem')
  const languageLabel = i18n.language === 'de' ? 'Deutsch' : 'English'

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-hide bg-theme-bg">
      {/* Profile Section */}
      <div className="px-4 py-6 bg-theme-surface border-b border-theme-border">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary-500/20 flex items-center justify-center">
            <span className="text-primary-500 font-bold text-2xl">
              {keys?.npub.charAt(5).toUpperCase() || '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-medium text-theme-text">{t('settings.yourProfile')}</h2>
            <button
              onClick={() => keys && copyToClipboard(keys.npub)}
              className="text-sm text-theme-muted hover:text-primary-500 flex items-center gap-1 transition-colors"
            >
              <span className="truncate">{keys ? truncateKey(keys.npub, 12) : t('settings.notLoggedIn')}</span>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Settings List */}
      <div className="flex-1">
        <div className="py-2">
          <h3 className="px-4 py-2 text-xs font-medium text-theme-muted uppercase tracking-wider">
            {t('settings.network')}
          </h3>

          <button
            onClick={() => setView('relays')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-theme-hover transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-theme-text font-medium">{t('settings.relays')}</p>
                <p className="text-xs text-theme-muted">{t('settings.relaysConnected', { connected: connectedCount, total: relays.length })}</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-theme-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <button
            onClick={() => setView('sync')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-theme-hover transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-theme-text font-medium">{t('sync.title')}</p>
                <p className="text-xs text-theme-muted">{t('sync.description')}</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-theme-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="py-2">
          <h3 className="px-4 py-2 text-xs font-medium text-theme-muted uppercase tracking-wider">
            {t('settings.appearance')}
          </h3>

          <button
            onClick={() => setView('theme')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-theme-hover transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-theme-text font-medium">{t('settings.theme')}</p>
                <p className="text-xs text-theme-muted">{themeLabel}</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-theme-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="py-2">
          <h3 className="px-4 py-2 text-xs font-medium text-theme-muted uppercase tracking-wider">
            {t('settings.security')}
          </h3>

          <button
            onClick={() => setView('security')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-theme-hover transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${hasPassword ? 'bg-green-500/20' : 'bg-orange-500/20'}`}>
                <svg className={`w-5 h-5 ${hasPassword ? 'text-green-500' : 'text-orange-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-theme-text font-medium">{t('settings.passwordProtection')}</p>
                <p className="text-xs text-theme-muted">{hasPassword ? t('common.enabled') : t('common.notSet')}</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-theme-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <button
            onClick={() => setView('keys')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-theme-hover transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-theme-text font-medium">{t('settings.exportKeys')}</p>
                <p className="text-xs text-theme-muted">{t('settings.backupPrivateKey')}</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-theme-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="py-2">
          <button
            onClick={() => setView('language')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-theme-hover transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-theme-text font-medium">{t('settings.language')}</p>
                <p className="text-xs text-theme-muted">{languageLabel}</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-theme-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="py-2">
          <h3 className="px-4 py-2 text-xs font-medium text-theme-muted uppercase tracking-wider">
            {t('settings.account')}
          </h3>

          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-theme-hover transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-red-500 font-medium">{t('settings.logout')}</p>
              <p className="text-xs text-theme-muted">{t('settings.logoutHint')}</p>
            </div>
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-6 text-center">
        <p className="text-xs text-theme-muted">
          Seal {__APP_VERSION__}
        </p>
        <p className="text-xs text-theme-muted mt-1">
          {t('settings.footer')}
        </p>
      </div>
    </div>
  )
}
