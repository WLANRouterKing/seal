import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useContactStore } from '../stores/contactStore'
import { useMessageStore } from '../stores/messageStore'
import ContactList from '../components/contacts/ContactList'
import AddContact from '../components/contacts/AddContact'

export default function Contacts() {
  const navigate = useNavigate()
  const [showAddContact, setShowAddContact] = useState(false)
  const { contacts, addContact, removeContact, error, clearError } = useContactStore()
  const { setActiveChat } = useMessageStore()

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
    <div className="flex flex-col h-full">
      <ContactList
        contacts={contacts}
        onStartChat={handleStartChat}
        onRemoveContact={removeContact}
      />

      {/* Floating Add Button */}
      <button
        onClick={() => setShowAddContact(true)}
        className="absolute bottom-24 right-4 w-14 h-14 bg-primary-500 rounded-full flex items-center justify-center shadow-lg hover:bg-primary-600 transition-colors"
      >
        <svg className="w-6 h-6 text-theme-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  )
}
