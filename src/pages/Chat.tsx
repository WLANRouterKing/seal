import { useMessageStore } from '../stores/messageStore'
import { useContactStore } from '../stores/contactStore'
import ChatList from '../components/chat/ChatList'
import ChatWindow from '../components/chat/ChatWindow'
import {useBlockedContactStore} from "../stores/blockedContactStore.ts";

export default function Chat() {
  const { activeChat, setActiveChat } = useMessageStore()
  const { contacts } = useContactStore()
    const {blockedContacts} = useBlockedContactStore()
    const blockedPubkeys = new Set(blockedContacts.map(c => c.pubkey))

  const activeContact = contacts.find(c => c.pubkey === activeChat)
const isBlocked = activeContact ? blockedPubkeys.has(activeContact.pubkey) : false;
    if (activeChat) {
    return (
      <ChatWindow
        contactPubkey={activeChat}
        contact={activeContact}
        isBlocked={isBlocked}
        onBack={() => setActiveChat(null)}
      />
    )
  }

  return <ChatList onSelectChat={setActiveChat} />
}
