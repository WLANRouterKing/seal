import { useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useMessageStore } from '../stores/messageStore'
import { useContactStore } from '../stores/contactStore'
import { useRelayStore } from '../stores/relayStore'
import ChatList from '../components/chat/ChatList'
import ChatWindow from '../components/chat/ChatWindow'

export default function Chat() {
  const { keys } = useAuthStore()
  const { initialize, subscribeToMessages, activeChat, setActiveChat } = useMessageStore()
  const { contacts } = useContactStore()
  const { relays } = useRelayStore()

  // Count connected relays to re-subscribe when connections change
  const connectedCount = relays.filter(r => r.status === 'connected').length

  useEffect(() => {
    if (keys) {
      initialize(keys.publicKey)
    }
  }, [keys])

  // Subscribe to messages when relays are connected
  useEffect(() => {
    if (keys && connectedCount > 0) {
      const unsubscribe = subscribeToMessages(keys.publicKey, keys.privateKey)
      return unsubscribe
    }
  }, [keys, connectedCount])

  const activeContact = contacts.find(c => c.pubkey === activeChat)

  if (activeChat) {
    return (
      <ChatWindow
        contactPubkey={activeChat}
        contact={activeContact}
        onBack={() => setActiveChat(null)}
      />
    )
  }

  return <ChatList onSelectChat={setActiveChat} />
}
