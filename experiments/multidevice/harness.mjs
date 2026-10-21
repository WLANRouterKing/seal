// Test harness only. No production entry point imports this module.
import { finalizeEvent, generateSecretKey, getPublicKey, nip44, matchFilters, verifyEvent } from 'nostr-tools'
import {
  MarmotClient,
  createApplicationMessageIntent,
  createChatRumor,
  deserializeApplicationData,
} from '@internet-privacy/marmot-ts'

export const RELAYS = ['wss://in-memory.invalid']
export const wireCopy = (value) => JSON.parse(JSON.stringify(value))

// Mimic structured-clone persistence instead of sharing live MLS state objects.
// This is deliberately RAM-only; a production store must encrypt all values.
class SnapshotStore {
  values = new Map()
  async getItem(key) {
    return structuredClone(this.values.get(key) ?? null)
  }
  async setItem(key, value) {
    this.values.set(key, structuredClone(value))
    return value
  }
  async removeItem(key) {
    this.values.delete(key)
  }
  async clear() {
    this.values.clear()
  }
  async keys() {
    return [...this.values.keys()]
  }
}

export async function copyStores(stores) {
  const copy = { clientId: stores.clientId }
  for (const name of ['groupStateStore', 'keyPackageStore']) {
    copy[name] = new SnapshotStore()
    for (const key of await stores[name].keys()) {
      await copy[name].setItem(key, await stores[name].getItem(key))
    }
  }
  return copy
}

// Serialization is intentional: applesauce attaches decrypted-data caches to
// event objects. Sharing those objects would invalidate confidentiality tests.
export class MemoryRelay {
  events = []
  async publish(relays, event) {
    const copy = wireCopy(event)
    if (!verifyEvent(copy)) throw new Error('Invalid relay event signature')
    this.events.push(copy)
    return Object.fromEntries(relays.map((from) => [from, { from, ok: true }]))
  }
  async request(_relays, filters) {
    return this.events.filter((e) => matchFilters(Array.isArray(filters) ? filters : [filters], e)).map(wireCopy)
  }
  async getUserInboxRelays() {
    return RELAYS
  }
  subscription() {
    throw new Error('Tests explicitly deliver each wire event')
  }
  latest(kind) {
    return wireCopy(this.events.findLast((e) => e.kind === kind))
  }
}

export function createAccount() {
  const secret = generateSecretKey()
  const pubkey = getPublicKey(secret)
  let online = true
  let calls = 0
  const requireOnline = () => {
    calls++
    if (!online) throw new Error('Account signer offline')
  }
  return {
    pubkey,
    goOffline() {
      online = false
    },
    goOnline() {
      online = true
    },
    get calls() {
      return calls
    },
    signer: {
      getPublicKey: async () => pubkey,
      signEvent: async (template) => {
        requireOnline()
        return finalizeEvent(template, secret)
      },
      nip44: {
        encrypt: async (peer, plaintext) => {
          requireOnline()
          return nip44.v2.encrypt(plaintext, nip44.v2.utils.getConversationKey(secret, peer))
        },
        decrypt: async (peer, ciphertext) => {
          requireOnline()
          return nip44.v2.decrypt(ciphertext, nip44.v2.utils.getConversationKey(secret, peer))
        },
      },
    },
  }
}

// Models a pairing-time signing RPC, NOT an implemented secure QR channel.
// The linked client receives no nsec and never gets NIP-44 access. After setup
// the callback is dropped, so even requesting an account signature must fail.
export function pairingSigner(pubkey, signDuringPairing) {
  let sign = signDuringPairing
  let denied = 0
  return {
    finish() {
      sign = undefined
    },
    get denied() {
      return denied
    },
    signer: {
      getPublicKey: async () => pubkey,
      signEvent: async (event) => {
        if (!sign || ![450, 30443].includes(event.kind)) {
          denied++
          throw new Error('Pairing signer unavailable')
        }
        return sign(event)
      },
    },
  }
}

export function createDevice(
  signer,
  network,
  stores = {
    groupStateStore: new SnapshotStore(),
    keyPackageStore: new SnapshotStore(),
    clientId: Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) => x.toString(16).padStart(2, '0')).join(''),
  }
) {
  return { client: new MarmotClient({ signer, network, ...stores }), stores }
}

export async function send(device, group, pubkey, content) {
  return device.client.groups.send(group.id, createApplicationMessageIntent(createChatRumor({ pubkey, content })))
}

export async function receive(group, events) {
  const messages = []
  const results = []
  for await (const result of group.ingest(events.map(wireCopy))) {
    results.push(result.kind)
    if (result.kind === 'processed' && result.result.kind === 'applicationMessage') {
      messages.push(deserializeApplicationData(result.result.message))
    }
  }
  return { messages, results }
}
