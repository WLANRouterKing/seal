import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMessageStore } from '../../stores/messageStore'
import { useContactStore } from '../../stores/contactStore'
import { formatTimestamp, truncateKey } from '../../utils/format'

interface ChatListProps {
  onSelectChat: (pubkey: string) => void
}

export default function ChatList({ onSelectChat }: ChatListProps) {
  const { t } = useTranslation()
  const { chats, deleteChat } = useMessageStore()
  const { contacts } = useContactStore()
  const [swipedChat, setSwipedChat] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

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

  const handleDelete = async (pubkey: string) => {
    await deleteChat(pubkey)
    setConfirmDelete(null)
    setSwipedChat(null)
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {chats.map((chat) => (
          <div key={chat.pubkey} className="relative overflow-hidden border-b border-theme-border">
            {/* Delete button (revealed on swipe) */}
            <div className="absolute inset-y-0 right-0 flex items-center">
              <button
                onClick={() => setConfirmDelete(chat.pubkey)}
                className="h-full px-6 bg-red-600 text-white font-medium flex items-center"
              >
                {t('common.delete')}
              </button>
            </div>

            {/* Chat item */}
            <div
              className={`group relative bg-theme-bg flex items-center gap-3 px-4 py-3 transition-transform duration-200 hover:bg-theme-surface ${
                swipedChat === chat.pubkey ? '-translate-x-20' : 'translate-x-0'
              }`}
              onClick={() => {
                if (swipedChat === chat.pubkey) {
                  setSwipedChat(null)
                } else {
                  onSelectChat(chat.pubkey)
                }
              }}
              onTouchStart={(e) => {
                const touch = e.touches[0]
                const startX = touch.clientX
                const el = e.currentTarget

                const handleMove = (e: TouchEvent) => {
                  const diff = startX - e.touches[0].clientX
                  if (diff > 50) {
                    setSwipedChat(chat.pubkey)
                  } else if (diff < -30) {
                    setSwipedChat(null)
                  }
                }

                const handleEnd = () => {
                  el.removeEventListener('touchmove', handleMove)
                  el.removeEventListener('touchend', handleEnd)
                }

                el.addEventListener('touchmove', handleMove)
                el.addEventListener('touchend', handleEnd)
              }}
            >
              {/* Desktop: Delete button on hover */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirmDelete(chat.pubkey)
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-red-600/10 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block hover:bg-red-600/20"
                title={t('common.delete')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
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
            </div>
          </div>
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-theme-surface rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-theme-text mb-2">
              {t('chat.deleteChat')}
            </h3>
            <p className="text-theme-muted text-sm mb-6">
              {t('chat.deleteChatConfirm')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setConfirmDelete(null)
                  setSwipedChat(null)
                }}
                className="flex-1 py-2 px-4 rounded-lg bg-theme-hover text-theme-text"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 py-2 px-4 rounded-lg bg-red-600 text-white"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
