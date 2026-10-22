// @vitest-environment node
// Opt-in only: publishes encrypted synthetic traffic to the explicitly selected relay.
import { expect, it, vi } from 'vitest'
import { createLocalAccountSigner } from '../accountSigner'
import { DeviceTransport } from './transport'
import { PrimarySession, CompanionSession, type PrimaryState, type CompanionState } from './session'
import { newDeviceSecret, makeRequest, now, randomId, inspectRequest } from './protocol'
import type { StateStore } from './storage'
function store<T>(initial?: T): StateStore<T> {
  let state = structuredClone(initial)
  return {
    assertActive() {},
    load: async () => structuredClone(state),
    save: async (value) => {
      state = structuredClone(value)
    },
  }
}
it.skipIf(!process.env.SEAL_DEVICE_RELAY)(
  'pairs, exchanges encrypted requests, restarts and revokes through a real relay',
  async () => {
    const relays = [process.env.SEAL_DEVICE_RELAY!]
    const account = createLocalAccountSigner(newDeviceSecret())
    const secret = newDeviceSecret()
    const request = makeRequest(secret, {
      account: account.pubkey,
      name: 'Seal integration test',
      expires: now() + 300,
      session: randomId(),
      relays,
    })
    const state: CompanionState = { account: account.pubkey, secret, request, seq: 0, confirmed: false }
    const persisted = store<PrimaryState>(),
      companionStore = store(state)
    const execute = vi.fn(async () => ({ sent: true }))
    const factory = (urls: string[]) => new DeviceTransport(urls)
    let primary = await PrimarySession.create(persisted, account, factory, execute)
    let companion = new CompanionSession(state, companionStore, factory, () => {})
    const info = inspectRequest(JSON.stringify(request))
    try {
      // QR scanning normally supplies this delay. Wait for a real subscription here.
      await new Promise((resolve) => setTimeout(resolve, 1200))
      await primary.approve(info, info.code)
      await vi.waitFor(() => expect(companion.grant).toBeDefined(), { timeout: 15000 })
      await companion.confirm(info.code)
      await companion.request('send', { peer: account.pubkey, text: 'encrypted synthetic ' + randomId() })
      expect(execute).toHaveBeenCalledTimes(1)
      companion.close()
      primary.close()
      primary = await PrimarySession.create(persisted, account, factory, execute)
      companion = new CompanionSession((await companionStore.load())!, companionStore, factory, () => {})
      await new Promise((resolve) => setTimeout(resolve, 1200))
      expect(await companion.request('chats', null)).toEqual({ sent: true })
      await primary.remove(request.pubkey)
      await vi.waitFor(() => expect(primary.list()[0].status).toBe('removed'))
      await vi.waitFor(
        async () => {
          await expect(companion.request('chats', null)).rejects.toThrow()
        },
        { timeout: 25000 }
      )
    } finally {
      primary.close()
      companion.close()
      account.dispose()
    }
  },
  90000
)
