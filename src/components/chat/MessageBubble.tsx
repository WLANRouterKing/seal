import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Message } from '../../types'
import { formatTimestamp } from '../../utils/format'

interface MessageBubbleProps {
  message: Message
  onDelete?: (id: string) => void
}

// Regex to extract image from content: [img:data:image/...]
const IMAGE_REGEX = /\[img:(data:image\/[^\]]+)\]/g

export default function MessageBubble({ message, onDelete }: MessageBubbleProps) {
  const { t } = useTranslation()
  const isOutgoing = message.isOutgoing
  const { textContent, images } = parseContent(message.content)
  const [showMenu, setShowMenu] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      setShowMenu(true)
    }, 500)
  }

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setShowMenu(true)
  }

  const handleDelete = () => {
    setShowMenu(false)
    onDelete?.(message.id)
  }

  return (
    <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} relative`}>
      <div
        className={`max-w-[80%] rounded-2xl overflow-hidden ${
          isOutgoing
            ? 'bg-primary-500 text-white rounded-br-md'
            : 'bg-theme-surface text-theme-text rounded-bl-md'
        } select-none`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onContextMenu={handleContextMenu}
      >
        {/* Images */}
        {images.length > 0 && (
          <div className="space-y-1">
            {images.map((src, index) => (
              <ImageWithLightbox key={index} src={src} />
            ))}
          </div>
        )}

        {/* Text Content */}
        {textContent && (
          <div className="px-4 py-2">
            <p className="text-sm whitespace-pre-wrap break-words">{textContent}</p>
          </div>
        )}

        {/* Timestamp and Status */}
        <div className={`flex items-center gap-1 px-4 pb-2 ${!textContent && images.length > 0 ? 'pt-2' : ''} ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
          <span className={`text-xs ${isOutgoing ? 'text-primary-200' : 'text-theme-muted'}`}>
            {formatTimestamp(message.createdAt)}
          </span>
          {isOutgoing && (
            <StatusIcon status={message.status} />
          )}
        </div>
      </div>

      {/* Context Menu */}
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowMenu(false)}
          />
          <div
            className={`absolute z-50 bg-theme-surface border border-theme-border rounded-lg shadow-lg py-1 min-w-[120px] ${
              isOutgoing ? 'right-0' : 'left-0'
            } top-full mt-1`}
          >
            <button
              className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-theme-hover transition-colors flex items-center gap-2"
              onClick={handleDelete}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {t('message.delete')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function parseContent(content: string): { textContent: string; images: string[] } {
  const images: string[] = []
  let match

  while ((match = IMAGE_REGEX.exec(content)) !== null) {
    images.push(match[1])
  }

  // Remove image tags from text
  const textContent = content.replace(IMAGE_REGEX, '').trim()

  return { textContent, images }
}

function ImageWithLightbox({ src }: { src: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <img
        src={src}
        alt="Shared image"
        className="max-w-full cursor-pointer hover:opacity-90 transition-opacity"
        onClick={() => setIsOpen(true)}
      />

      {/* Lightbox */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
            onClick={() => setIsOpen(false)}
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={src}
            alt="Full size"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}

function StatusIcon({ status }: { status: Message['status'] }) {
  switch (status) {
    case 'sending':
      return (
        <svg className="w-4 h-4 text-primary-200 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    case 'sent':
      return (
        <svg className="w-4 h-4 text-primary-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )
    case 'delivered':
      return (
        <svg className="w-4 h-4 text-primary-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7M5 13l4 4L19 7" transform="translate(2, 0)" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" transform="translate(-2, 0)" />
        </svg>
      )
    case 'read':
      return (
        <svg className="w-4 h-4 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7M5 13l4 4L19 7" transform="translate(2, 0)" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" transform="translate(-2, 0)" />
        </svg>
      )
    case 'failed':
      return (
        <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    default:
      return null
  }
}
