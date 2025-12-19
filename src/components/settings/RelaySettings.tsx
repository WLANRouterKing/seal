import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRelayStore } from '../../stores/relayStore'

interface RelaySettingsProps {
  onBack: () => void
}

export default function RelaySettings({ onBack }: RelaySettingsProps) {
  const { t } = useTranslation()
  const { relays, addRelay, removeRelay } = useRelayStore()
  const [newRelayUrl, setNewRelayUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleAddRelay = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      await addRelay(newRelayUrl)
      setNewRelayUrl('')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'bg-green-500'
      case 'connecting':
        return 'bg-yellow-500 animate-pulse'
      case 'error':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  return (
    <div className="flex flex-col h-full">
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
        <h2 className="text-lg font-medium text-theme-text">{t('relaySettings.title')}</h2>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* Add Relay Form */}
        <form onSubmit={handleAddRelay} className="p-4 border-b border-theme-border">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            {t('relaySettings.addNewRelay')}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newRelayUrl}
              onChange={(e) => setNewRelayUrl(e.target.value)}
              placeholder="wss://relay.example.com"
              className="input-field flex-1"
            />
            <button
              type="submit"
              disabled={!newRelayUrl.trim()}
              className="btn-primary px-4 disabled:opacity-50"
            >
              {t('common.add')}
            </button>
          </div>
          {error && (
            <p className="mt-2 text-sm text-red-400">{error}</p>
          )}
        </form>

        {/* Relay List */}
        <div className="py-2">
          <h3 className="px-4 py-2 text-xs font-medium text-theme-muted uppercase tracking-wider">
            {t('relaySettings.connectedRelays', { count: relays.filter(r => r.status === 'connected').length })}
          </h3>

          {relays.map((relay) => (
            <div
              key={relay.url}
              className="flex items-center justify-between px-4 py-3 border-b border-theme-border"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(relay.status)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-theme-text text-sm truncate">{relay.url}</p>
                  <p className="text-xs text-theme-muted capitalize">{relay.status}</p>
                </div>
              </div>
              <button
                onClick={() => removeRelay(relay.url)}
                className="p-2 text-theme-muted hover:text-red-400 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
