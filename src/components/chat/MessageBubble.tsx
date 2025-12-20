import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { Message } from '../../types'
import { formatTimestamp } from '../../utils/format'
import { useAuthStore } from '../../stores/authStore'
import { getDecryptedFileUrl } from '../../services/fileUpload'

interface MessageBubbleProps {
  message: Message
  contactPubkey: string
  onDelete?: (id: string) => void
}

interface FileData {
  url: string
  mimeType: string
  encrypted?: boolean
}

// Regex to extract image from content: [img:data:image/...] (legacy base64)
const IMAGE_REGEX = /\[img:(data:image\/[^\]]+)\]/g
// Regex to extract file data: [file:{...}] (new JSON format) or [file:https://...] (legacy)
const FILE_DATA_REGEX = /\[file:(\{[^\]]+\}|https?:\/\/[^\]]+)\]/g

export default function MessageBubble({ message, contactPubkey, onDelete }: MessageBubbleProps) {
  const { t } = useTranslation()
  const { keys } = useAuthStore()
  const isOutgoing = message.isOutgoing
  const { textContent, legacyImages, files } = parseContent(message.content)
  const [showMenu, setShowMenu] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // For decryption: use our private key + contact's pubkey
  // (same conversation key works for both directions in NIP-44)
  const privateKey = keys?.privateKey || ''
  const otherPubkey = contactPubkey

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
        {/* Legacy base64 images */}
        {legacyImages.length > 0 && (
          <div className="space-y-1">
            {legacyImages.map((src, index) => (
              <ImageWithLightbox key={`legacy-${index}`} src={src} />
            ))}
          </div>
        )}

        {/* Encrypted file images */}
        {files.length > 0 && (
          <div className="space-y-1">
            {files.map((file, index) => (
              <EncryptedImage
                key={`file-${index}`}
                file={file}
                privateKey={privateKey}
                otherPubkey={otherPubkey}
              />
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
        <div className={`flex items-center gap-1 px-4 pb-2 ${!textContent && (legacyImages.length > 0 || files.length > 0) ? 'pt-2' : ''} ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
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

function parseContent(content: string): { textContent: string; legacyImages: string[]; files: FileData[] } {
  const legacyImages: string[] = []
  const files: FileData[] = []
  let match

  // Extract legacy base64 images [img:data:image/...]
  while ((match = IMAGE_REGEX.exec(content)) !== null) {
    legacyImages.push(match[1])
  }

  // Extract file data [file:{...}] or [file:https://...]
  while ((match = FILE_DATA_REGEX.exec(content)) !== null) {
    const data = match[1]
    if (data.startsWith('{')) {
      // New JSON format
      try {
        const fileData = JSON.parse(data) as FileData
        files.push(fileData)
      } catch {
        // Invalid JSON, skip
      }
    } else {
      // Legacy URL format (unencrypted)
      files.push({
        url: data,
        mimeType: 'image/jpeg', // Assume image
        encrypted: false
      })
    }
  }

  // Remove image and file tags from text
  const textContent = content
    .replace(IMAGE_REGEX, '')
    .replace(FILE_DATA_REGEX, '')
    .trim()

  return { textContent, legacyImages, files }
}

// Component for displaying encrypted images
function EncryptedImage({
  file,
  privateKey,
  otherPubkey
}: {
  file: FileData
  privateKey: string
  otherPubkey: string
}) {
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let objectUrl: string | null = null

    async function decrypt() {
      if (!file.encrypted) {
        // Not encrypted, use URL directly
        setDecryptedUrl(file.url)
        setIsLoading(false)
        return
      }

      if (!privateKey || !otherPubkey) {
        setError(true)
        setIsLoading(false)
        return
      }

      try {
        objectUrl = await getDecryptedFileUrl(
          file.url,
          file.mimeType,
          privateKey,
          otherPubkey
        )
        setDecryptedUrl(objectUrl)
      } catch (err) {
        console.error('Failed to decrypt image:', err)
        setError(true)
      } finally {
        setIsLoading(false)
      }
    }

    decrypt()

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [file.url, file.mimeType, file.encrypted, privateKey, otherPubkey])

  if (isLoading) {
    return (
      <div className="w-48 h-48 bg-theme-surface flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !decryptedUrl) {
    return (
      <div className="w-48 h-32 bg-theme-surface flex items-center justify-center text-theme-muted text-sm">
        <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        Failed to load
      </div>
    )
  }

  return <ImageWithLightbox src={decryptedUrl} />
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
