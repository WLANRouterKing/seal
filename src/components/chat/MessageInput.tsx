import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

interface MessageInputProps {
  onSend: (content: string) => void
}

// NIP-44 has a 65535 byte plaintext limit, Base64 adds ~33% overhead
// So we limit to ~45KB which gives us room for caption text
const MAX_IMAGE_SIZE = 45 * 1024

export default function MessageInput({ onSend }: MessageInputProps) {
  const { t } = useTranslation()
  const [message, setMessage] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedMessage = message.trim()

    if (imagePreview) {
      // Send image with optional caption
      const content = trimmedMessage
        ? `${trimmedMessage}\n[img:${imagePreview}]`
        : `[img:${imagePreview}]`
      onSend(content)
      setImagePreview(null)
      setMessage('')
    } else if (trimmedMessage) {
      onSend(trimmedMessage)
      setMessage('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert(t('chat.imageError'))
      return
    }

    setIsProcessing(true)

    try {
      const base64 = await compressAndConvertToBase64(file)
      setImagePreview(base64)
    } catch (error) {
      console.error('Failed to process image:', error)
      alert(t('chat.imageFailed'))
    } finally {
      setIsProcessing(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const removeImage = () => {
    setImagePreview(null)
  }

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
    }
  }, [message])

  const canSend = message.trim() || imagePreview

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-theme-surface border-t border-theme-border"
    >
      {/* Image Preview */}
      {imagePreview && (
        <div className="px-4 pt-3">
          <div className="relative inline-block">
            <img
              src={imagePreview}
              alt="Preview"
              className="max-h-32 rounded-lg border border-theme-border"
            />
            <button
              type="button"
              onClick={removeImage}
              className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
            >
              <svg className="w-4 h-4 text-theme-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 px-4 py-3">
        {/* Image Upload Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
          className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-theme-hover transition-colors disabled:opacity-50"
        >
          {isProcessing ? (
            <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-6 h-6 text-theme-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          className="hidden"
        />

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={imagePreview ? t('chat.captionPlaceholder') : t('chat.messagePlaceholder')}
            rows={1}
            className="w-full bg-theme-bg border border-theme-border rounded-2xl px-4 py-3 text-theme-text placeholder-gray-500 focus:outline-none focus:border-primary-500 resize-none max-h-30 scrollbar-hide"
          />
        </div>

        <button
          type="submit"
          disabled={!canSend || isProcessing}
          className="w-11 h-11 bg-primary-500 rounded-full flex items-center justify-center hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          <svg className="w-5 h-5 text-theme-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </button>
      </div>
    </form>
  )
}

async function compressAndConvertToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    img.onload = () => {
      // Calculate new dimensions (max 400px for smaller file size)
      let maxDim = 400
      let { width, height } = img

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = (height / width) * maxDim
          width = maxDim
        } else {
          width = (width / height) * maxDim
          height = maxDim
        }
      }

      canvas.width = width
      canvas.height = height
      ctx?.drawImage(img, 0, 0, width, height)

      // Start with quality 0.6, reduce if too large
      let quality = 0.6
      let base64 = canvas.toDataURL('image/jpeg', quality)

      // Progressively reduce quality and size if needed
      while (base64.length > MAX_IMAGE_SIZE && quality > 0.1) {
        quality -= 0.1
        base64 = canvas.toDataURL('image/jpeg', quality)
      }

      // If still too large, reduce dimensions further
      while (base64.length > MAX_IMAGE_SIZE && maxDim > 100) {
        maxDim -= 50
        const scale = maxDim / Math.max(img.width, img.height)
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height)
        base64 = canvas.toDataURL('image/jpeg', 0.5)
      }

      if (base64.length > MAX_IMAGE_SIZE) {
        reject(new Error('Image too large. Try a smaller image.'))
        return
      }

      resolve(base64)
    }

    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}
