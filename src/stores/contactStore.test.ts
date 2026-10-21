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

it('clears cached contacts on lock and discards an in-flight load', async () => {
  const { clearEncryptionKey } = await import('../services/encryptionKeyManager')
  const { getAllContacts } = await import('../services/db')
  let finish!: (contacts: (typeof contact)[]) => void
  vi.mocked(getAllContacts).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const pending = useContactStore.getState().initialize()
  clearEncryptionKey()
  expect(useContactStore.getState().contacts).toEqual([])
  finish([contact])
  await pending
  expect(useContactStore.getState().contacts).toEqual([])
})

it('discards a contact update completed after lock', async () => {
  const { clearEncryptionKey } = await import('../services/encryptionKeyManager')
  let finish!: () => void
  vi.mocked(saveContact).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const pending = useContactStore.getState().updateContact(contact.pubkey, { name: 'Updated' })
  clearEncryptionKey()
  finish()
  expect(await pending).toBe(false)
  expect(useContactStore.getState().contacts).toEqual([])
})
