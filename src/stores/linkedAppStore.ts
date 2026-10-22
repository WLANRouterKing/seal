import { create } from 'zustand'
import type { Chat, Contact, Message } from '../types'
import type { CompanionSession, CompanionState, DeviceChat, DeviceMessage } from '../services/devices/session'
import type { LinkedVault } from '../services/devices/storage'
import { npubToPubkey } from '../services/keys'

interface Ownership {
  session: CompanionSession
  vault: LinkedVault<CompanionState>
  release(): void
}
interface LinkedAppState {
  active: boolean
  account: string
  activeChat: string | null
  chats: Chat[]
  contacts: Contact[]
  blockedContacts: Contact[]
  messages: Map<string, Message[]>
  expirations: Record<string, number>
  busy: boolean
  online: boolean
  error: string | null
  notice: string | null
  activate(owner: Ownership): void
  lock(notice?: string): void
  setActiveChat(peer: string | null): void
  refresh(): Promise<void>
  sendMessage(peer: string, text: string): Promise<void>
  deleteMessage(peer: string, id: string): Promise<void>
  deleteChat(peer: string): Promise<void>
  addContact(identity: string, name?: string): Promise<Contact | null>
  removeContact(peer: string): Promise<void>
  addBlockedContact(peer: string, name?: string): Promise<Contact | null>
  removeBlockedContact(peer: string): Promise<void>
  setExpiration(peer: string, seconds: number): Promise<void>
  clearError(): void
}
let ownership: Ownership | undefined
let polling: ReturnType<typeof setInterval> | undefined
let refreshing: CompanionSession | undefined
let refreshDone: Promise<void> = Promise.resolve()
let operations = 0
function messageFromWire(value: DeviceMessage, account: string, peer: string): Message {
  return {
    ...value,
    status: value.status as Message['status'],
    pubkey: value.isOutgoing ? account : peer,
    recipientPubkey: value.isOutgoing ? peer : account,
    encryptedEvent: '',
  }
}
async function command(op: string, data: unknown): Promise<unknown> {
  const owner = ownership
  if (!owner) throw new Error('Device locked')
  operations++
  useLinkedAppStore.setState({ busy: true, error: null })
  try {
    const result = await owner.session.request(op, data)
    if (ownership !== owner) throw new Error('Device locked')
    await useLinkedAppStore.getState().refresh()
    if (ownership !== owner) throw new Error('Device locked')
    return result
  } catch (error) {
    if (ownership === owner) useLinkedAppStore.setState({ error: (error as Error).message })
    throw error
  } finally {
    if (ownership === owner) {
      operations--
      useLinkedAppStore.setState({ busy: operations > 0 })
    }
  }
}
export const useLinkedAppStore = create<LinkedAppState>((set, get) => ({
  active: false,
  account: '',
  activeChat: null,
  chats: [],
  contacts: [],
  blockedContacts: [],
  messages: new Map(),
  expirations: {},
  busy: false,
  online: false,
  error: null,
  notice: null,
  activate(owner) {
    if (!owner.session.state.confirmed) throw new Error('Device confirmation required')
    get().lock()
    ownership = owner
    owner.session.setStatusHandler((status) => {
      if (ownership === owner && status === 'removed') get().lock('devices.removedExplanation')
    })
    set({ active: true, account: owner.session.state.account, notice: null })
    void get().refresh()
    polling = setInterval(() => {
      if (!operations) void get().refresh()
    }, 15000)
  },
  lock(notice) {
    const old = ownership
    ownership = undefined
    refreshing = undefined
    operations = 0
    clearInterval(polling)
    polling = undefined
    old?.session.close()
    old?.vault.lock()
    old?.release()
    set({
      active: false,
      account: '',
      activeChat: null,
      chats: [],
      contacts: [],
      blockedContacts: [],
      messages: new Map(),
      expirations: {},
      busy: false,
      online: false,
      error: null,
      notice: notice ?? null,
    })
  },
  setActiveChat(peer) {
    set({ activeChat: peer })
    void get().refresh()
  },
  async refresh() {
    const owner = ownership
    if (!owner) return
    if (refreshing === owner.session) {
      await refreshDone
      if (ownership === owner) await get().refresh()
      return
    }
    refreshing = owner.session
    let finish!: () => void
    refreshDone = new Promise<void>((resolve) => {
      finish = resolve
    })
    try {
      const chats = (await owner.session.request('chats', null)) as DeviceChat[]
      if (ownership !== owner) return
      const addressBook = (await owner.session.request('contacts', null)) as {
        contacts: Contact[]
        blocked: Contact[]
        expirations: Record<string, number>
      }
      if (ownership !== owner) return
      const peer = get().activeChat
      const messages = new Map(get().messages)
      if (peer) {
        const history = (await owner.session.request('history', { peer })) as DeviceMessage[]
        if (ownership !== owner) return
        messages.set(
          peer,
          history.map((value) => messageFromWire(value, owner.session.state.account, peer))
        )
      }
      set({
        contacts: addressBook.contacts,
        blockedContacts: addressBook.blocked,
        expirations: addressBook.expirations,
        messages,
        chats: chats.map((chat) => ({
          pubkey: chat.pubkey,
          updatedAt: chat.updatedAt,
          unreadCount: chat.unreadCount ?? 0,
          contact: addressBook.contacts.find((contact) => contact.pubkey === chat.pubkey),
          lastMessage: chat.lastMessage
            ? messageFromWire(chat.lastMessage, owner.session.state.account, chat.pubkey)
            : undefined,
        })),
        online: true,
        error: null,
      })
      // If selection changed during fetch, immediately request the newly selected conversation.
      if (get().activeChat !== peer)
        queueMicrotask(() => {
          if (ownership === owner) void get().refresh()
        })
    } catch (error) {
      if (ownership === owner) set({ online: false, error: (error as Error).message })
    } finally {
      if (refreshing === owner.session) refreshing = undefined
      finish()
    }
  },
  async sendMessage(peer, text) {
    await command('send', { peer, text })
  },
  async deleteMessage(peer, id) {
    await command('delete-message', { peer, id })
  },
  async deleteChat(peer) {
    await command('delete-chat', { peer })
    if (get().activeChat === peer) set({ activeChat: null })
    const messages = new Map(get().messages)
    messages.delete(peer)
    set({ messages })
  },
  async addContact(identity, name) {
    const peer = identity.startsWith('npub') ? npubToPubkey(identity) : identity
    if (!peer) {
      set({ error: 'Invalid public key' })
      return null
    }
    try {
      return (await command('contact-add', { peer, name: name ?? '' })) as Contact
    } catch {
      return null
    }
  },
  async removeContact(peer) {
    await command('contact-remove', { peer })
  },
  async addBlockedContact(peer, name) {
    try {
      return (await command('contact-block', { peer, name: name ?? '' })) as Contact
    } catch {
      return null
    }
  },
  async removeBlockedContact(peer) {
    await command('contact-unblock', { peer })
  },
  async setExpiration(peer, seconds) {
    await command('expiration', { peer, seconds })
  },
  clearError() {
    set({ error: null })
  },
}))
/** Main accounts keep their existing stores. No fake nsec or account signer is created for a companion. */
export function useLinkedApp() {
  const state = useLinkedAppStore()
  return state.active ? state : null
}
