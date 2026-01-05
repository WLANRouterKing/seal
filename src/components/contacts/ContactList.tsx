import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Stack,
  Group,
  Text,
  Avatar,
  ActionIcon,
  Box,
  Center,
  ThemeIcon,
  ScrollArea,
  Modal,
  CopyButton,
  Button,
  Tooltip,
} from '@mantine/core'
import { IconUsers, IconMessageCircle, IconTrash, IconCopy, IconCheck } from '@tabler/icons-react'
import type { Contact } from '../../types'
import { truncateKey } from '../../utils/format'

interface ContactListProps {
  contacts: Contact[]
  onStartChat: (pubkey: string) => void
  onRemoveContact: (pubkey: string) => void
}

export default function ContactList({ contacts, onStartChat, onRemoveContact }: ContactListProps) {
  const { t } = useTranslation()
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)

  if (contacts.length === 0) {
    return (
      <Center h="100%" px="xl">
        <Stack align="center" gap="md">
          <ThemeIcon size={64} radius="xl" variant="light" color="gray">
            <IconUsers size={32} />
          </ThemeIcon>
          <Text fw={500} size="lg">{t('contacts.noContacts')}</Text>
          <Text c="dimmed" size="sm" ta="center" maw={280}>
            {t('contacts.noContactsHint')}
          </Text>
        </Stack>
      </Center>
    )
  }

  return (
    <>
      <ScrollArea h="100%">
        <Stack gap={0}>
          {contacts.map((contact) => (
            <Box
              key={contact.pubkey}
              p="sm"
              style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}
            >
              <Group wrap="nowrap" gap="sm">
                <Avatar
                  src={contact.picture}
                  size={48}
                  radius="xl"
                  color="cyan"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedContact(contact)}
                >
                  {(contact.name || contact.npub).charAt(0).toUpperCase()}
                </Avatar>

                <Box
                  style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                  onClick={() => setSelectedContact(contact)}
                >
                  <Text fw={500} truncate>
                    {contact.name || truncateKey(contact.npub, 8)}
                  </Text>
                  {contact.nip05 && (
                    <Text size="xs" c="cyan" truncate>{contact.nip05}</Text>
                  )}
                  {!contact.nip05 && contact.name && (
                    <Text size="xs" c="dimmed" truncate>{truncateKey(contact.npub, 6)}</Text>
                  )}
                </Box>

                <Group gap="xs">
                  <ActionIcon
                    variant="subtle"
                    color="cyan"
                    onClick={() => onStartChat(contact.pubkey)}
                    title={t('contacts.startChat')}
                  >
                    <IconMessageCircle size={20} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={() => onRemoveContact(contact.pubkey)}
                    title={t('contacts.removeContact')}
                  >
                    <IconTrash size={20} />
                  </ActionIcon>
                </Group>
              </Group>
            </Box>
          ))}
        </Stack>
      </ScrollArea>

      {/* Contact Details Modal */}
      <Modal
        opened={!!selectedContact}
        onClose={() => setSelectedContact(null)}
        title={selectedContact?.name || t('contacts.contactDetails')}
        centered
      >
        {selectedContact && (
          <Stack gap="md">
            <Group justify="center">
              <Avatar
                src={selectedContact.picture}
                size={80}
                radius="xl"
                color="cyan"
              >
                {(selectedContact.name || selectedContact.npub).charAt(0).toUpperCase()}
              </Avatar>
            </Group>

            {selectedContact.name && (
              <Box>
                <Text size="xs" c="dimmed" tt="uppercase">{t('contacts.name')}</Text>
                <Text>{selectedContact.name}</Text>
              </Box>
            )}

            {selectedContact.nip05 && (
              <Box>
                <Text size="xs" c="dimmed" tt="uppercase">NIP-05</Text>
                <Text c="cyan">{selectedContact.nip05}</Text>
              </Box>
            )}

            <Box>
              <Text size="xs" c="dimmed" tt="uppercase">npub</Text>
              <Text size="sm" style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>
                {selectedContact.npub}
              </Text>
              <CopyButton value={selectedContact.npub}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? t('common.copied') : t('common.copy')}>
                    <Button
                      variant="subtle"
                      size="xs"
                      mt="xs"
                      leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                      onClick={copy}
                    >
                      {copied ? t('common.copied') : t('common.copyNpub')}
                    </Button>
                  </Tooltip>
                )}
              </CopyButton>
            </Box>

            <Group justify="center" mt="md">
              <Button
                variant="light"
                color="cyan"
                leftSection={<IconMessageCircle size={18} />}
                onClick={() => {
                  onStartChat(selectedContact.pubkey)
                  setSelectedContact(null)
                }}
              >
                {t('contacts.startChat')}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  )
}
