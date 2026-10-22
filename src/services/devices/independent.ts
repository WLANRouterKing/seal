import { SimplePool, verifyEvent, type Event } from 'nostr-tools'
import type { AccountSigner } from '../accountSigner'
import { createLocalAccountSigner } from '../accountSigner'
import { createGiftWrap, unwrapGiftWrap } from '../crypto'
import { isKey, now } from './protocol'
import type { CompanionState, DeviceMessage } from './session'
import { primaryStore, type StateStore } from './storage'
import type { Contact } from '../../types'
import { pubkeyToNpub } from '../keys'

// Seal-specific identity extension. Inner and outer NIP-17 authors remain equal;
// the account identity is separately proven by an account-signed device roster.
export const DIRECTORY_KIND = 30078
export const DIRECTORY_ID = 'seal-independent-devices-v1'
export const DEVICE_RELAYS = ['wss://nos.lol']
const pool = new SimplePool({ enableReconnect: true })
export interface Directory {
  event: Event
  devices: string[]
}
export interface IndependentData {
  messages: IndependentMessage[]
  contacts: Contact[]
  blocked: Contact[]
  expirations: Record<string, number>
  directories: Record<string, Event>
  deleted: string[]
}
export interface IndependentMessage extends DeviceMessage {
  sender: string
  recipient: string
}
interface Wire {
  protocol: typeof DIRECTORY_ID
  proof: Event
  message: Event
}
export function inspectDirectory(event: Event, account: string): Directory {
  const clean: Event = JSON.parse(JSON.stringify(event))
  if (
    !verifyEvent(clean) ||
    clean.pubkey !== account ||
    clean.kind !== DIRECTORY_KIND ||
    JSON.stringify(clean.tags) !== JSON.stringify([['d', DIRECTORY_ID]]) ||
    clean.created_at > now() + 30
  )
    throw new Error('Invalid account device directory')
  const body = JSON.parse(clean.content)
  if (
    body.version !== 1 ||
    !Array.isArray(body.devices) ||
    body.devices.length > 10 ||
    body.devices.some((key: unknown) => !isKey(key)) ||
    new Set(body.devices).size !== body.devices.length
  )
    throw new Error('Invalid device list')
  return { event: clean, devices: body.devices }
}
function newer(a: Event, b: Event) {
  return a.created_at > b.created_at || (a.created_at === b.created_at && a.id < b.id)
}
export async function publishDirectory(signer: AccountSigner, devices: string[], previous?: Event): Promise<Event> {
  // NIP-01 replacement order: wait for the next second rather than publishing future events.
  if (previous && previous.created_at >= now())
    await new Promise((resolve) => setTimeout(resolve, (previous.created_at - now() + 1) * 1000))
  signer.assertActive()
  const event = await signer.signEvent({
    kind: DIRECTORY_KIND,
    tags: [['d', DIRECTORY_ID]],
    created_at: now(),
    content: JSON.stringify({ version: 1, devices }),
  })
  inspectDirectory(event, signer.pubkey)
  await Promise.any(pool.publish(DEVICE_RELAYS, event))
  signer.assertActive()
  return event
}
export async function directory(account: string, pinned?: Event): Promise<Directory | null> {
  if (!isKey(account)) throw new Error('Invalid account')
  const events = await pool.querySync(
    DEVICE_RELAYS,
    { kinds: [DIRECTORY_KIND], authors: [account], '#d': [DIRECTORY_ID] },
    { maxWait: 6000 }
  )
  let best: Directory | null = null
  for (const event of events) {
    try {
      const value = inspectDirectory(event, account)
      if (!best || newer(value.event, best.event)) best = value
    } catch {
      /* Invalid relay data is not authority. */
    }
  }
  if (pinned && (!best || newer(pinned, best.event)))
    throw new Error('Device directory unavailable or rolled back; retry when relays are reachable')
  return best
}
export function checkWire(
  value: unknown,
  transportAuthor: string,
  recipientKey: string,
  recipientAccount: string,
  current: Directory
): IndependentMessage {
  const wire = value as Wire
  if (wire?.protocol !== DIRECTORY_ID) throw new Error('Unsupported device message')
  const proof = inspectDirectory(wire.proof, wire.proof.pubkey)
  const message: Event = JSON.parse(JSON.stringify(wire.message))
  if (
    !verifyEvent(message) ||
    message.kind !== 14 ||
    message.pubkey !== transportAuthor ||
    current.event.pubkey !== proof.event.pubkey ||
    newer(proof.event, current.event) ||
    (message.pubkey !== proof.event.pubkey &&
      (!proof.devices.includes(message.pubkey) || !current.devices.includes(message.pubkey)))
  )
    throw new Error('Unauthorized message device')
  const body = JSON.parse(message.content)
  if (
    !isKey(body.recipient) ||
    typeof body.text !== 'string' ||
    body.text.length > 4000 ||
    !Number.isSafeInteger(message.created_at) ||
    message.created_at > now() + 60 ||
    (body.expiration !== undefined &&
      (!Number.isSafeInteger(body.expiration) || body.expiration <= message.created_at)) ||
    (body.recipient !== recipientAccount && proof.event.pubkey !== recipientAccount) ||
    (recipientKey !== recipientAccount && !isKey(recipientKey))
  )
    throw new Error('Invalid device message')
  return {
    id: message.id,
    content: body.text,
    createdAt: message.created_at,
    sender: proof.event.pubkey,
    recipient: body.recipient,
    isOutgoing: proof.event.pubkey === recipientAccount,
    status: 'delivered',
    expiration: body.expiration,
  }
}
export async function decodeIndependent(
  content: string,
  transportAuthor: string,
  recipientKey: string,
  account: string,
  pinned?: Event
): Promise<{ message: IndependentMessage; proof: Event } | null> {
  let wire: Wire
  try {
    wire = JSON.parse(content)
  } catch {
    return null
  }
  if (wire?.protocol !== DIRECTORY_ID) return null
  const proof = inspectDirectory(wire.proof, wire.proof.pubkey)
  const current = await directory(proof.event.pubkey, pinned)
  if (!current) throw new Error('Sender device directory unavailable')
  return { message: checkWire(wire, transportAuthor, recipientKey, account, current), proof: current.event }
}
export async function sendIndependent(
  signer: AccountSigner,
  account: string,
  peer: string,
  text: string,
  own: Directory,
  target: Directory,
  expiration?: number
) {
  if (
    own.event.pubkey !== account ||
    target.event.pubkey !== peer ||
    (signer.pubkey !== account && !own.devices.includes(signer.pubkey))
  )
    throw new Error('Device access revoked')
  if (!text.trim() || text.length > 4000) throw new Error('Message must contain 1–4000 characters')
  const message = await signer.signEvent({
    kind: 14,
    tags: [['p', peer]],
    created_at: now(),
    content: JSON.stringify({ recipient: peer, text, expiration, nonce: crypto.randomUUID() }),
  })
  const wire: Wire = { protocol: DIRECTORY_ID, proof: own.event, message }
  const recipients = [...new Set([peer, ...target.devices, account, ...own.devices])]
  const events: Event[] = []
  for (const recipient of recipients) events.push(await createGiftWrap(JSON.stringify(wire), recipient, signer))
  // Every authorized inbox must have a relay acknowledgment; never report a partial fanout as a complete send.
  await Promise.all(events.map((event) => Promise.any(pool.publish(DEVICE_RELAYS, event))))
  signer.assertActive()
  return {
    message: {
      id: message.id,
      content: text,
      createdAt: message.created_at,
      sender: account,
      recipient: peer,
      isOutgoing: true,
      status: 'sent',
      expiration,
    } as IndependentMessage,
    self: events[recipients.indexOf(signer.pubkey)],
  }
}
export interface AppDeviceSession {
  state: CompanionState
  request(op: string, data: unknown): Promise<unknown>
  close(): void
  setStatusHandler(handler: (status: 'grant' | 'removed') => void): void
}
export class IndependentSession implements AppDeviceSession {
  readonly state: CompanionState
  private signer: ReturnType<typeof createLocalAccountSigner>
  private active = true
  private queue = Promise.resolve()
  private subscription: { close(): void }
  private rosterSubscription: { close(): void }
  private changed: (status: 'grant' | 'removed') => void = () => {}
  private data: IndependentData
  private store: StateStore<CompanionState>
  constructor(state: CompanionState, store: StateStore<CompanionState>) {
    if (!state.confirmed || !state.directory) throw new Error('Link this device again to enable independent messaging')
    this.store = store
    this.state = structuredClone(state)
    this.signer = createLocalAccountSigner(this.state.secret)
    const proof = inspectDirectory(state.directory, state.account)
    if (!proof.devices.includes(this.signer.pubkey)) throw new Error('Device not authorized')
    this.data = this.state.independent ??= {
      messages: [],
      contacts: [],
      blocked: [],
      expirations: {},
      directories: { [state.account]: state.directory },
      deleted: [],
    }
    this.rosterSubscription = pool.subscribeMany(
      DEVICE_RELAYS,
      { kinds: [DIRECTORY_KIND], authors: [state.account], '#d': [DIRECTORY_ID] },
      {
        onevent: (event) => {
          void this.enqueue(async () => {
            const roster = inspectDirectory(event, state.account)
            const previous = this.data.directories[state.account]
            if (previous && !newer(event, previous)) return
            this.data.directories[state.account] = roster.event
            await this.save()
            if (!roster.devices.includes(this.signer.pubkey)) this.changed('removed')
          }).catch(() => {})
        },
      }
    )
    this.subscription = pool.subscribeMany(
      DEVICE_RELAYS,
      { kinds: [1059], '#p': [this.signer.pubkey] },
      {
        onevent: (event) => {
          void this.enqueue(async () => {
            const unwrapped = await unwrapGiftWrap(event, this.signer)
            if (!unwrapped) return
            let sender: string | undefined
            try {
              sender = JSON.parse(unwrapped.content).proof?.pubkey
            } catch {
              return
            }
            const decoded = await decodeIndependent(
              unwrapped.content,
              unwrapped.senderPubkey,
              this.signer.pubkey,
              this.state.account,
              sender ? this.data.directories[sender] : undefined
            )
            this.check()
            if (!decoded || this.data.blocked.some((contact) => contact.pubkey === decoded.message.sender)) return
            this.data.directories[decoded.proof.pubkey] = decoded.proof
            this.insert(decoded.message)
            await this.save()
          }).catch(() => {})
        },
      }
    )
  }
  private check() {
    if (!this.active) throw new Error('Device locked')
    this.store.assertActive()
    this.signer.assertActive()
  }
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.queue.then(() => {
      this.check()
      return fn()
    })
    this.queue = task.then(
      () => {},
      () => {}
    )
    return task
  }
  private async save() {
    this.check()
    await this.store.save(this.state)
    this.check()
  }
  private insert(message: IndependentMessage) {
    if (
      this.data.deleted.includes(message.id) ||
      this.data.messages.some((item) => item.id === message.id) ||
      (message.expiration && message.expiration <= now())
    )
      return
    this.data.messages.push(message)
    this.data.messages.sort((a, b) => a.createdAt - b.createdAt)
  }
  setStatusHandler(handler: (status: 'grant' | 'removed') => void) {
    this.changed = handler
  }
  request(op: string, input: unknown): Promise<unknown> {
    return this.enqueue(async () => {
      const data = input as { peer: string; name?: string; text: string; id: string; seconds: number } | null
      this.data.messages = this.data.messages.filter((m) => !m.expiration || m.expiration > now())
      if (op === 'chats') {
        const chats = new Map<
          string,
          { pubkey: string; updatedAt: number; unreadCount: number; lastMessage: IndependentMessage }
        >()
        for (const message of this.data.messages) {
          const peer = message.isOutgoing ? message.recipient : message.sender
          const old = chats.get(peer)
          chats.set(peer, {
            pubkey: peer,
            updatedAt: message.createdAt,
            unreadCount: (old?.unreadCount ?? 0) + (!message.isOutgoing && message.status !== 'read' ? 1 : 0),
            lastMessage: message,
          })
        }
        return [...chats.values()].sort((a, b) => b.updatedAt - a.updatedAt)
      }
      if (op === 'contacts')
        return { contacts: this.data.contacts, blocked: this.data.blocked, expirations: this.data.expirations }
      if (!data || !isKey(data.peer)) throw new Error('Invalid contact')
      if (op === 'history') {
        const messages = this.data.messages.filter((m) => (m.isOutgoing ? m.recipient : m.sender) === data.peer)
        messages.forEach((m) => {
          if (!m.isOutgoing) m.status = 'read'
        })
        await this.save()
        return messages
      }
      if (op === 'send') {
        if (this.data.blocked.some((c) => c.pubkey === data.peer)) throw new Error('Contact is blocked')
        const own = await directory(this.state.account, this.data.directories[this.state.account])
        this.check()
        if (!own || !own.devices.includes(this.signer.pubkey)) {
          this.changed('removed')
          throw new Error('Device access revoked')
        }
        const target = await directory(data.peer, this.data.directories[data.peer])
        if (!target) throw new Error('This contact needs a Seal version supporting independent devices')
        this.data.directories[this.state.account] = own.event
        this.data.directories[data.peer] = target.event
        await this.save()
        const seconds = this.data.expirations[data.peer] ?? 0
        const sent = await sendIndependent(
          this.signer,
          this.state.account,
          data.peer,
          data.text,
          own,
          target,
          seconds ? now() + seconds : undefined
        )
        this.check()
        this.insert(sent.message)
        await this.save()
        return { sent: true }
      }
      if (op === 'contact-add' || op === 'contact-block') {
        if ((data.name?.length ?? 0) > 100) throw new Error('Name too long')
        const contact = { pubkey: data.peer, npub: pubkeyToNpub(data.peer), name: data.name, createdAt: now() }
        const list = op === 'contact-add' ? this.data.contacts : this.data.blocked
        if (!list.some((c) => c.pubkey === data.peer)) list.push(contact)
        await this.save()
        return contact
      }
      if (op === 'contact-remove') this.data.contacts = this.data.contacts.filter((c) => c.pubkey !== data.peer)
      else if (op === 'contact-unblock') this.data.blocked = this.data.blocked.filter((c) => c.pubkey !== data.peer)
      else if (op === 'expiration') {
        if (![0, 60, 300, 600, 900, 1800, 3600, 21600, 43200, 86400, 604800].includes(data.seconds))
          throw new Error('Invalid timer')
        this.data.expirations[data.peer] = data.seconds
      } else if (op === 'delete-message' || op === 'delete-chat') {
        const remove = this.data.messages.filter(
          (m) => (m.isOutgoing ? m.recipient : m.sender) === data.peer && (op === 'delete-chat' || m.id === data.id)
        )
        this.data.deleted.push(...remove.map((m) => m.id))
        this.data.messages = this.data.messages.filter((m) => !this.data.deleted.includes(m.id))
      } else throw new Error('Unsupported operation')
      await this.save()
      return { ok: true }
    })
  }
  close() {
    this.active = false
    this.subscription.close()
    this.rosterSubscription.close()
    this.signer.dispose()
    this.state.secret = ''
    this.data.messages = []
    this.data.contacts = []
    this.data.blocked = []
    this.data.directories = {}
  }
}

let directoryWrites = Promise.resolve()
export function primaryDirectory(signer: AccountSigner, peer: string): Promise<Directory | null> {
  const task = directoryWrites.then(async () => {
    signer.assertActive()
    const store = primaryStore<Record<string, Event>>(signer.pubkey, 'directories')
    const known = (await store.load()) ?? {}
    const result = await directory(peer, known[peer])
    if (result) {
      known[peer] = result.event
      await store.save(known)
    }
    signer.assertActive()
    return result
  })
  directoryWrites = task.then(
    () => {},
    () => {}
  )
  return task
}
export function archivedIndependent(content: string, author: string, account: string): IndependentMessage | null {
  let wire: Wire
  try {
    wire = JSON.parse(content)
  } catch {
    return null
  }
  if (wire?.protocol !== DIRECTORY_ID) return null
  return checkWire(wire, author, account, account, inspectDirectory(wire.proof, wire.proof.pubkey))
}
export async function receivePrimaryIndependent(
  content: string,
  author: string,
  signer: AccountSigner
): Promise<IndependentMessage | null> {
  let wire: Wire
  try {
    wire = JSON.parse(content)
  } catch {
    return null
  }
  if (wire?.protocol !== DIRECTORY_ID) return null
  const proof = inspectDirectory(wire.proof, wire.proof.pubkey)
  const current = await primaryDirectory(signer, proof.event.pubkey)
  if (!current) throw new Error('Sender device directory unavailable')
  return checkWire(wire, author, signer.pubkey, signer.pubkey, current)
}
