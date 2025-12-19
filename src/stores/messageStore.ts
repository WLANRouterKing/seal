import { create } from 'zustand'
import type { Message, Chat } from '../types'
import {
  saveMessage as saveMessageToDB,
  deleteMessage as deleteMessageFromDB,
  getAllMessages,
  getContact
} from '../services/db'
import { relayPool } from '../services/relay'
import { createGiftWrap, createSelfGiftWrap, unwrapGiftWrap } from '../services/crypto'
import { notificationService } from '../services/notifications'
import { NIP17_KIND } from '../utils/constants'
import { truncateKey } from '../utils/format'
import type { Event } from 'nostr-tools'

interface MessageState {
  messages: Map<string, Message[]> // Keyed by contact pubkey
  chats: Chat[]
  activeChat: string | null
  isLoading: boolean

  // Actions
  initialize: (userPubkey: string) => Promise<void>
  sendMessage: (recipientPubkey: string, content: string, senderPrivateKey: string) => Promise<void>
  subscribeToMessages: (userPubkey: string, userPrivateKey: string) => () => void
  setActiveChat: (pubkey: string | null) => void
  getMessagesForContact: (pubkey: string) => Message[]
  markAsRead: (pubkey: string) => Promise<void>
  deleteMessage: (contactPubkey: string, messageId: string) => Promise<void>
  deleteChat: (contactPubkey: string) => Promise<void>
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: new Map(),
  chats: [],
  activeChat: null,
  isLoading: false,

  initialize: async (_userPubkey: string) => {
    set({ isLoading: true })

    try {
      // Load messages from local DB
      const allMessages = await getAllMessages()
      const messageMap = new Map<string, Message[]>()

      allMessages.forEach(msg => {
        const contactPubkey = msg.isOutgoing ? msg.recipientPubkey : msg.pubkey
        const existing = messageMap.get(contactPubkey) || []
        messageMap.set(contactPubkey, [...existing, msg].sort((a, b) => a.createdAt - b.createdAt))
      })

      // Build chat list
      const chats: Chat[] = []
      messageMap.forEach((messages, pubkey) => {
        const lastMessage = messages[messages.length - 1]
        chats.push({
          pubkey,
          lastMessage,
          unreadCount: messages.filter(m => !m.isOutgoing && m.status !== 'read').length,
          updatedAt: lastMessage?.createdAt || 0
        })
      })

      set({
        messages: messageMap,
        chats: chats.sort((a, b) => b.updatedAt - a.updatedAt),
        isLoading: false
      })
    } catch (error) {
      console.error('Failed to load messages:', error)
      set({ isLoading: false })
    }
  },

  sendMessage: async (recipientPubkey: string, content: string, senderPrivateKey: string) => {
    const tempId = crypto.randomUUID()
    const now = Math.floor(Date.now() / 1000)

    // Create optimistic message
    const message: Message = {
      id: tempId,
      pubkey: '', // Will be set from keys
      recipientPubkey,
      content,
      createdAt: now,
      status: 'sending',
      isOutgoing: true
    }

    // Add to state optimistically
    const messages = get().messages
    const existing = messages.get(recipientPubkey) || []
    messages.set(recipientPubkey, [...existing, message])
    set({ messages: new Map(messages) })

    // Update chats
    updateChats(get, set, recipientPubkey, message)

    try {
      // Create gift-wrapped message
      const giftWrap = await createGiftWrap(content, recipientPubkey, senderPrivateKey)

      // Create self-addressed copy
      const selfGiftWrap = await createSelfGiftWrap(content, recipientPubkey, senderPrivateKey)

      // Publish to relays
      const connectedRelays = relayPool.getConnectedUrls()
      const [result1] = await Promise.all([
        relayPool.publish(connectedRelays, giftWrap as unknown as Event),
        relayPool.publish(connectedRelays, selfGiftWrap as unknown as Event)
      ])

      // Update message status
      const updatedMessage: Message = {
        ...message,
        id: giftWrap.id,
        status: result1.successes.length > 0 ? 'sent' : 'failed'
      }

      await saveMessageToDB(updatedMessage)

      const updatedMessages = get().messages
      const contactMessages = updatedMessages.get(recipientPubkey) || []
      updatedMessages.set(
        recipientPubkey,
        contactMessages.map(m => m.id === tempId ? updatedMessage : m)
      )
      set({ messages: new Map(updatedMessages) })
      updateChats(get, set, recipientPubkey, updatedMessage)
    } catch (error) {
      console.error('Failed to send message:', error)

      // Mark as failed
      const updatedMessages = get().messages
      const contactMessages = updatedMessages.get(recipientPubkey) || []
      updatedMessages.set(
        recipientPubkey,
        contactMessages.map(m => m.id === tempId ? { ...m, status: 'failed' as const } : m)
      )
      set({ messages: new Map(updatedMessages) })
    }
  },

  subscribeToMessages: (userPubkey: string, userPrivateKey: string) => {
    const connectedRelays = relayPool.getConnectedUrls()
    if (connectedRelays.length === 0) return () => {}

    const processedIds = new Set<string>()

    return relayPool.subscribe(
      connectedRelays,
      [{ kinds: [NIP17_KIND.GIFT_WRAP], '#p': [userPubkey] }],
      async (event) => {
        // Skip if already processed
        if (processedIds.has(event.id)) return
        processedIds.add(event.id)

        try {
          const unwrapped = await unwrapGiftWrap(
            event as unknown as Event & { kind: typeof NIP17_KIND.GIFT_WRAP },
            userPrivateKey
          )

          if (!unwrapped) return

          // Skip own messages (already handled locally)
          if (unwrapped.senderPubkey === userPubkey) return

          const message: Message = {
            id: event.id,
            pubkey: unwrapped.senderPubkey,
            recipientPubkey: userPubkey,
            content: unwrapped.content,
            createdAt: unwrapped.createdAt,
            status: 'delivered',
            isOutgoing: false
          }

          // Check if message already exists
          const messages = get().messages
          const contactMessages = messages.get(unwrapped.senderPubkey) || []
          if (contactMessages.some(m => m.id === event.id)) return

          // Save and update state
          await saveMessageToDB(message)
          messages.set(unwrapped.senderPubkey, [...contactMessages, message].sort((a, b) => a.createdAt - b.createdAt))
          set({ messages: new Map(messages) })
          updateChats(get, set, unwrapped.senderPubkey, message)

          // Show notification for new message (if not in active chat)
          if (get().activeChat !== unwrapped.senderPubkey) {
            // Get contact name if available
            const contact = await getContact(unwrapped.senderPubkey)
            const senderName = contact?.name || truncateKey(unwrapped.senderPubkey, 8)

            notificationService.showMessageNotification(
              senderName,
              unwrapped.content,
              unwrapped.senderPubkey
            )
          }
        } catch (error) {
          console.error('Failed to process message:', error)
        }
      }
    )
  },

  setActiveChat: (pubkey: string | null) => {
    set({ activeChat: pubkey })
    if (pubkey) {
      get().markAsRead(pubkey)
    }
  },

  getMessagesForContact: (pubkey: string) => {
    return get().messages.get(pubkey) || []
  },

  markAsRead: async (pubkey: string) => {
    const messages = get().messages
    const contactMessages = messages.get(pubkey)

    if (!contactMessages) return

    const updatedMessages = contactMessages.map(m => ({
      ...m,
      status: m.status === 'delivered' ? 'read' as const : m.status
    }))

    messages.set(pubkey, updatedMessages)
    set({ messages: new Map(messages) })

    // Update chat unread count
    const chats = get().chats.map(c =>
      c.pubkey === pubkey ? { ...c, unreadCount: 0 } : c
    )
    set({ chats })

    // Persist read status to IndexedDB
    const messagesToUpdate = contactMessages.filter(m => m.status === 'delivered' && !m.isOutgoing)
    await Promise.all(messagesToUpdate.map(m => saveMessageToDB({ ...m, status: 'read' })))
  },

  deleteMessage: async (contactPubkey: string, messageId: string) => {
    try {
      // Delete from IndexedDB
      await deleteMessageFromDB(messageId)

      // Update state
      const messages = get().messages
      const contactMessages = messages.get(contactPubkey) || []
      const filteredMessages = contactMessages.filter(m => m.id !== messageId)

      if (filteredMessages.length === 0) {
        // Remove contact from messages map and chats
        messages.delete(contactPubkey)
        const chats = get().chats.filter(c => c.pubkey !== contactPubkey)
        set({ messages: new Map(messages), chats })
      } else {
        messages.set(contactPubkey, filteredMessages)
        set({ messages: new Map(messages) })

        // Update chat's last message if needed
        const lastMessage = filteredMessages[filteredMessages.length - 1]
        const chats = get().chats.map(c =>
          c.pubkey === contactPubkey
            ? { ...c, lastMessage, updatedAt: lastMessage.createdAt }
            : c
        )
        set({ chats: chats.sort((a, b) => b.updatedAt - a.updatedAt) })
      }
    } catch (error) {
      console.error('Failed to delete message:', error)
    }
  },

  deleteChat: async (contactPubkey: string) => {
    try {
      // Get all messages for this chat
      const messages = get().messages
      const contactMessages = messages.get(contactPubkey) || []

      // Delete all messages from IndexedDB
      await Promise.all(contactMessages.map(m => deleteMessageFromDB(m.id)))

      // Remove from state
      messages.delete(contactPubkey)
      const chats = get().chats.filter(c => c.pubkey !== contactPubkey)

      // Clear active chat if it was this one
      const activeChat = get().activeChat === contactPubkey ? null : get().activeChat

      set({ messages: new Map(messages), chats, activeChat })
    } catch (error) {
      console.error('Failed to delete chat:', error)
    }
  }
}))

// Helper to update chats list
function updateChats(
  get: () => MessageState,
  set: (state: Partial<MessageState>) => void,
  pubkey: string,
  message: Message
) {
  const chats = get().chats
  const existingIndex = chats.findIndex(c => c.pubkey === pubkey)

  if (existingIndex >= 0) {
    const chat = chats[existingIndex]
    chats[existingIndex] = {
      ...chat,
      lastMessage: message,
      unreadCount: message.isOutgoing ? chat.unreadCount : chat.unreadCount + 1,
      updatedAt: message.createdAt
    }
  } else {
    chats.push({
      pubkey,
      lastMessage: message,
      unreadCount: message.isOutgoing ? 0 : 1,
      updatedAt: message.createdAt
    })
  }

  set({ chats: [...chats].sort((a, b) => b.updatedAt - a.updatedAt) })
}
