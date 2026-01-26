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
  Menu,
} from '@mantine/core'
import {
  IconUsers,
  IconMessageCircle,
  IconTrash,
  IconCopy,
  IconCheck,
  IconDotsVertical,
  IconCancel,
  IconArrowBackUp,
} from '@tabler/icons-react'
import type { Contact } from '../../types'
import { truncateKey } from '../../utils/format'

interface ContactListProps {
  contacts: Contact[]
  blockedContacts: Contact[]
  onStartChat: (pubkey: string) => void
  onRemoveContact: (pubkey: string) => void
  onBlockContact: (pubkey: string, name?: string) => void
  onUnblockContact: (pubkey: string) => void
}

export default function ContactList({
  contacts,
  blockedContacts,
  onStartChat,
  onRemoveContact,
  onBlockContact,
  onUnblockContact,
}: ContactListProps) {
  const { t } = useTranslation()
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const blockedPubkeys = new Set(blockedContacts.map((c) => c.pubkey))

  if (contacts.length === 0) {
    return (
      <Center h="100%" px="xl">
        <Stack align="center" gap="md">
          <ThemeIcon size={64} radius="xl" variant="light" color="gray">
            <IconUsers size={32} />
          </ThemeIcon>
          <Text fw={500} size="lg">
            {t('contacts.noContacts')}
          </Text>
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
            <Box key={contact.pubkey} p="sm" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
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

                <Box style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setSelectedContact(contact)}>
                  <Text fw={500} truncate>
                    {contact.name || truncateKey(contact.npub, 8)}
                  </Text>
                  {contact.nip05 && (
                    <Text size="xs" c="cyan" truncate>
                      {contact.nip05}
                    </Text>
                  )}
                  {!contact.nip05 && contact.name && (
                    <Text size="xs" c="dimmed" truncate>
                      {truncateKey(contact.npub, 6)}
                    </Text>
                  )}
                </Box>

                {/* More options menu */}
                <Menu shadow="md" width={220} position="bottom-end">
                  <Menu.Target>
                    <ActionIcon variant="subtle">
                      <IconDotsVertical size={20} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      color="cyan"
                      leftSection={<IconMessageCircle size={16} />}
                      onClick={() => onStartChat(contact.pubkey)}
                    >
                      {t('contacts.startChat')}
                    </Menu.Item>
                    {blockedPubkeys.has(contact.pubkey) && (
                      <Menu.Item
                        color="green"
                        leftSection={<IconArrowBackUp size={16} />}
                        onClick={() => onUnblockContact(contact.pubkey)}
                      >
                        {t('contacts.unblockContact')}
                      </Menu.Item>
                    )}
                    <Menu.Item
                      color="red"
                      leftSection={<IconCancel size={16} />}
                      onClick={() => onBlockContact(contact.pubkey, contact.name)}
                    >
                      {t('contacts.blockContact')}
                    </Menu.Item>
                    <Menu.Item
                      color="red"
                      leftSection={<IconTrash size={16} />}
                      onClick={() => onRemoveContact(contact.pubkey)}
                    >
                      {t('contacts.removeContact')}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
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
              <Avatar src={selectedContact.picture} size={80} radius="xl" color="cyan">
                {(selectedContact.name || selectedContact.npub).charAt(0).toUpperCase()}
              </Avatar>
            </Group>

            {selectedContact.name && (
              <Box>
                <Text size="xs" c="dimmed" tt="uppercase">
                  {t('contacts.name')}
                </Text>
                <Text>{selectedContact.name}</Text>
              </Box>
            )}

            {selectedContact.nip05 && (
              <Box>
                <Text size="xs" c="dimmed" tt="uppercase">
                  NIP-05
                </Text>
                <Text c="cyan">{selectedContact.nip05}</Text>
              </Box>
            )}

            <Box>
              <Text size="xs" c="dimmed" tt="uppercase">
                npub
              </Text>
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
