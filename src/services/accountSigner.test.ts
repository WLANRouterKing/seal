// @vitest-environment node
import { expect, it } from 'vitest'
import { verifyEvent } from 'nostr-tools'
import { createLocalAccountSigner } from './accountSigner'
import { createGiftWrap } from './crypto'

it('signs and encrypts without exposing private key material', async () => {
  const alice = createLocalAccountSigner('01'.repeat(32))
  const bob = createLocalAccountSigner('02'.repeat(32))
  const encrypted = await alice.encrypt(bob.pubkey, 'secret')
  expect(await bob.decrypt(alice.pubkey, encrypted)).toBe('secret')
  const signed = await alice.signEvent({ kind: 1, created_at: 1, tags: [], content: 'public' })
  expect(verifyEvent(signed)).toBe(true)
  expect(Object.keys(alice).sort()).toEqual(['assertActive', 'decrypt', 'dispose', 'encrypt', 'pubkey', 'signEvent'])
  alice.dispose()
  await expect(alice.encrypt(bob.pubkey, 'secret')).rejects.toThrow('locked')
  await expect(alice.decrypt(bob.pubkey, encrypted)).rejects.toThrow('locked')
  await expect(alice.signEvent({ kind: 1, created_at: 1, tags: [], content: '' })).rejects.toThrow('locked')
})

it('does not return a gift wrap if signing access is revoked during encryption', async () => {
  const local = createLocalAccountSigner('03'.repeat(32))
  const signer = {
    ...local,
    async encrypt(peer: string, plaintext: string) {
      const value = await local.encrypt(peer, plaintext)
      local.dispose()
      return value
    },
  }
  await expect(createGiftWrap('secret', signer.pubkey, signer)).rejects.toThrow('locked')
})
