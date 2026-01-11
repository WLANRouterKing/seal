import {create} from 'zustand'
import type {Message, Chat} from '../types'
import {
    saveMessage as saveMessageToDB,
    deleteMessage as deleteMessageFromDB,
    getAllMessages,
    getContact,
    saveDeletedMessageId,
    isMessageDeleted,
    cleanupDeletedMessages,
    cleanupExpiredMessages,
    type StoredMessage
} from '../services/db'
import {relayPool} from '../services/relay'
import {
    createGiftWrap,
    createSelfGiftWrap,
    unwrapGiftWrap,
    createFileGiftWrap,
    type FileMetadata
} from '../services/crypto'
import {notificationService} from '../services/notifications'
import {NIP17_KIND} from '../utils/constants'
import {truncateKey} from '../utils/format'
import {useRelayStore} from './relayStore'
import {useContactStore} from './contactStore'
import {uploadFile, compressImage} from '../services/fileUpload'
import type {Event} from 'nostr-tools'
import {useBlockedContactStore} from "./blockedContactStore.ts";


// Check if a message has expired (NIP-40)
function isMessageExpired(expiration?: number): boolean {
    if (!expiration) return false
    return Math.floor(Date.now() / 1000) > expiration
}

// Decrypt a stored message using the private key
async function decryptStoredMessage(stored: StoredMessage, privateKey: string): Promise<Message | null> {
    try {
        const event = JSON.parse(stored.encryptedEvent) as Event & { kind: typeof NIP17_KIND.GIFT_WRAP }
        const unwrapped = await unwrapGiftWrap(event, privateKey)

        if (!unwrapped) {
            console.error('Failed to decrypt message:', stored.id)
            return null
        }

        // Check if message has expired (NIP-40)
        if (isMessageExpired(unwrapped.expiration)) {
            return null // Don't return expired messages
        }

        return {
            id: stored.id,
            pubkey: stored.pubkey,
            recipientPubkey: stored.recipientPubkey,
            content: unwrapped.content,
            createdAt: stored.createdAt,
            status: stored.status,
            isOutgoing: stored.isOutgoing,
            encryptedEvent: stored.encryptedEvent,
            expiration: unwrapped.expiration
        }
    } catch (error) {
        console.error('Failed to parse/decrypt message:', error)
        return null
    }
}

interface MessageState {
    messages: Map<string, Message[]> // Keyed by contact pubkey
    chats: Chat[]
    activeChat: string | null
    isLoading: boolean
    // Actions
    initialize: (userPubkey: string, userPrivateKey: string) => Promise<void>
    sendMessage: (recipientPubkey: string, content: string, senderPrivateKey: string) => Promise<void>
    sendFileMessage: (recipientPubkey: string, file: File, caption: string | undefined, senderPrivateKey: string) => Promise<void>
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
    initialize: async (_userPubkey: string, userPrivateKey: string) => {
        set({isLoading: true})

        try {
            // Cleanup old deleted message IDs (90+ days old)
            await cleanupDeletedMessages()

            // Cleanup expired messages (NIP-40)
            await cleanupExpiredMessages()

            // Load encrypted messages from local DB
            const storedMessages = await getAllMessages()

            // Decrypt all messages
            const decryptedMessages = await Promise.all(
                storedMessages.map(stored => decryptStoredMessage(stored, userPrivateKey))
            )

            // Filter out failed decryptions and build message map
            const messageMap = new Map<string, Message[]>()
            decryptedMessages.forEach(msg => {
                if (!msg) return
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
            set({isLoading: false})
        }
    },

    sendMessage: async (recipientPubkey: string, content: string, senderPrivateKey: string) => {
        const blockedPubkeys = new Set(useBlockedContactStore.getState().blockedContacts.map(c => c.pubkey))
        const isBlocked = blockedPubkeys.has(recipientPubkey)

        if(isBlocked) return

        const tempId = crypto.randomUUID()
        const now = Math.floor(Date.now() / 1000)

        // Get expiration setting for this contact (NIP-40)
        const expirationSeconds = useContactStore.getState().getExpiration(recipientPubkey)
        const expiration = expirationSeconds > 0 ? now + expirationSeconds : undefined

        // Create optimistic message (encryptedEvent will be set after creation)
        const message: Message = {
            id: tempId,
            pubkey: '', // Will be set from keys
            recipientPubkey,
            content,
            createdAt: now,
            status: 'sending',
            isOutgoing: true,
            encryptedEvent: '', // Placeholder, will be set after gift wrap creation
            expiration
        }

        // Add to state optimistically
        const messages = get().messages
        const existing = messages.get(recipientPubkey) || []
        messages.set(recipientPubkey, [...existing, message])
        set({messages: new Map(messages)})

        // Update chats
        updateChats(get, set, recipientPubkey, message)

        try {
            // Create gift-wrapped message with expiration
            const giftWrapOptions = expiration ? {expiration} : undefined
            const giftWrap = await createGiftWrap(content, recipientPubkey, senderPrivateKey, giftWrapOptions)

            // Create self-addressed copy (this is what we store - we can decrypt it with our own key)
            const selfGiftWrap = await createSelfGiftWrap(content, recipientPubkey, senderPrivateKey, giftWrapOptions)

            // Debug logging in dev mode
            if (import.meta.env.DEV) {
                const nonceTag = giftWrap.tags.find(t => t[0] === 'nonce')
                console.log('[Message] Gift-wrap created:', {
                    id: giftWrap.id,
                    recipient: recipientPubkey.slice(0, 12) + '...',
                    kind: giftWrap.kind,
                    powDifficulty: nonceTag ? nonceTag[2] : 'none',
                    powNonce: nonceTag ? nonceTag[1] : 'none',
                    tags: giftWrap.tags,
                    contentLength: giftWrap.content.length,
                    createdAt: new Date(giftWrap.created_at * 1000).toISOString()
                })
            }

            // Get recipient's preferred DM relays (NIP-17 Kind 10050)
            const recipientDMRelays = await useRelayStore.getState().getDMRelays(recipientPubkey)

            // Publish to recipient's preferred relays and our connected relays
            const connectedRelays = relayPool.getConnectedUrls()
            const allTargetRelays = [...new Set([...recipientDMRelays, ...connectedRelays])]

            // Connect to any recipient relays we're not already connected to
            const newRelays = recipientDMRelays.filter(r => !connectedRelays.includes(r))
            await Promise.all(newRelays.map(r => relayPool.connect(r)))

            if (import.meta.env.DEV) {
                console.log('[Message] Publishing to relays:', {
                    targetRelays: allTargetRelays,
                    recipientRelays: recipientDMRelays,
                    connectedRelays: connectedRelays
                })
            }

            const [result1] = await Promise.all([
                relayPool.publish(allTargetRelays, giftWrap as unknown as Event),
                relayPool.publish(connectedRelays, selfGiftWrap as unknown as Event) // Self copy only to our relays
            ])

            if (import.meta.env.DEV) {
                console.log('[Message] Publish result:', {
                    successes: result1.successes,
                    failures: result1.failures
                })
            }

            // Update message with self gift wrap (encrypted event we can decrypt)
            const updatedMessage: Message = {
                ...message,
                id: giftWrap.id,
                status: result1.successes.length > 0 ? 'sent' : 'failed',
                encryptedEvent: JSON.stringify(selfGiftWrap) // Store self-addressed gift wrap
            }

            await saveMessageToDB(updatedMessage)

            const updatedMessages = get().messages
            const contactMessages = updatedMessages.get(recipientPubkey) || []
            updatedMessages.set(
                recipientPubkey,
                contactMessages.map(m => m.id === tempId ? updatedMessage : m)
            )
            set({messages: new Map(updatedMessages)})
            updateChats(get, set, recipientPubkey, updatedMessage)
        } catch (error) {
            console.error('Failed to send message:', error)

            // Mark as failed
            const updatedMessages = get().messages
            const contactMessages = updatedMessages.get(recipientPubkey) || []
            updatedMessages.set(
                recipientPubkey,
                contactMessages.map(m => m.id === tempId ? {...m, status: 'failed' as const} : m)
            )
            set({messages: new Map(updatedMessages)})
        }
    },

    sendFileMessage: async (recipientPubkey: string, file: File, caption: string | undefined, senderPrivateKey: string) => {
        const blockedPubkeys = new Set(useBlockedContactStore.getState().blockedContacts.map(c => c.pubkey))
        const isBlocked = blockedPubkeys.has(recipientPubkey)

        if(isBlocked) return
        const tempId = crypto.randomUUID()
        const now = Math.floor(Date.now() / 1000)

        // Get expiration setting for this contact (NIP-40)
        const expirationSeconds = useContactStore.getState().getExpiration(recipientPubkey)
        const expiration = expirationSeconds > 0 ? now + expirationSeconds : undefined

        // Create optimistic message with placeholder
        const message: Message = {
            id: tempId,
            pubkey: '',
            recipientPubkey,
            content: caption ? `📷 ${caption}` : '📷 Uploading...',
            createdAt: now,
            status: 'sending',
            isOutgoing: true,
            encryptedEvent: '', // Placeholder
            expiration
        }

        // Add to state optimistically
        const messages = get().messages
        const existing = messages.get(recipientPubkey) || []
        messages.set(recipientPubkey, [...existing, message])
        set({messages: new Map(messages)})
        updateChats(get, set, recipientPubkey, message)

        try {
            // Compress image if needed
            const compressedFile = await compressImage(file)
            console.log('[FileMessage] Compressed file:', compressedFile.size, 'bytes')

            // Upload encrypted file to nostr.build (encrypted with recipient's pubkey)
            const uploadResult = await uploadFile(compressedFile, senderPrivateKey, recipientPubkey)
            console.log('[FileMessage] Upload result:', uploadResult)

            // Create file metadata for Kind 15
            const fileMetadata: FileMetadata = {
                url: uploadResult.url,
                mimeType: uploadResult.mimeType,
                hash: uploadResult.hash,
                size: uploadResult.size,
                dimensions: uploadResult.dimensions,
                caption,
                encrypted: true
            }

            // Create file gift wrap (Kind 15) with expiration
            const giftWrapOptions = expiration ? {expiration} : undefined
            const giftWrap = await createFileGiftWrap(fileMetadata, recipientPubkey, senderPrivateKey, giftWrapOptions)

            // Debug logging in dev mode
            if (import.meta.env.DEV) {
                const nonceTag = giftWrap.tags.find(t => t[0] === 'nonce')
                console.log('[FileMessage] Gift-wrap created:', {
                    id: giftWrap.id,
                    recipient: recipientPubkey.slice(0, 12) + '...',
                    kind: giftWrap.kind,
                    powDifficulty: nonceTag ? nonceTag[2] : 'none',
                    powNonce: nonceTag ? nonceTag[1] : 'none',
                    tags: giftWrap.tags
                })
            }

            // Create file metadata JSON for storing in content
            const fileData = JSON.stringify({
                url: uploadResult.url,
                mimeType: uploadResult.mimeType,
                encrypted: true
            })

            // Also create a regular text message for self (so we can see it in our chat)
            const selfContent = caption
                ? `${caption}\n[file:${fileData}]`
                : `[file:${fileData}]`
            const selfGiftWrap = await createSelfGiftWrap(selfContent, recipientPubkey, senderPrivateKey, giftWrapOptions)

            // Get recipient's preferred DM relays
            const recipientDMRelays = await useRelayStore.getState().getDMRelays(recipientPubkey)
            const connectedRelays = relayPool.getConnectedUrls()
            const allTargetRelays = [...new Set([...recipientDMRelays, ...connectedRelays])]

            // Connect to new relays if needed
            const newRelays = recipientDMRelays.filter(r => !connectedRelays.includes(r))
            await Promise.all(newRelays.map(r => relayPool.connect(r)))

            // Publish
            console.log('[FileMessage] Publishing to relays:', allTargetRelays)
            const [result1, result2] = await Promise.all([
                relayPool.publish(allTargetRelays, giftWrap as unknown as Event),
                relayPool.publish(connectedRelays, selfGiftWrap as unknown as Event)
            ])
            console.log('[FileMessage] Publish results:', {recipient: result1, self: result2})

            // Update message with final content and status
            const finalFileData = JSON.stringify({
                url: uploadResult.url,
                mimeType: uploadResult.mimeType,
                encrypted: true
            })
            const finalContent = caption
                ? `${caption}\n[file:${finalFileData}]`
                : `[file:${finalFileData}]`

            const updatedMessage: Message = {
                ...message,
                id: giftWrap.id,
                content: finalContent,
                status: result1.successes.length > 0 ? 'sent' : 'failed',
                encryptedEvent: JSON.stringify(selfGiftWrap) // Store self-addressed gift wrap
            }

            console.log('[FileMessage] Saving message to DB:', updatedMessage.id, 'status:', updatedMessage.status)
            await saveMessageToDB(updatedMessage)
            console.log('[FileMessage] Message saved successfully')

            const updatedMessages = get().messages
            const contactMessages = updatedMessages.get(recipientPubkey) || []
            updatedMessages.set(
                recipientPubkey,
                contactMessages.map(m => m.id === tempId ? updatedMessage : m)
            )
            set({messages: new Map(updatedMessages)})
            updateChats(get, set, recipientPubkey, updatedMessage)
        } catch (error) {
            console.error('Failed to send file message:', error)

            // Mark as failed
            const updatedMessages = get().messages
            const contactMessages = updatedMessages.get(recipientPubkey) || []
            updatedMessages.set(
                recipientPubkey,
                contactMessages.map(m => m.id === tempId ? {
                    ...m,
                    content: '📷 Failed to upload',
                    status: 'failed' as const
                } : m)
            )
            set({messages: new Map(updatedMessages)})
        }
    },

    subscribeToMessages: (userPubkey: string, userPrivateKey: string) => {
        const connectedRelays = relayPool.getConnectedUrls()
        if (connectedRelays.length === 0) return () => {
        }

        const processedIds = new Set<string>()
        // Track if initial sync is complete - only show notifications after EOSE
        let initialSyncDone = false

        return relayPool.subscribe(
            connectedRelays,
            [{kinds: [NIP17_KIND.GIFT_WRAP], '#p': [userPubkey]}],
            async (event) => {
                // Skip if already processed in this session
                if (processedIds.has(event.id)) return
                processedIds.add(event.id)

                // Debug logging in dev mode
                if (import.meta.env.DEV) {
                    const nonceTag = event.tags.find(t => t[0] === 'nonce')
                    console.log('[Message] Received gift-wrap:', {
                        id: event.id,
                        from: event.pubkey.slice(0, 12) + '...',
                        kind: event.kind,
                        powDifficulty: nonceTag ? nonceTag[2] : 'none',
                        powNonce: nonceTag ? nonceTag[1] : 'none',
                        createdAt: new Date(event.created_at * 1000).toISOString()
                    })
                }

                // Skip if message was previously deleted
                if (await isMessageDeleted(event.id)) return

                try {
                    const unwrapped = await unwrapGiftWrap(
                        event as unknown as Event & { kind: typeof NIP17_KIND.GIFT_WRAP },
                        userPrivateKey
                    )

                    if (!unwrapped) return

                    // Skip own messages (already handled locally)
                    if (unwrapped.senderPubkey === userPubkey) return

                    const blockedPubkeys = new Set(useBlockedContactStore.getState().blockedContacts.map(c => c.pubkey))
                    const isBlocked = blockedPubkeys.has(unwrapped.senderPubkey)

                    if(isBlocked) return

                    // Check if message has expired (NIP-40)
                    if (isMessageExpired(unwrapped.expiration)) {
                        return // Don't process expired messages
                    }

                    // Store the encrypted event (the original gift-wrap we received)
                    // Mark as 'read' immediately if user is viewing this chat
                    const isActiveChat = get().activeChat === unwrapped.senderPubkey
                    const message: Message = {
                        id: event.id,
                        pubkey: unwrapped.senderPubkey,
                        recipientPubkey: userPubkey,
                        content: unwrapped.content,
                        createdAt: unwrapped.createdAt,
                        status: isActiveChat ? 'read' : 'delivered',
                        isOutgoing: false,
                        encryptedEvent: JSON.stringify(event), // Store the gift-wrap event
                        expiration: unwrapped.expiration // NIP-40: Store expiration for filtering
                    }

                    // Check if message already exists
                    const messages = get().messages
                    const contactMessages = messages.get(unwrapped.senderPubkey) || []
                    if (contactMessages.some(m => m.id === event.id)) return

                    // Save and update state
                    await saveMessageToDB(message)
                    messages.set(unwrapped.senderPubkey, [...contactMessages, message].sort((a, b) => a.createdAt - b.createdAt))
                    set({messages: new Map(messages)})
                    updateChats(get, set, unwrapped.senderPubkey, message)

                    // Show notification for new message (if not in active chat)
                    // Only show notifications after initial sync (EOSE) to avoid duplicate notifications
                    // for messages that already triggered push notifications
                    if (initialSyncDone && get().activeChat !== unwrapped.senderPubkey) {
                        // Get contact name if available
                        const contact = await getContact(unwrapped.senderPubkey)
                        const senderName = contact?.name || truncateKey(unwrapped.senderPubkey, 8)

                        await notificationService.showMessageNotification(
                            senderName,
                            unwrapped.senderPubkey
                        )
                    }
                } catch (error) {
                    console.error('Failed to process message:', error)
                }
            },
            () => {
                // EOSE callback - initial sync complete, now allow notifications
                initialSyncDone = true
            }
        )
    },

    setActiveChat: (pubkey: string | null) => {
        set({activeChat: pubkey})
        if (pubkey) {
            get().markAsRead(pubkey)
        }
    },

    getMessagesForContact: (pubkey: string) => {
        const messages = get().messages.get(pubkey) || []
        // Filter out expired messages (NIP-40)
        return messages.filter(m => !isMessageExpired(m.expiration))
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
        set({messages: new Map(messages)})

        // Update chat unread count
        const chats = get().chats.map(c =>
            c.pubkey === pubkey ? {...c, unreadCount: 0} : c
        )
        set({chats})

        // Persist read status to IndexedDB
        const messagesToUpdate = contactMessages.filter(m => m.status === 'delivered' && !m.isOutgoing)
        await Promise.all(messagesToUpdate.map(m => saveMessageToDB({...m, status: 'read'})))
    },

    deleteMessage: async (contactPubkey: string, messageId: string) => {
        try {
            // Delete from IndexedDB and save to deleted list
            await deleteMessageFromDB(messageId)
            await saveDeletedMessageId(messageId)

            // Update state
            const messages = get().messages
            const contactMessages = messages.get(contactPubkey) || []
            const filteredMessages = contactMessages.filter(m => m.id !== messageId)

            if (filteredMessages.length === 0) {
                // Remove contact from messages map and chats
                messages.delete(contactPubkey)
                const chats = get().chats.filter(c => c.pubkey !== contactPubkey)
                set({messages: new Map(messages), chats})
            } else {
                messages.set(contactPubkey, filteredMessages)
                set({messages: new Map(messages)})

                // Update chat's last message if needed
                const lastMessage = filteredMessages[filteredMessages.length - 1]
                const chats = get().chats.map(c =>
                    c.pubkey === contactPubkey
                        ? {...c, lastMessage, updatedAt: lastMessage.createdAt}
                        : c
                )
                set({chats: chats.sort((a, b) => b.updatedAt - a.updatedAt)})
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

            // Delete all messages from IndexedDB and save to deleted list
            await Promise.all(contactMessages.map(async m => {
                await deleteMessageFromDB(m.id)
                await saveDeletedMessageId(m.id)
            }))

            // Remove from state
            messages.delete(contactPubkey)
            const chats = get().chats.filter(c => c.pubkey !== contactPubkey)

            // Clear active chat if it was this one
            const activeChat = get().activeChat === contactPubkey ? null : get().activeChat

            set({messages: new Map(messages), chats, activeChat})
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

    // Don't increment unread if message is from active chat (user sees it immediately)
    const isActiveChat = get().activeChat === pubkey
    const shouldIncrementUnread = !message.isOutgoing && !isActiveChat

    if (existingIndex >= 0) {
        const chat = chats[existingIndex]
        chats[existingIndex] = {
            ...chat,
            lastMessage: message,
            unreadCount: shouldIncrementUnread ? chat.unreadCount + 1 : chat.unreadCount,
            updatedAt: message.createdAt
        }
    } else {
        chats.push({
            pubkey,
            lastMessage: message,
            unreadCount: shouldIncrementUnread ? 1 : 0,
            updatedAt: message.createdAt
        })
    }

    set({chats: [...chats].sort((a, b) => b.updatedAt - a.updatedAt)})
}
