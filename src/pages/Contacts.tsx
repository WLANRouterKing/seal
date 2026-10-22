import { useLinkedApp } from '../stores/linkedAppStore'
import { useState } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { Box, ActionIcon, Affix, Modal, Button, Stack } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { invitationFromHash } from '../services/invitations'
import InviteContact from '../components/contacts/InviteContact'
import { IconPlus } from '@tabler/icons-react'
import { useContactStore } from '../stores/contactStore'
import { useMessageStore } from '../stores/messageStore'
import { useBlockedContactStore } from '../stores/blockedContactStore.ts'
import ContactList from '../components/contacts/ContactList'
import AddContact from '../components/contacts/AddContact'

export default function Contacts() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const linked = useLinkedApp()
  const location = useLocation()
  const [params] = useSearchParams()
  const invitation = invitationFromHash(location.hash)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [showAddContact, setShowAddContact] = useState(false)
  const mainContacts = useContactStore()
  const { contacts, addContact, removeContact, error, clearError } = linked ?? mainContacts
  const mainBlocked = useBlockedContactStore()
  const { addBlockedContact, removeBlockedContact, blockedContacts } = linked ?? mainBlocked
  const mainMessages = useMessageStore()
  const { setActiveChat } = linked ?? mainMessages

  const handleAddContact = async (npub: string, name?: string) => {
    const contact = await addContact(npub, name)
    if (contact) {
      setShowAddContact(false)
      navigate('/contacts', { replace: true })
    }
  }

  const handleStartChat = (pubkey: string) => {
    setActiveChat(pubkey)
    navigate('/')
  }

  if (showAddContact || params.get('add') === '1' || invitation) {
    return (
      <AddContact
        key={invitation || 'manual'}
        initialIdentity={invitation || ''}
        onAdd={handleAddContact}
        onCancel={() => {
          setShowAddContact(false)
          clearError()
          navigate('/contacts', { replace: true })
        }}
        error={error}
      />
    )
  }

  return (
    <Box h="100%" pos="relative">
      <ContactList
        contacts={contacts}
        blockedContacts={blockedContacts}
        onStartChat={handleStartChat}
        onRemoveContact={(peer) => {
          void removeContact(peer).catch(() => {})
        }}
        onBlockContact={addBlockedContact}
        onUnblockContact={(peer) => {
          void removeBlockedContact(peer).catch(() => {})
        }}
      />

      <Modal opened={inviteOpen} onClose={() => setInviteOpen(false)} title={t('invite.title')} centered>
        <InviteContact />
      </Modal>
      <Affix position={{ bottom: 90, right: 16 }}>
        <Stack align="flex-end" gap="sm">
          <Button variant="light" onClick={() => setInviteOpen(true)}>
            {t('invite.title')}
          </Button>
          <ActionIcon
            aria-label={t('contacts.addContact')}
            variant="filled"
            color="cyan"
            size={56}
            radius="xl"
            onClick={() => setShowAddContact(true)}
            style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
          >
            <IconPlus size={24} />
          </ActionIcon>
        </Stack>
      </Affix>
    </Box>
  )
}
