import { useState } from 'react'
import { ActionIcon, Alert, Button, Code, Group, Menu, Modal, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { IconBan, IconDotsVertical, IconTrash, IconUserPlus } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { useContactStore } from '../../stores/contactStore'
import { useBlockedContactStore } from '../../stores/blockedContactStore'
import { pubkeyToNpub } from '../../services/keys'

interface Props {
  pubkey: string
  onDeleteChat: () => void
}

// Key this component by pubkey so dialogs cannot follow a switch to another chat.
export default function ChatContactActions({ pubkey, onDeleteChat }: Props) {
  const { t } = useTranslation()
  const { contacts, addContact } = useContactStore()
  const { blockedContacts, addBlockedContact, removeBlockedContact } = useBlockedContactStore()
  const contact = contacts.find((item) => item.pubkey === pubkey)
  const blocked = blockedContacts.some((item) => item.pubkey === pubkey)
  const [action, setAction] = useState<'add' | 'block' | 'unblock' | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const open = (next: 'add' | 'block' | 'unblock') => {
    setError(false)
    setName('')
    setAction(next)
  }
  const title =
    action === 'add'
      ? t('contacts.addContact')
      : action === 'unblock'
        ? t('contacts.unblockContact')
        : t('contacts.blockContact')
  const submit = async () => {
    if (busy || !action) return
    setBusy(true)
    setError(false)
    try {
      let saved = false
      if (action === 'add') saved = Boolean(await addContact(pubkey, name.trim() || undefined))
      else if (action === 'block') saved = Boolean(await addBlockedContact(pubkey, contact?.name))
      else {
        await removeBlockedContact(pubkey)
        saved = !useBlockedContactStore.getState().blockedContacts.some((item) => item.pubkey === pubkey)
      }
      if (saved) setAction(null)
      else setError(true)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Group gap={4} wrap="nowrap">
        {!contact && (
          <Tooltip label={t('contacts.addContact')}>
            <ActionIcon variant="light" onClick={() => open('add')} aria-label={t('contacts.addContact')}>
              <IconUserPlus size={20} />
            </ActionIcon>
          </Tooltip>
        )}
        <Menu shadow="md" width={220} position="bottom-end">
          <Menu.Target>
            <ActionIcon variant="subtle" aria-label={t('chat.actions')}>
              <IconDotsVertical size={20} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {!contact && (
              <Menu.Item leftSection={<IconUserPlus size={16} />} onClick={() => open('add')}>
                {t('contacts.addContact')}
              </Menu.Item>
            )}
            <Menu.Item
              color={blocked ? undefined : 'red'}
              leftSection={<IconBan size={16} />}
              onClick={() => open(blocked ? 'unblock' : 'block')}
            >
              {blocked ? t('contacts.unblockContact') : t('contacts.blockContact')}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={onDeleteChat}>
              {t('chat.deleteChat')}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      <Modal
        opened={action !== null}
        onClose={() => {
          if (!busy) setAction(null)
        }}
        title={title}
        centered
      >
        <Stack
          component="form"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Text size="sm">
            {action === 'add'
              ? t('chat.addSenderHint')
              : action === 'block'
                ? t('chat.blockSenderHint')
                : t('chat.unblockSenderHint')}
          </Text>
          <Code block style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
            {pubkeyToNpub(pubkey)}
          </Code>
          {action === 'add' && (
            <TextInput
              label={t('contacts.nameLabel')}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              disabled={busy}
            />
          )}
          {error && (
            <Alert color="red" role="alert">
              {t('chat.contactActionFailed')}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" disabled={busy} onClick={() => setAction(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={busy} color={action === 'block' ? 'red' : undefined}>
              {title}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
