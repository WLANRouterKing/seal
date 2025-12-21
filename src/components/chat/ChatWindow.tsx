import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Stack, Group, Text, Avatar, ActionIcon, Box, Paper, ScrollArea, Center } from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import { useAuthStore } from '../../stores/authStore'
import { useMessageStore } from '../../stores/messageStore'
import type { Contact } from '../../types'
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
  const { getMessagesForContact, sendMessage, sendFileMessage, deleteMessage } = useMessageStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const messages = getMessagesForContact(contactPubkey)
  const displayName = contact?.name || truncateKey(contactPubkey, 8)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (content: string) => {
    if (!keys) return
    await sendMessage(contactPubkey, content, keys.privateKey)
  }

  const handleSendFile = async (file: File, caption?: string) => {
    if (!keys) return
    await sendFileMessage(contactPubkey, file, caption, keys.privateKey)
  }

  const handleDelete = async (messageId: string) => {
    await deleteMessage(contactPubkey, messageId)
  }

  return (
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
  )
}
