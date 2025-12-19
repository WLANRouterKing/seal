import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface AddContactProps {
  onAdd: (npub: string, name?: string) => void
  onCancel: () => void
  error: string | null
}

export default function AddContact({ onAdd, onCancel, error }: AddContactProps) {
  const { t } = useTranslation()
  const [npub, setNpub] = useState('')
  const [name, setName] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (npub.trim()) {
      onAdd(npub.trim(), name.trim() || undefined)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-theme-surface border-b border-theme-border">
        <button
          onClick={onCancel}
          className="p-1 hover:bg-theme-hover rounded-lg transition-colors"
        >
          <svg className="w-6 h-6 text-theme-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-lg font-medium text-theme-text">{t('contacts.addContact')}</h2>
      </header>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex-1 px-4 py-6 space-y-4">
        <div>
          <label htmlFor="npub" className="block text-sm font-medium text-gray-300 mb-2">
            {t('contacts.publicKeyLabel')}
          </label>
          <textarea
            id="npub"
            value={npub}
            onChange={(e) => setNpub(e.target.value)}
            placeholder="npub1..."
            className="input-field h-24 resize-none font-mono text-sm"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="mt-1 text-xs text-theme-muted">
            {t('contacts.publicKeyHint')}
          </p>
        </div>

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
            {t('contacts.nameLabel')}
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('contacts.displayNamePlaceholder')}
            className="input-field"
          />
          <p className="mt-1 text-xs text-theme-muted">
            {t('contacts.nameHint')}
          </p>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={!npub.trim()}
          className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('contacts.addContact')}
        </button>
      </form>
    </div>
  )
}
