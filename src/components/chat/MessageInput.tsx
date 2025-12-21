import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Paper,
  Group,
  Textarea,
  ActionIcon,
  Box,
  Image,
  CloseButton,
  Loader,
} from '@mantine/core'
import { IconPhoto, IconSend } from '@tabler/icons-react'

interface MessageInputProps {
  onSend: (content: string) => void
  onSendFile?: (file: File, caption?: string) => void
}

export default function MessageInput({ onSend, onSendFile }: MessageInputProps) {
  const { t } = useTranslation()
  const [message, setMessage] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = () => {
    const trimmedMessage = message.trim()

    if (selectedFile && onSendFile) {
      onSendFile(selectedFile, trimmedMessage || undefined)
      setSelectedFile(null)
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
      handleSubmit()
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
      const previewUrl = URL.createObjectURL(file)
      setImagePreview(previewUrl)
      setSelectedFile(file)
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
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview)
    }
    setImagePreview(null)
    setSelectedFile(null)
  }

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview)
      }
    }
  }, [])

  const canSend = message.trim() || imagePreview

  return (
    <Paper p="sm" radius={0} style={{ borderTop: '1px solid var(--mantine-color-dark-4)' }}>
      {/* Image Preview */}
      {imagePreview && (
        <Box mb="sm">
          <Box pos="relative" style={{ display: 'inline-block' }}>
            <Image
              src={imagePreview}
              alt="Preview"
              h={128}
              w="auto"
              radius="md"
            />
            <CloseButton
              pos="absolute"
              top={-8}
              right={-8}
              size="sm"
              radius="xl"
              color="red"
              variant="filled"
              onClick={removeImage}
            />
          </Box>
        </Box>
      )}

      <Group gap="sm" align="flex-end">
        {/* Image Upload Button */}
        <ActionIcon
          variant="subtle"
          size="lg"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <Loader size={20} />
          ) : (
            <IconPhoto size={24} />
          )}
        </ActionIcon>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          style={{ display: 'none' }}
        />

        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={imagePreview ? t('chat.captionPlaceholder') : t('chat.messagePlaceholder')}
          autosize
          minRows={1}
          maxRows={4}
          style={{ flex: 1 }}
          radius="xl"
        />

        <ActionIcon
          variant="filled"
          color="cyan"
          size="lg"
          radius="xl"
          onClick={handleSubmit}
          disabled={!canSend || isProcessing}
        >
          <IconSend size={20} />
        </ActionIcon>
      </Group>
    </Paper>
  )
}
