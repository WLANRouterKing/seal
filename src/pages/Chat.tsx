import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button, Center, Group, Modal, Stack, Text, TextInput } from '@mantine/core'
import { IconSearch, IconPlus, IconUserPlus, IconMessageCircle } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { useMessageStore } from '../stores/messageStore'
import { useContactStore } from '../stores/contactStore'
import ChatList from '../components/chat/ChatList'
import ChatWindow from '../components/chat/ChatWindow'
import InviteContact from '../components/contacts/InviteContact'
import { useBlockedContactStore } from '../stores/blockedContactStore'

export default function Chat() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const { activeChat, setActiveChat } = useMessageStore()
  const { contacts } = useContactStore()
  const { blockedContacts } = useBlockedContactStore()
  const activeContact = contacts.find((contact) => contact.pubkey === activeChat)
  const isBlocked = blockedContacts.some((contact) => contact.pubkey === activeChat)

  return (
    <>
      <Box className={`chat-workspace${activeChat ? ' has-active-chat' : ''}`}>
        <Stack gap={0} className="chat-sidebar">
          <Stack p="md" gap="sm">
            <Group justify="space-between">
              <Text fw={700} size="xl">
                {t('nav.chats')}
              </Text>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPlus size={16} />}
                onClick={() => navigate('/contacts?add=1')}
              >
                {t('chat.newChat')}
              </Button>
            </Group>
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              leftSection={<IconSearch size={16} />}
              placeholder={t('chat.search')}
              aria-label={t('chat.search')}
            />
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconUserPlus size={16} />}
              onClick={() => setInviteOpen(true)}
            >
              {t('invite.title')}
            </Button>
          </Stack>
          <Box style={{ flex: 1, minHeight: 0 }}>
            <ChatList onSelectChat={setActiveChat} query={query} activeChat={activeChat} />
          </Box>
        </Stack>
        <Box className="chat-conversation">
          {activeChat ? (
            <ChatWindow
              key={activeChat}
              contactPubkey={activeChat}
              contact={activeContact}
              isBlocked={isBlocked}
              onBack={() => setActiveChat(null)}
            />
          ) : (
            <Center h="100%" p="xl">
              <Stack align="center" maw={380} gap="md">
                <IconMessageCircle size={48} stroke={1.3} />
                <Text fw={700} size="xl" ta="center">
                  {t('chat.welcomeTitle')}
                </Text>
                <Text c="dimmed" ta="center">
                  {t('chat.welcomeHint')}
                </Text>
                <Button onClick={() => setInviteOpen(true)}>{t('invite.title')}</Button>
                <Button variant="subtle" onClick={() => navigate('/contacts?add=1')}>
                  {t('contacts.addContact')}
                </Button>
              </Stack>
            </Center>
          )}
        </Box>
      </Box>
      <Modal opened={inviteOpen} onClose={() => setInviteOpen(false)} title={t('invite.title')} centered>
        <InviteContact />
      </Modal>
    </>
  )
}
