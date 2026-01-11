import {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {Box, ActionIcon, Affix} from '@mantine/core'
import {IconPlus} from '@tabler/icons-react'
import {useContactStore} from '../stores/contactStore'
import {useMessageStore} from '../stores/messageStore'
import {useBlockedContactStore} from '../stores/blockedContactStore.ts'
import ContactList from '../components/contacts/ContactList'
import AddContact from '../components/contacts/AddContact'

export default function Contacts() {
    const navigate = useNavigate()
    const [showAddContact, setShowAddContact] = useState(false)
    const {contacts, addContact, removeContact, error, clearError} = useContactStore()
    const {addBlockedContact, removeBlockedContact, blockedContacts} = useBlockedContactStore()
    const {setActiveChat} = useMessageStore()

    const handleAddContact = async (npub: string, name?: string) => {
        const contact = await addContact(npub, name)
        if (contact) {
            setShowAddContact(false)
        }
    }

    const handleStartChat = (pubkey: string) => {
        setActiveChat(pubkey)
        navigate('/')
    }

    if (showAddContact) {
        return (
            <AddContact
                onAdd={handleAddContact}
                onCancel={() => {
                    setShowAddContact(false)
                    clearError()
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
                onRemoveContact={removeContact}
                onBlockContact={addBlockedContact}
                onUnblockContact={removeBlockedContact}
            />

            <Affix position={{bottom: 90, right: 16}}>
                <ActionIcon
                    variant="filled"
                    color="cyan"
                    size={56}
                    radius="xl"
                    onClick={() => setShowAddContact(true)}
                    style={{boxShadow: '0 4px 12px rgba(0,0,0,0.3)'}}
                >
                    <IconPlus size={24}/>
                </ActionIcon>
            </Affix>
        </Box>
    )
}
