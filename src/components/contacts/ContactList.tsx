import { useTranslation } from 'react-i18next'
import type { Contact } from '../../types'
import { truncateKey } from '../../utils/format'

interface ContactListProps {
  contacts: Contact[]
  onStartChat: (pubkey: string) => void
  onRemoveContact: (pubkey: string) => void
}

export default function ContactList({ contacts, onStartChat, onRemoveContact }: ContactListProps) {
  const { t } = useTranslation()

  if (contacts.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 bg-theme-surface rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-theme-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-theme-text mb-2">{t('contacts.noContacts')}</h3>
        <p className="text-theme-muted text-sm max-w-xs">
          {t('contacts.noContactsHint')}
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide">
      {contacts.map((contact) => (
        <div
          key={contact.pubkey}
          className="flex items-center gap-3 px-4 py-3 border-b border-theme-border"
        >
          {/* Avatar */}
          <div className="w-12 h-12 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {contact.picture ? (
              <img
                src={contact.picture}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-primary-500 font-semibold text-lg">
                {(contact.name || contact.npub).charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-theme-text truncate">
              {contact.name || truncateKey(contact.npub, 8)}
            </h3>
            {contact.nip05 && (
              <p className="text-xs text-primary-400 truncate">{contact.nip05}</p>
            )}
            {!contact.nip05 && contact.name && (
              <p className="text-xs text-theme-muted truncate">{truncateKey(contact.npub, 6)}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onStartChat(contact.pubkey)}
              className="p-2 text-primary-500 hover:bg-theme-surface rounded-lg transition-colors"
              title={t('contacts.startChat')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </button>
            <button
              onClick={() => onRemoveContact(contact.pubkey)}
              className="p-2 text-theme-muted hover:text-red-400 hover:bg-theme-surface rounded-lg transition-colors"
              title={t('contacts.removeContact')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
