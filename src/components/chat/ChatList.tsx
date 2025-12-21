import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Stack,
  Group,
  Text,
  Avatar,
  Badge,
  Paper,
  ActionIcon,
  Modal,
  Button,
  Box,
  Center,
  ThemeIcon,
} from '@mantine/core'
import { IconMessageCircle, IconTrash } from '@tabler/icons-react'
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
      <Center h="100%" px="xl">
        <Stack align="center" gap="md">
          <ThemeIcon size={64} radius="xl" variant="light" color="gray">
            <IconMessageCircle size={32} />
          </ThemeIcon>
          <Text fw={500} size="lg">{t('chat.noMessages')}</Text>
          <Text c="dimmed" size="sm" ta="center" maw={280}>
            {t('chat.noMessagesHint')}
          </Text>
        </Stack>
      </Center>
    )
  }

  const handleDelete = async (pubkey: string) => {
    await deleteChat(pubkey)
    setConfirmDelete(null)
    setSwipedChat(null)
  }

  return (
    <>
      <Stack gap={0} h="100%" style={{ overflow: 'auto' }}>
        {chats.map((chat) => (
          <Box
            key={chat.pubkey}
            pos="relative"
            style={{ overflow: 'hidden', borderBottom: '1px solid var(--mantine-color-dark-4)' }}
          >
            {/* Delete button (revealed on swipe) */}
            <Box
              pos="absolute"
              style={{ inset: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}
            >
              <Button
                color="red"
                h="100%"
                radius={0}
                onClick={() => setConfirmDelete(chat.pubkey)}
              >
                {t('common.delete')}
              </Button>
            </Box>

            {/* Chat item */}
            <Paper
              p="sm"
              radius={0}
              style={{
                cursor: 'pointer',
                transform: swipedChat === chat.pubkey ? 'translateX(-80px)' : 'translateX(0)',
                transition: 'transform 0.2s ease',
                position: 'relative',
              }}
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
              <Group wrap="nowrap" gap="sm">
                <Avatar
                  src={getContactPicture(chat.pubkey)}
                  size={48}
                  radius="xl"
                  color="cyan"
                >
                  {getContactName(chat.pubkey).charAt(0).toUpperCase()}
                </Avatar>

                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Group justify="space-between" wrap="nowrap" mb={4}>
                    <Text fw={500} truncate>
                      {getContactName(chat.pubkey)}
                    </Text>
                    {chat.lastMessage && (
                      <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                        {formatTimestamp(chat.lastMessage.createdAt)}
                      </Text>
                    )}
                  </Group>
                  {chat.lastMessage && (
                    <Text size="sm" c="dimmed" truncate>
                      {chat.lastMessage.isOutgoing && (
                        <Text span c="dimmed">{t('common.you')}: </Text>
                      )}
                      {formatPreview(chat.lastMessage.content)}
                    </Text>
                  )}
                </Box>

                {chat.unreadCount > 0 && (
                  <Badge circle size="lg" color="cyan">
                    {chat.unreadCount > 9 ? '9+' : chat.unreadCount}
                  </Badge>
                )}

                {/* Desktop delete button */}
                <ActionIcon
                  variant="subtle"
                  color="red"
                  onClick={(e) => {
                    e.stopPropagation()
                    setConfirmDelete(chat.pubkey)
                  }}
                  visibleFrom="sm"
                >
                  <IconTrash size={18} />
                </ActionIcon>
              </Group>
            </Paper>
          </Box>
        ))}
      </Stack>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={!!confirmDelete}
        onClose={() => {
          setConfirmDelete(null)
          setSwipedChat(null)
        }}
        title={t('chat.deleteChat')}
        centered
      >
        <Text size="sm" c="dimmed" mb="lg">
          {t('chat.deleteChatConfirm')}
        </Text>
        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={() => {
              setConfirmDelete(null)
              setSwipedChat(null)
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            color="red"
            onClick={() => confirmDelete && handleDelete(confirmDelete)}
          >
            {t('common.delete')}
          </Button>
        </Group>
      </Modal>
    </>
  )
}
