import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Box,
  Paper,
  Text,
  Group,
  Menu,
  Loader,
  Modal,
  Image,
  Center,
  ActionIcon,
} from '@mantine/core'
import { IconTrash, IconCheck, IconChecks, IconAlertCircle, IconX, IconClock, IconPlayerPlay, IconPlayerPause } from '@tabler/icons-react'
import type { Message } from '../../types'
import { formatTimestamp } from '../../utils/format'
import { useAuthStore } from '../../stores/authStore'
import { nsecToPrivateKey } from '../../services/keys'
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

const IMAGE_REGEX = /\[img:(data:image\/[^\]]+)\]/g
const FILE_DATA_REGEX = /\[file:(\{[^\]]+\}|https?:\/\/[^\]]+)\]/g

export default function MessageBubble({ message, contactPubkey, onDelete }: MessageBubbleProps) {
  const { t } = useTranslation()
  const { keys } = useAuthStore()
  const isOutgoing = message.isOutgoing
  const { textContent, legacyImages, imageFiles, audioFiles } = parseContent(message.content)
  const [menuOpened, setMenuOpened] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isExpired, setIsExpired] = useState(false)

  const privateKey = keys ? (nsecToPrivateKey(keys.nsec) || '') : ''
  const otherPubkey = contactPubkey

  // Check expiration and auto-hide when expired
  useEffect(() => {
    if (!message.expiration) return

    const checkExpiration = () => {
      const now = Math.floor(Date.now() / 1000)
      if (now >= message.expiration!) {
        setIsExpired(true)
      }
    }

    checkExpiration()
    const interval = setInterval(checkExpiration, 1000)
    return () => clearInterval(interval)
  }, [message.expiration])

  // Don't render if expired
  if (isExpired) return null

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      setMenuOpened(true)
    }, 500)
  }

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
    }
  }

  const handleDelete = () => {
    setMenuOpened(false)
    onDelete?.(message.id)
  }

  return (
    <Box style={{ display: 'flex', justifyContent: isOutgoing ? 'flex-end' : 'flex-start' }}>
      <Menu opened={menuOpened} onChange={setMenuOpened} position="bottom" withinPortal>
        <Menu.Target>
          <Paper
            p={0}
            radius="lg"
            bg={isOutgoing ? 'cyan.6' : 'dark.5'}
            maw={{ base: '75%', sm: '65%', md: '25%' }}
            style={{
              borderBottomRightRadius: isOutgoing ? 4 : undefined,
              borderBottomLeftRadius: !isOutgoing ? 4 : undefined,
              overflow: 'hidden',
              userSelect: 'none',
            }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenuOpened(true)
            }}
          >
            {/* Legacy base64 images */}
            {legacyImages.length > 0 && legacyImages.map((src, index) => (
              <ImageWithLightbox key={`legacy-${index}`} src={src} />
            ))}

            {/* Encrypted file images */}
            {imageFiles.length > 0 && imageFiles.map((file, index) => (
              <EncryptedImage
                key={`file-${index}`}
                file={file}
                privateKey={privateKey}
                otherPubkey={otherPubkey}
              />
            ))}

            {/* Audio messages */}
            {audioFiles.length > 0 && audioFiles.map((file, index) => (
              <AudioPlayer
                key={`audio-${index}`}
                file={file}
                privateKey={privateKey}
                otherPubkey={otherPubkey}
                isOutgoing={isOutgoing}
              />
            ))}

            {/* Text Content */}
            {textContent && (
              <Box px="md" py="xs">
                <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} c="white">
                  {textContent}
                </Text>
              </Box>
            )}

            {/* Timestamp and Status */}
            <Group
              gap={4}
              px="md"
              pb="xs"
              pt={!textContent && (legacyImages.length > 0 || imageFiles.length > 0 || audioFiles.length > 0) ? 'xs' : 0}
              justify={isOutgoing ? 'flex-end' : 'flex-start'}
            >
              <Text size="xs" c={isOutgoing ? 'cyan.2' : 'dimmed'}>
                {formatTimestamp(message.createdAt)}
              </Text>
              {message.expiration && <ExpirationTimer expiration={message.expiration} isOutgoing={isOutgoing} />}
              {isOutgoing && <StatusIcon status={message.status} />}
            </Group>
          </Paper>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Item
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={handleDelete}
          >
            {t('message.delete')}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Box>
  )
}

function parseContent(content: string): { textContent: string; legacyImages: string[]; imageFiles: FileData[]; audioFiles: FileData[] } {
  const legacyImages: string[] = []
  const imageFiles: FileData[] = []
  const audioFiles: FileData[] = []
  let match

  while ((match = IMAGE_REGEX.exec(content)) !== null) {
    legacyImages.push(match[1])
  }

  while ((match = FILE_DATA_REGEX.exec(content)) !== null) {
    const data = match[1]
    if (data.startsWith('{')) {
      try {
        const fileData = JSON.parse(data) as FileData
        if (fileData.mimeType.startsWith('audio/')) {
          audioFiles.push(fileData)
        } else {
          imageFiles.push(fileData)
        }
      } catch {
        // Invalid JSON, skip
      }
    } else {
      imageFiles.push({
        url: data,
        mimeType: 'image/jpeg',
        encrypted: false
      })
    }
  }

  const textContent = content
    .replace(IMAGE_REGEX, '')
    .replace(FILE_DATA_REGEX, '')
    .trim()

  return { textContent, legacyImages, imageFiles, audioFiles }
}

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
      <Center w={192} h={192} bg="dark.6">
        <Loader color="cyan" size="sm" />
      </Center>
    )
  }

  if (error || !decryptedUrl) {
    return (
      <Center w={192} h={128} bg="dark.6">
        <Group gap="xs">
          <IconAlertCircle size={20} />
          <Text size="sm" c="dimmed">Failed to load</Text>
        </Group>
      </Center>
    )
  }

  return <ImageWithLightbox src={decryptedUrl} />
}

function AudioPlayer({
  file,
  privateKey,
  otherPubkey,
  isOutgoing
}: {
  file: FileData
  privateKey: string
  otherPubkey: string
  isOutgoing: boolean
}) {
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null

    async function decrypt() {
      if (!file.encrypted) {
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
        console.error('Failed to decrypt audio:', err)
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

  useEffect(() => {
    if (!decryptedUrl) return

    const audio = new Audio()
    audioRef.current = audio
    let durationDetected = false

    const handleLoadedMetadata = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        durationDetected = true
        setDuration(audio.duration)
      }
    }

    const handleDurationChange = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        durationDetected = true
        setDuration(audio.duration)
      }
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
      if (!durationDetected && isFinite(audio.duration) && audio.duration > 0) {
        durationDetected = true
        setDuration(audio.duration)
      }
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    const handleCanPlay = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        durationDetected = true
        setDuration(audio.duration)
      }
    }

    // Workaround for WebM/Opus files that report Infinity duration
    // Seek to end to get actual duration, then seek back to start
    let seekingForDuration = false

    const handleLoadedData = () => {
      if (!durationDetected && (!isFinite(audio.duration) || audio.duration === 0)) {
        seekingForDuration = true
        audio.currentTime = 1e101 // Seek far to trigger duration detection
      }
    }

    const handleSeeked = () => {
      if (seekingForDuration) {
        if (audio.currentTime > 0 && isFinite(audio.currentTime)) {
          durationDetected = true
          setDuration(audio.currentTime)
        }
        seekingForDuration = false
        audio.currentTime = 0
      }
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('canplay', handleCanPlay)
    audio.addEventListener('loadeddata', handleLoadedData)
    audio.addEventListener('seeked', handleSeeked)

    // Set source and load
    audio.src = decryptedUrl
    audio.load()

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('canplay', handleCanPlay)
      audio.removeEventListener('loadeddata', handleLoadedData)
      audio.removeEventListener('seeked', handleSeeked)
      audio.pause()
      audio.src = ''
    }
  }, [decryptedUrl])

  const togglePlay = () => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? currentTime / duration : 0

  if (isLoading) {
    return (
      <Box px="md" py="sm">
        <Group gap="sm">
          <Loader size="sm" color={isOutgoing ? 'white' : 'cyan'} />
          <Text size="sm" c={isOutgoing ? 'white' : 'dimmed'}>Loading audio...</Text>
        </Group>
      </Box>
    )
  }

  if (error || !decryptedUrl) {
    return (
      <Box px="md" py="sm">
        <Group gap="xs">
          <IconAlertCircle size={20} />
          <Text size="sm" c="dimmed">Failed to load audio</Text>
        </Group>
      </Box>
    )
  }

  return (
    <Box px="md" py="sm">
      <Group gap="sm">
        <ActionIcon
          variant="filled"
          color={isOutgoing ? 'cyan.8' : 'cyan'}
          radius="xl"
          size="lg"
          onClick={togglePlay}
        >
          {isPlaying ? <IconPlayerPause size={18} /> : <IconPlayerPlay size={18} />}
        </ActionIcon>

        <Box style={{ flex: 1 }}>
          {/* Progress bar */}
          <Box
            h={4}
            bg={isOutgoing ? 'cyan.8' : 'dark.4'}
            style={{ borderRadius: 2, overflow: 'hidden' }}
          >
            <Box
              h="100%"
              w={`${progress * 100}%`}
              bg={isOutgoing ? 'white' : 'cyan'}
              style={{ transition: 'width 0.1s' }}
            />
          </Box>
          <Text size="xs" c={isOutgoing ? 'cyan.1' : 'dimmed'} mt={4}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </Text>
        </Box>
      </Group>
    </Box>
  )
}

function ImageWithLightbox({ src }: { src: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Image
        src={src}
        alt="Shared image"
        style={{ cursor: 'pointer' }}
        onClick={() => setIsOpen(true)}
      />

      <Modal
        opened={isOpen}
        onClose={() => setIsOpen(false)}
        size="xl"
        withCloseButton={false}
        centered
        styles={{
          body: { padding: 0, background: 'transparent' },
          content: { background: 'transparent', boxShadow: 'none' },
        }}
      >
        <Box pos="relative">
          <ActionIcon
            pos="absolute"
            top={8}
            right={8}
            variant="filled"
            color="dark"
            onClick={() => setIsOpen(false)}
            radius="xl"
          >
            <IconX size={18} />
          </ActionIcon>
          <Image src={src} alt="Full size" fit="contain" />
        </Box>
      </Modal>
    </>
  )
}

function StatusIcon({ status }: { status: Message['status'] }) {
  switch (status) {
    case 'sending':
      return <Loader color="cyan.2" size={14} />
    case 'sent':
      return <IconCheck size={14} color="var(--mantine-color-cyan-2)" />
    case 'delivered':
    case 'read':
      return <IconChecks size={14} color={status === 'read' ? 'var(--mantine-color-blue-3)' : 'var(--mantine-color-cyan-2)'} />
    case 'failed':
      return <IconAlertCircle size={14} color="var(--mantine-color-red-4)" />
    default:
      return null
  }
}

// Format remaining time for display
function formatRemainingTime(seconds: number): string {
  if (seconds <= 0) return '0s'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return secs > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${mins}m`
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  }
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`
}

function ExpirationTimer({ expiration, isOutgoing }: { expiration: number; isOutgoing: boolean }) {
  const [remaining, setRemaining] = useState(() => {
    const now = Math.floor(Date.now() / 1000)
    return Math.max(0, expiration - now)
  })

  // Extract complex expression to a variable for ESLint
  const useShortInterval = remaining < 3600

  useEffect(() => {
    // Update every second if less than 1 hour, otherwise every minute
    const interval = useShortInterval ? 1000 : 60000

    const timer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000)
      const newRemaining = Math.max(0, expiration - now)
      setRemaining(newRemaining)
    }, interval)

    return () => clearInterval(timer)
  }, [expiration, useShortInterval])

  if (remaining <= 0) return null

  return (
    <Group gap={2}>
      <IconClock size={12} color={isOutgoing ? 'var(--mantine-color-cyan-2)' : 'var(--mantine-color-gray-5)'} />
      <Text size="xs" c={isOutgoing ? 'cyan.2' : 'dimmed'}>
        {formatRemainingTime(remaining)}
      </Text>
    </Group>
  )
}
