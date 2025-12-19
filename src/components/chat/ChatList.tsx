import { useTranslation } from 'react-i18next'
import { useMessageStore } from '../../stores/messageStore'
import { useContactStore } from '../../stores/contactStore'
import { formatTimestamp, truncateKey } from '../../utils/format'

interface ChatListProps {
  onSelectChat: (pubkey: string) => void
}

export default function ChatList({ onSelectChat }: ChatListProps) {
  const { t } = useTranslation()
  const { chats } = useMessageStore()
  const { contacts } = useContactStore()

  const getContactName = (pubkey: string) => {
    const contact = contacts.find(c => c.pubkey === pubkey)
    return contact?.name || truncateKey(pubkey, 8)
  }

  const getContactPicture = (pubkey: string) => {
    const contact = contacts.find(c => c.pubkey === pubkey)
    return contact?.picture
  }

  // Format message preview - replace image data with placeholder
  const formatPreview = (content: string) => {
    const hasImage = content.includes('[img:data:image/')
    const textContent = content.replace(/\[img:data:image\/[^\]]+\]/g, '').trim()

    if (hasImage && textContent) {
      return `📷 ${textContent}`
    } else if (hasImage) {
      return `📷 ${t('common.photo')}`
    }
    return content
  }

  if (chats.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 bg-theme-surface rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-theme-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-theme-text mb-2">{t('chat.noMessages')}</h3>
        <p className="text-theme-muted text-sm max-w-xs">
          {t('chat.noMessagesHint')}
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide">
      {chats.map((chat) => (
        <button
          key={chat.pubkey}
          onClick={() => onSelectChat(chat.pubkey)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-theme-surface transition-colors border-b border-theme-border"
        >
          {/* Avatar */}
          <div className="w-12 h-12 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {getContactPicture(chat.pubkey) ? (
              <img
                src={getContactPicture(chat.pubkey)}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-primary-500 font-semibold text-lg">
                {getContactName(chat.pubkey).charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-theme-text truncate">
                {getContactName(chat.pubkey)}
              </span>
              {chat.lastMessage && (
                <span className="text-xs text-theme-muted flex-shrink-0 ml-2">
                  {formatTimestamp(chat.lastMessage.createdAt)}
                </span>
              )}
            </div>
            {chat.lastMessage && (
              <p className="text-sm text-theme-muted truncate">
                {chat.lastMessage.isOutgoing && (
                  <span className="text-theme-muted">{t('common.you')}: </span>
                )}
                {formatPreview(chat.lastMessage.content)}
              </p>
            )}
          </div>

          {/* Unread Badge */}
          {chat.unreadCount > 0 && (
            <div className="w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-medium text-theme-text">
                {chat.unreadCount > 9 ? '9+' : chat.unreadCount}
              </span>
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
