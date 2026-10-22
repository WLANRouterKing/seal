// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { nip19, getPublicKey } from 'nostr-tools'
import { getAccountSigner } from './accountSignerSession'
import { clearEncryptionKey, setEncryptionKey } from './encryptionKeyManager'
const auth = vi.hoisted(() => ({
  state: { keys: null as null | { nsec: string; npub: string }, isLocked: false, hasPassword: true },
}))
vi.mock('../stores/authStore', () => ({ useAuthStore: { getState: () => auth.state } }))
async function unlock() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  setEncryptionKey(key, new Uint8Array(16))
  const secret = new Uint8Array(32).fill(1)
  auth.state = {
    keys: { nsec: nip19.nsecEncode(secret), npub: nip19.npubEncode(getPublicKey(secret)) },
    isLocked: false,
    hasPassword: true,
  }
}
beforeEach(() => {
  clearEncryptionKey()
  auth.state.keys = null
})
it('reuses a signer while unlocked and revokes existing references synchronously on lock', async () => {
  await unlock()
  const signer = getAccountSigner()!
  expect(getAccountSigner()).toBe(signer)
  clearEncryptionKey()
  expect(getAccountSigner()).toBeNull()
  expect(() => signer.assertActive()).toThrow('locked')
  await expect(signer.encrypt(signer.pubkey, 'secret')).rejects.toThrow('locked')
})
it('does not let an older signer survive replacement of the vault key', async () => {
  await unlock()
  const old = getAccountSigner()!
  await unlock()
  expect(() => old.assertActive()).toThrow('locked')
  expect(getAccountSigner()).not.toBe(old)
})
it('does not expose a signer during password setup or locked auth state', async () => {
  await unlock()
  auth.state.hasPassword = false
  expect(getAccountSigner()).toBeNull()
  auth.state.hasPassword = true
  auth.state.isLocked = true
  expect(getAccountSigner()).toBeNull()
})
