import { getAccountSigner } from '../accountSignerSession'
import { onVaultCleared } from '../encryptionKeyManager'
import { useMessageStore } from '../../stores/messageStore'
import { useBlockedContactStore } from '../../stores/blockedContactStore'
import { primaryStore } from './storage'
import { DeviceTransport, exclusiveDeviceSession } from './transport'
import { PrimarySession, type DeviceCommand, type DeviceMessage, type PrimaryState } from './session'

let current: PrimarySession | undefined
let starting: Promise<PrimarySession> | undefined
let release: (() => void) | undefined
let generation = 0
const listeners = new Set<() => void>()
export const onDevicesChanged = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const changed = () => listeners.forEach((fn) => fn())
async function execute(command: DeviceCommand): Promise<unknown> {
  const signer = getAccountSigner()
  if (!signer) throw new Error('Primary device locked')
  const store = useMessageStore.getState()
  if (store.isLoading) throw new Error('Chats are loading')
  if (command.op === 'chats')
    return store.chats
      .slice(0, 100)
      .map((chat) => ({
        pubkey: chat.pubkey,
        name: chat.contact?.name ?? chat.pubkey.slice(0, 16),
        updatedAt: chat.updatedAt,
      }))
  if (useBlockedContactStore.getState().blockedContacts.some((contact) => contact.pubkey === command.peer))
    throw new Error('Contact is blocked')
  if (command.op === 'send') {
    if (!(await store.sendMessage(command.peer, command.text, signer))) throw new Error('Message was not sent')
    return { sent: true }
  }
  const messages = store
    .getMessagesForContact(command.peer)
    .filter(
      (message) =>
        (!message.expiration || message.expiration > Date.now() / 1000) &&
        (!command.before || message.createdAt < command.before)
    )
    .slice(-20)
  const result: DeviceMessage[] = []
  let size = 0
  for (const message of messages.toReversed()) {
    const safe: DeviceMessage = {
      id: message.id,
      content: message.content,
      createdAt: message.createdAt,
      isOutgoing: message.isOutgoing,
      status: message.status,
      expiration: message.expiration,
    }
    const length = new TextEncoder().encode(JSON.stringify(safe)).length
    if (size + length > 40000) break
    size += length
    result.unshift(safe)
  }
  return result
}
export async function getPrimarySession(): Promise<PrimarySession> {
  if (current) return current
  if (starting) return starting
  const signer = getAccountSigner()
  if (!signer) throw new Error('Unlock the primary device first')
  const issued = generation
  starting = (async () => {
    const unlock = await exclusiveDeviceSession('primary:' + signer.pubkey)
    try {
      if (issued !== generation) throw new Error('Primary device locked')
      const session = await PrimarySession.create(
        primaryStore<PrimaryState>(signer.pubkey),
        signer,
        (urls) => new DeviceTransport(urls),
        execute,
        changed
      )
      if (issued !== generation) {
        session.close()
        throw new Error('Primary device locked')
      }
      release = unlock
      current = session
      return session
    } catch (error) {
      unlock()
      throw error
    }
  })()
  const pending = starting
  try {
    return await pending
  } finally {
    if (starting === pending) starting = undefined
  }
}
export function stopPrimarySession() {
  generation++
  starting = undefined
  current?.close()
  current = undefined
  release?.()
  release = undefined
  changed()
}
onVaultCleared(stopPrimarySession)
