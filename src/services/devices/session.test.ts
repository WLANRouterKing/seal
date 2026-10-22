// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { Event } from 'nostr-tools'
import { createLocalAccountSigner } from '../accountSigner'
import {
  CompanionSession,
  PrimarySession,
  parseCommand,
  type CompanionState,
  type PrimaryState,
  type TransportFactory,
} from './session'
import {
  inspectRequest,
  makeRequest,
  newDeviceSecret,
  now,
  openPacket,
  PROTOCOL,
  randomId,
  sealPacket,
} from './protocol'
import type { StateStore } from './storage'

function memory<T>(initial?: T): StateStore<T> {
  let value = structuredClone(initial)
  return {
    assertActive() {},
    load: async () => structuredClone(value),
    save: async (state) => {
      value = structuredClone(state)
    },
  }
}
function wire() {
  const receivers = new Map<string, Set<(event: Event) => void>>()
  const events: Event[] = []
  const publish = async (event: Event) => {
    events.push(JSON.parse(JSON.stringify(event)))
    for (const callback of receivers.get(event.tags[0][1]) ?? [])
      queueMicrotask(() => callback(JSON.parse(JSON.stringify(event))))
  }
  const factory: TransportFactory = () => {
    let close = () => {}
    return {
      listen(pubkey, callback) {
        const set = receivers.get(pubkey) ?? new Set()
        set.add(callback)
        receivers.set(pubkey, set)
        close = () => {
          set.delete(callback)
        }
        return close
      },
      publish,
      close() {
        close()
      },
    }
  }
  return { factory, publish, events }
}
async function fixture() {
  const network = wire()
  const accountSecret = newDeviceSecret()
  const account = createLocalAccountSigner(accountSecret)
  const secret = newDeviceSecret()
  const request = makeRequest(secret, {
    account: account.pubkey,
    name: 'Laptop',
    expires: now() + 300,
    session: randomId(),
    relays: ['wss://nos.lol'],
  })
  const state: CompanionState = { account: account.pubkey, secret, request, confirmed: false, seq: 0 }
  const companionStore = memory(state),
    primaryStore = memory<PrimaryState>()
  const execute = vi.fn(async () => ({ sent: true }))
  let primary = await PrimarySession.create(primaryStore, account, network.factory, execute)
  const changed = vi.fn()
  const companion = new CompanionSession(state, companionStore, network.factory, changed)
  const info = inspectRequest(JSON.stringify(request))
  return {
    network,
    account,
    accountSecret,
    state,
    companionStore,
    primaryStore,
    execute,
    changed,
    companion,
    info,
    get primary() {
      return primary
    },
    async restart() {
      primary.close()
      primary = await PrimarySession.create(primaryStore, account, network.factory, execute)
    },
    close() {
      companion.close()
      primary.close()
      account.dispose()
    },
  }
}
describe('real application device authorization', () => {
  it('pins account, expiry, QR signature and explicit confirmation; grants no generic signer capability', async () => {
    const f = await fixture()
    try {
      await expect(f.primary.approve(f.info, 'wrong')).rejects.toThrow('confirmation')
      expect(() => inspectRequest(JSON.stringify(f.state.request), f.info.expires)).toThrow('expired')
      expect(() => inspectRequest(JSON.stringify({ ...f.state.request, content: '{}' }))).toThrow()
      expect(() => parseCommand('sign_event', { peer: f.account.pubkey })).toThrow('not permitted')
      await f.primary.approve(f.info, f.info.code)
      await vi.waitFor(() => expect(f.changed).toHaveBeenCalledWith('grant'))
      expect(f.primary.list()[0].status).toBe('pending')
      await f.companion.confirm(f.info.code)
      expect(f.primary.list()[0].status).toBe('linked')
      await expect(f.primary.approve(f.info, f.info.code)).rejects.toThrow('already used')
      expect(JSON.stringify(f.network.events)).not.toContain(f.accountSecret)
      expect(JSON.stringify(f.network.events)).not.toContain(f.state.secret)
    } finally {
      f.close()
    }
  })
  it('uses encrypted requests, persists replay prevention through restart and enforces revocation', async () => {
    const f = await fixture()
    try {
      await f.primary.approve(f.info, f.info.code)
      await vi.waitFor(() => expect(f.companion.grant).toBeDefined())
      await f.companion.confirm(f.info.code)
      const text = 'secret message ' + randomId()
      await f.companion.request('send', { peer: f.account.pubkey, text })
      expect(f.execute).toHaveBeenCalledTimes(1)
      const request = f.network.events.findLast((event) => event.pubkey === f.state.request.pubkey)!
      expect(JSON.stringify(f.network.events)).not.toContain(text)
      await f.restart()
      await f.network.publish(request)
      // A fresh legitimate request is processed after the replay in the same queue.
      await f.companion.request('chats', null)
      expect(f.execute).toHaveBeenCalledTimes(2)
      await f.primary.remove(f.state.request.pubkey)
      await vi.waitFor(() => expect(f.changed).toHaveBeenCalledWith('removed'))
      await f.restart()
      await f.network.publish(request)
      expect(f.primary.list()[0].status).toBe('removed')
      await expect(f.companion.request('send', { peer: f.account.pubkey, text })).rejects.toThrow('closed')
      expect(f.execute).toHaveBeenCalledTimes(2)
    } finally {
      f.close()
    }
  })
  it('rejects wrong sender, wrong session, tampering and plaintext envelopes', async () => {
    const a = createLocalAccountSigner(newDeviceSecret()),
      b = createLocalAccountSigner(newDeviceSecret()),
      attacker = createLocalAccountSigner(newDeviceSecret())
    const packet = {
      protocol: PROTOCOL as typeof PROTOCOL,
      session: randomId(),
      id: randomId(),
      seq: 1,
      op: 'chats',
      data: null,
    }
    try {
      const event = await sealPacket(a, b.pubkey, packet)
      expect(await openPacket(b, a.pubkey, event, packet.session)).toEqual(packet)
      await expect(openPacket(b, attacker.pubkey, event, packet.session)).rejects.toThrow()
      await expect(openPacket(b, a.pubkey, event, randomId())).rejects.toThrow()
      await expect(
        openPacket(b, a.pubkey, { ...event, content: JSON.stringify(packet) }, packet.session)
      ).rejects.toThrow()
      await expect(openPacket(b, a.pubkey, event, packet.session, now() + 100)).rejects.toThrow()
    } finally {
      a.dispose()
      b.dispose()
      attacker.dispose()
    }
  })
})

it('restricts contact and conversation commands to their explicit validated arguments', () => {
  const peer = 'a'.repeat(64)
  expect(parseCommand('contact-add', { peer, name: 'Alice' })).toEqual({ op: 'contact-add', peer, name: 'Alice' })
  expect(parseCommand('expiration', { peer, seconds: 3600 })).toEqual({ op: 'expiration', peer, seconds: 3600 })
  for (const [op, data] of [
    ['contact-add', { peer, name: 'a'.repeat(101) }],
    ['contact-block', { peer: 'bad', name: 'Alice' }],
    ['delete-message', { peer, id: '../other' }],
    ['expiration', { peer, seconds: -1 }],
    ['decrypt', { peer, content: 'ciphertext' }],
  ] as const)
    expect(() => parseCommand(op, data)).toThrow()
})
