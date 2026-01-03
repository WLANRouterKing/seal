import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Stack, Group, Text, Avatar, ActionIcon, Box, Paper, ScrollArea, Center, Menu, Tooltip, Modal, Button } from '@mantine/core'
import { IconArrowLeft, IconClock, IconClockOff, IconDotsVertical, IconTrash } from '@tabler/icons-react'
import { useAuthStore } from '../../stores/authStore'
import { useMessageStore } from '../../stores/messageStore'
import { useContactStore } from '../../stores/contactStore'
import { nsecToPrivateKey } from '../../services/keys'
import { type Contact, EXPIRATION_OPTIONS } from '../../types'
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
  const { getMessagesForContact, sendMessage, sendFileMessage, deleteMessage, deleteChat } = useMessageStore()
  const { contacts, setExpiration } = useContactStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const messages = getMessagesForContact(contactPubkey)
  const displayName = contact?.name || truncateKey(contactPubkey, 8)

  // Get expiration from contact in store (reactive)
  const storedContact = contacts.find(c => c.pubkey === contactPubkey)
  const currentExpiration = storedContact?.expirationSeconds ?? 0
  const expirationLabel = EXPIRATION_OPTIONS.find(o => o.value === currentExpiration)?.label || 'Off'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (content: string) => {
    if (!keys) return
    const privateKey = nsecToPrivateKey(keys.nsec)
    if (!privateKey) return
    await sendMessage(contactPubkey, content, privateKey)
  }

  const handleSendFile = async (file: File, caption?: string) => {
    if (!keys) return
    const privateKey = nsecToPrivateKey(keys.nsec)
    if (!privateKey) return
    await sendFileMessage(contactPubkey, file, caption, privateKey)
  }

  const handleDelete = async (messageId: string) => {
    await deleteMessage(contactPubkey, messageId)
  }

  const handleDeleteChat = async () => {
    await deleteChat(contactPubkey)
    setShowDeleteConfirm(false)
    onBack()
  }

  return (
    <>
    {/* Delete confirmation modal */}
    <Modal
      opened={showDeleteConfirm}
      onClose={() => setShowDeleteConfirm(false)}
      title={t('chat.deleteChat')}
      centered
    >
      <Text mb="lg">{t('chat.deleteChatConfirm')}</Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={() => setShowDeleteConfirm(false)}>
          {t('common.cancel')}
        </Button>
        <Button color="red" onClick={handleDeleteChat}>
          {t('common.delete')}
        </Button>
      </Group>
    </Modal>
    <Stack h="100%" gap={0}>
      {/* Header */}
      <Paper p="sm" radius={0} style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
        <Group gap="sm">
          <ActionIcon variant="subtle" onClick={onBack}>
            <IconArrowLeft size={24} />
          </ActionIcon>

          <Avatar src={contact?.picture} size={40} radius="xl" color="cyan">
            {displayName.charAt(0).toUpperCase()}
          </Avatar>

          <Box style={{ flex: 1, minWidth: 0 }}>
            <Text fw={500} truncate>{displayName}</Text>
            {contact?.nip05 && (
              <Text size="xs" c="dimmed" truncate>{contact.nip05}</Text>
            )}
          </Box>

          {/* Disappearing messages timer */}
          <Menu shadow="md" width={160} position="bottom-end">
            <Menu.Target>
              <Tooltip label={`${t('chat.disappearingMessages')}: ${expirationLabel}`} position="left">
                <ActionIcon
                  variant={currentExpiration > 0 ? 'light' : 'subtle'}
                  color={currentExpiration > 0 ? 'cyan' : 'gray'}
                >
                  {currentExpiration > 0 ? <IconClock size={20} /> : <IconClockOff size={20} />}
                </ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{t('chat.disappearingMessages')}</Menu.Label>
              {EXPIRATION_OPTIONS.map((option) => (
                <Menu.Item
                  key={option.value}
                  onClick={() => setExpiration(contactPubkey, option.value)}
                  color={option.value === currentExpiration ? 'cyan' : undefined}
                  fw={option.value === currentExpiration ? 600 : undefined}
                >
                  {option.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>

          {/* More options menu */}
          <Menu shadow="md" width={180} position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="subtle">
                <IconDotsVertical size={20} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={() => setShowDeleteConfirm(true)}
              >
                {t('chat.deleteChat')}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Paper>

      {/* Messages */}
      <ScrollArea style={{ flex: 1 }} px="md" py="md">
        {messages.length === 0 ? (
          <Center h="100%">
            <Text c="dimmed" size="sm">
              {t('chat.startConversation')}
            </Text>
          </Center>
        ) : (
          <Stack gap="xs">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                contactPubkey={contactPubkey}
                onDelete={handleDelete}
              />
            ))}
            <div ref={messagesEndRef} />
          </Stack>
        )}
      </ScrollArea>

      {/* Input */}
      <MessageInput onSend={handleSend} onSendFile={handleSendFile} />
    </Stack>
    </>
  )
}
