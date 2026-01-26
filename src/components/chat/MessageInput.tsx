import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Paper, Group, Textarea, ActionIcon, Box, Image, CloseButton, Loader, Text } from '@mantine/core'
import { IconPhoto, IconSend, IconMicrophone, IconPlayerStop, IconX } from '@tabler/icons-react'
import { useAudioRecorder, formatDuration, audioToFile } from '../../hooks/useAudioRecorder'

interface MessageInputProps {
  onSend: (content: string) => void
  onSendFile?: (file: File, caption?: string) => void
  contactBlocked?: boolean
}

export default function MessageInput({ onSend, onSendFile, contactBlocked }: MessageInputProps) {
  const { t } = useTranslation()
  const [message, setMessage] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imagePreviewRef = useRef<string | null>(null)

  // Audio recording
  const [audioState, audioActions] = useAudioRecorder()

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

  const handleSendAudio = () => {
    if (audioState.audioBlob && onSendFile) {
      const audioFile = audioToFile(audioState.audioBlob)
      onSendFile(audioFile)
      audioActions.cancelRecording()
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

  // Keep ref in sync with state for cleanup
  useEffect(() => {
    imagePreviewRef.current = imagePreview
  }, [imagePreview])

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreviewRef.current) {
        URL.revokeObjectURL(imagePreviewRef.current)
      }
    }
  }, [])

  const canSend = message.trim() || imagePreview

  // Show recording UI
  if (audioState.isRecording || audioState.audioBlob) {
    return (
      <Paper p="sm" radius={0} style={{ borderTop: '1px solid var(--mantine-color-dark-4)' }}>
        <Group gap="sm" align="center">
          {/* Cancel Button */}
          <ActionIcon variant="subtle" color="red" size="lg" onClick={audioActions.cancelRecording}>
            <IconX size={24} />
          </ActionIcon>

          {/* Waveform / Duration */}
          <Box style={{ flex: 1 }}>
            {audioState.isRecording ? (
              <Group gap="xs" justify="center">
                {/* Live waveform visualization */}
                <Group gap={2} align="center" h={32}>
                  {audioState.waveform.slice(-20).map((amplitude, i) => (
                    <Box key={i} w={3} h={Math.max(4, amplitude * 28)} bg="red" style={{ borderRadius: 2 }} />
                  ))}
                </Group>
                <Text size="sm" c="red" fw={500}>
                  {formatDuration(audioState.duration)}
                </Text>
              </Group>
            ) : (
              <Group gap="xs" justify="center">
                <Text size="sm" c="dimmed">
                  {t('voiceMessage.ready')} ({formatDuration(audioState.duration)})
                </Text>
              </Group>
            )}
          </Box>

          {/* Stop / Send Button */}
          {audioState.isRecording ? (
            <ActionIcon variant="filled" color="red" size="lg" radius="xl" onClick={audioActions.stopRecording}>
              <IconPlayerStop size={20} />
            </ActionIcon>
          ) : (
            <ActionIcon variant="filled" color="cyan" size="lg" radius="xl" onClick={handleSendAudio}>
              <IconSend size={20} />
            </ActionIcon>
          )}
        </Group>

        {audioState.error && (
          <Text size="xs" c="red" ta="center" mt="xs">
            {audioState.error}
          </Text>
        )}
      </Paper>
    )
  }

  return (
    <Paper p="sm" radius={0} style={{ borderTop: '1px solid var(--mantine-color-dark-4)' }}>
      {/* Image Preview */}
      {imagePreview && (
        <Box mb="sm">
          <Box pos="relative" style={{ display: 'inline-block' }}>
            <Image src={imagePreview} alt="Preview" h={128} w="auto" radius="md" />
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

      <Group gap="sm" align="flex-end" style={{ marginBottom: '.5rem' }}>
        {/* Image Upload Button */}
        <ActionIcon
          variant="subtle"
          size="lg"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing || contactBlocked}
        >
          {isProcessing ? <Loader size={20} /> : <IconPhoto size={24} />}
        </ActionIcon>

        {/* Voice Recording Button */}
        <ActionIcon
          variant="subtle"
          size="lg"
          onClick={audioActions.startRecording}
          disabled={isProcessing || !!imagePreview || contactBlocked}
        >
          <IconMicrophone size={24} />
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
          disabled={contactBlocked}
        />

        <ActionIcon
          variant="filled"
          color="cyan"
          size="lg"
          radius="xl"
          onClick={handleSubmit}
          disabled={!canSend || isProcessing || contactBlocked}
        >
          <IconSend size={20} />
        </ActionIcon>
      </Group>
    </Paper>
  )
}
