import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useRelayStore } from '../stores/relayStore'

export default function Layout() {
  const { t } = useTranslation()
  const { relays } = useRelayStore()
  const location = useLocation()

  const connectedCount = relays.filter(r => r.status === 'connected').length

  // Hide nav on onboarding
  if (location.pathname === '/onboarding') {
    return <Outlet />
  }

  return (
    <div className="flex flex-col h-full bg-theme-bg">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-theme-surface border-b border-theme-border">
        <h1 className="text-lg font-semibold text-theme-text">Seal - Decentralized messaging</h1>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connectedCount > 0 ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-theme-muted">
            {connectedCount} relay{connectedCount !== 1 ? 's' : ''}
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <nav className="grid grid-cols-3 bg-theme-surface border-t border-theme-border py-2">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 py-2 transition-colors ${
              isActive ? 'text-primary-500' : 'text-theme-muted hover:text-theme-text'
            }`
          }
        >
          <ChatIcon />
          <span className="text-xs">{t('nav.chats')}</span>
        </NavLink>

        <NavLink
          to="/contacts"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 py-2 transition-colors ${
              isActive ? 'text-primary-500' : 'text-theme-muted hover:text-theme-text'
            }`
          }
        >
          <ContactsIcon />
          <span className="text-xs">{t('nav.contacts')}</span>
        </NavLink>

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 py-2 transition-colors ${
              isActive ? 'text-primary-500' : 'text-theme-muted hover:text-theme-text'
            }`
          }
        >
          <SettingsIcon />
          <span className="text-xs">{t('nav.settings')}</span>
        </NavLink>
      </nav>
    </div>
  )
}

function ChatIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  )
}

function ContactsIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
