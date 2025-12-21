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
} from '@mantine/core'
import { IconUsers, IconMessageCircle, IconTrash } from '@tabler/icons-react'
import type { Contact } from '../../types'
import { truncateKey } from '../../utils/format'

interface ContactListProps {
  contacts: Contact[]
  onStartChat: (pubkey: string) => void
  onRemoveContact: (pubkey: string) => void
}

export default function ContactList({ contacts, onStartChat, onRemoveContact }: ContactListProps) {
  const { t } = useTranslation()

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
              >
                {(contact.name || contact.npub).charAt(0).toUpperCase()}
              </Avatar>

              <Box style={{ flex: 1, minWidth: 0 }}>
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
  )
}
