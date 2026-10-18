// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { generateKeyPair } from './keys'
import { createInvitation, invitationFromHash, parseContactIdentity } from './invitations'

const keys = generateKeyPair()
describe('public contact invitations', () => {
  it('uses a fragment and never includes a private key', () => {
    const link = createInvitation(keys.npub)
    const url = new URL(link)
    expect(url.pathname).toBe('/contacts')
    expect(url.search).toBe('')
    expect(link).not.toContain(keys.nsec)
    expect(invitationFromHash(url.hash)).toBe(keys.npub)
    expect(parseContactIdentity(link)).toBe(keys.npub)
  })
  it('accepts an npub and a nostr public-key URI', () => {
    expect(parseContactIdentity(keys.npub)).toBe(keys.npub)
    expect(parseContactIdentity(`nostr:${keys.npub}`)).toBe(keys.npub)
  })
  it.each([
    keys.nsec,
    `nostr:${keys.nsec}`,
    `https://sealchat.app/contacts#invite=${keys.nsec}`,
    'npub1invalid',
    `https://evil.example/contacts#invite=${keys.npub}`,
    `https://sealchat.app.evil.example/contacts#invite=${keys.npub}`,
    `https://sealchat.app/contacts#invite=${keys.npub}&invite=${keys.npub}`,
    `https://sealchat.app/contacts?tracking=1#invite=${keys.npub}`,
    `https://user:password@sealchat.app/contacts#invite=${keys.npub}`,
  ])('rejects unsafe or invalid input %#', (input) => {
    expect(parseContactIdentity(input)).toBeNull()
  })
  it('does not create an invitation from a private key', () => {
    expect(() => createInvitation(keys.nsec)).toThrow()
  })
})
