import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/authStore'
import { useMessageStore } from '../../stores/messageStore'
import type { Contact } from '../../types'
import { truncateKey } from '../../utils/format'
import MessageBubble from './MessageBubble'
import MessageInput from './MessageInput'

interface ChatWindowProps {
  contactPubkey: string
  contact?: Contact
  onBack: () => void
}

export default function ChatWindow({ contactPubkey, contact, onBack }: ChatWindowProps) {
  const { t } = useTranslation()
  const { keys } = useAuthStore()
  const { getMessagesForContact, sendMessage, deleteMessage } = useMessageStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const messages = getMessagesForContact(contactPubkey)
  const displayName = contact?.name || truncateKey(contactPubkey, 8)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (content: string) => {
    if (!keys) return
    await sendMessage(contactPubkey, content, keys.privateKey)
  }

  const handleDelete = async (messageId: string) => {
    await deleteMessage(contactPubkey, messageId)
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

        <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center overflow-hidden">
          {contact?.picture ? (
            <img src={contact.picture} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-primary-500 font-semibold">
              {displayName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="font-medium text-theme-text truncate">{displayName}</h2>
          {contact?.nip05 && (
            <p className="text-xs text-theme-muted truncate">{contact.nip05}</p>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 scrollbar-hide">
        {messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center h-full">
            <p className="text-theme-muted text-sm">
              {t('chat.startConversation')}
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} onDelete={handleDelete} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <MessageInput onSend={handleSend} />
    </div>
  )
}
