import { useMessageStore } from '../stores/messageStore'
import { useContactStore } from '../stores/contactStore'
import ChatList from '../components/chat/ChatList'
import ChatWindow from '../components/chat/ChatWindow'

export default function Chat() {
  const { activeChat, setActiveChat } = useMessageStore()
  const { contacts } = useContactStore()

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
