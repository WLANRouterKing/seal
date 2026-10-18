// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { useContactStore } from './contactStore'
import { saveContact } from '../services/db'

vi.mock('../services/db', () => ({ saveContact: vi.fn(), getAllContacts: vi.fn(), deleteContact: vi.fn() }))
vi.mock('../services/relay', () => ({ relayPool: { getConnectedUrls: () => [] } }))
const contact = { pubkey: 'a'.repeat(64), npub: 'npub-original', name: 'Alice', createdAt: 1 }
beforeEach(() => {
  vi.resetAllMocks()
  useContactStore.setState({ contacts: [contact] })
})
it('does not transfer a verification to a different public identity through updateContact', async () => {
  expect(
    await useContactStore
      .getState()
      .updateContact(contact.pubkey, { pubkey: 'b'.repeat(64), npub: 'npub-substitute', verifiedAt: 10 })
  ).toBe(true)
  expect(useContactStore.getState().contacts[0]).toMatchObject({
    pubkey: contact.pubkey,
    npub: contact.npub,
    verifiedAt: 10,
  })
})
it('does not mark a contact verified if persistence fails while locked', async () => {
  vi.mocked(saveContact).mockRejectedValueOnce(new Error('Database is locked'))
  expect(await useContactStore.getState().updateContact(contact.pubkey, { verifiedAt: 10 })).toBe(false)
  expect(useContactStore.getState().contacts[0].verifiedAt).toBeUndefined()
})
