import { beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import type { Contact } from '../../types'
import ChatContactActions from './ChatContactActions'

const stores = vi.hoisted(() => ({
  contacts: [] as Contact[],
  blockedContacts: [] as Contact[],
  addContact: vi.fn(),
  addBlockedContact: vi.fn(),
  removeBlockedContact: vi.fn(),
}))
vi.mock('../../stores/contactStore', () => ({ useContactStore: () => stores }))
vi.mock('../../stores/blockedContactStore', () => ({
  useBlockedContactStore: Object.assign(() => stores, { getState: () => stores }),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
const pubkey = 'a'.repeat(64)
const contact = { pubkey, npub: 'npub-test', createdAt: 1 }
const view = (key = pubkey) => (
  <MantineProvider>
    <ChatContactActions key={key} pubkey={key} onDeleteChat={vi.fn()} />
  </MantineProvider>
)
beforeEach(() => {
  cleanup()
  stores.contacts = []
  stores.blockedContacts = []
  stores.addContact.mockReset().mockResolvedValue(contact)
  stores.addBlockedContact.mockReset().mockResolvedValue(contact)
  stores.removeBlockedContact.mockReset().mockImplementation(async () => {
    stores.blockedContacts = []
  })
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  })
})
it('adds an unknown sender with the exact chat identity and optional name', async () => {
  render(view())
  fireEvent.click(screen.getByRole('button', { name: 'contacts.addContact' }))
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('contacts.nameLabel'), { target: { value: ' Alice ' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'contacts.addContact' }))
  await waitFor(() => expect(stores.addContact).toHaveBeenCalledWith(pubkey, 'Alice'))
  expect(stores.addBlockedContact).not.toHaveBeenCalled()
})
it('blocks an unknown sender without adding them as a contact', async () => {
  render(view())
  fireEvent.click(screen.getByRole('button', { name: 'chat.actions' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: 'contacts.blockContact' }))
  const dialog = await screen.findByRole('dialog')
  expect(stores.addBlockedContact).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'contacts.blockContact' }))
  await waitFor(() => expect(stores.addBlockedContact).toHaveBeenCalledWith(pubkey, undefined))
  expect(stores.addContact).not.toHaveBeenCalled()
})
it('offers unblock for an existing blocked contact', async () => {
  stores.contacts = [contact]
  stores.blockedContacts = [contact]
  render(view())
  expect(screen.queryByRole('button', { name: 'contacts.addContact' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'chat.actions' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: 'contacts.unblockContact' }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'contacts.unblockContact' }))
  await waitFor(() => expect(stores.removeBlockedContact).toHaveBeenCalledWith(pubkey))
})
it('keeps failed writes visible instead of pretending the sender was blocked', async () => {
  stores.addBlockedContact.mockResolvedValue(null)
  render(view())
  fireEvent.click(screen.getByRole('button', { name: 'chat.actions' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: 'contacts.blockContact' }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'contacts.blockContact' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('chat.contactActionFailed')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})
it('closes the sender dialog when switching to another chat', async () => {
  const rendered = render(view())
  fireEvent.click(screen.getByRole('button', { name: 'contacts.addContact' }))
  await screen.findByRole('dialog')
  rendered.rerender(view('b'.repeat(64)))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(stores.addContact).not.toHaveBeenCalled()
})
