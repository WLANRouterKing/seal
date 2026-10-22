// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { useLinkedAppStore as store } from './linkedAppStore'
import type { CompanionSession, CompanionState } from '../services/devices/session'
import type { LinkedVault } from '../services/devices/storage'
const peer = 'b'.repeat(64)
function owner(
  request = vi.fn(async (op: string) => (op === 'contacts' ? { contacts: [], blocked: [], expirations: {} } : []))
) {
  return {
    session: {
      state: { confirmed: true, account: 'a'.repeat(64) },
      setStatusHandler: vi.fn(),
      close: vi.fn(),
      request,
    } as unknown as CompanionSession,
    vault: { lock: vi.fn() } as unknown as LinkedVault<CompanionState>,
    release: vi.fn(),
  }
}
afterEach(() => store.getState().lock())
it('uses the existing account identity and clears all in-memory data and resources on lock', async () => {
  const device = owner()
  store.getState().activate(device)
  store.getState().setActiveChat(peer)
  await store.getState().refresh()
  expect(store.getState().account).toBe('a'.repeat(64))
  expect(store.getState().online).toBe(true)
  store.getState().lock()
  expect(store.getState().messages.size).toBe(0)
  expect(store.getState().account).toBe('')
  expect(device.session.close).toHaveBeenCalledOnce()
  expect(device.vault.lock).toHaveBeenCalledOnce()
  expect(device.release).toHaveBeenCalledOnce()
})
it('ignores a response arriving after lock', async () => {
  let resolve!: (value: never[]) => void
  const device = owner(
    vi.fn(
      () =>
        new Promise<never[]>((done) => {
          resolve = done
        })
    )
  )
  store.getState().activate(device)
  store.getState().lock()
  resolve([])
  await Promise.resolve()
  await Promise.resolve()
  expect(store.getState().active).toBe(false)
  expect(store.getState().online).toBe(false)
  expect(device.session.request).toHaveBeenCalledTimes(1)
})
it('refreshes after an action even when an older refresh is still running', async () => {
  let release!: (value: never[]) => void
  let first = true
  const request = vi.fn(async (op: string) => {
    if (op === 'chats' && first) {
      first = false
      return new Promise<never[]>((done) => {
        release = done
      })
    }
    return op === 'contacts' ? { contacts: [], blocked: [], expirations: {} } : []
  })
  store.getState().activate(owner(request))
  const send = store.getState().sendMessage(peer, 'hello')
  await Promise.resolve()
  release([])
  await send
  expect(request.mock.calls.filter(([op]) => op === 'chats')).toHaveLength(2)
  expect(store.getState().busy).toBe(false)
})
it('does not allow an unconfirmed session into the app', () => {
  const device = owner()
  device.session.state.confirmed = false
  expect(() => store.getState().activate(device)).toThrow('confirmation')
  expect(store.getState().active).toBe(false)
})
