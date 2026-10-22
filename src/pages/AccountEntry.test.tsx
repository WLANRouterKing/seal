import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AccountEntry from './AccountEntry'
const storage = vi.hoisted(() => ({ hasLinkedVault: vi.fn() }))
vi.mock('../services/devices/storage', () => storage)
vi.mock('./Onboarding', () => ({ default: () => <div>Create New Account</div> }))
vi.mock('./LinkDevice', () => ({ default: () => <div>Unlock linked device</div> }))
vi.mock('./Privacy', () => ({ default: () => <div>Privacy</div> }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@mantine/core', () => ({
  Center: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({ children, onClick }: { children: React.ReactNode; onClick(): void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Loader: () => <div>Checking</div>,
  Alert: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>,
}))
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})
for (const path of ['/', '/onboarding', '/settings']) {
  it(`offers a choice from ${path} and opens the linked vault only on request`, async () => {
    storage.hasLinkedVault.mockResolvedValue(true)
    render(
      <MemoryRouter initialEntries={[path]}>
        <AccountEntry inviteHash="" />
      </MemoryRouter>
    )
    const resume = await screen.findByRole('button', { name: 'devices.resume' })
    expect(screen.queryByText('Unlock linked device')).toBeNull()
    fireEvent.click(resume)
    expect(await screen.findByText('Unlock linked device')).toBeInTheDocument()
    expect(screen.queryByText('Create New Account')).toBeNull()
  })
}
it('does not briefly show onboarding while the vault lookup is pending', async () => {
  let resolve!: (exists: boolean) => void
  storage.hasLinkedVault.mockReturnValue(
    new Promise<boolean>((done) => {
      resolve = done
    })
  )
  render(
    <MemoryRouter>
      <AccountEntry inviteHash="" />
    </MemoryRouter>
  )
  expect(screen.queryByText('Create New Account')).toBeNull()
  await act(async () => resolve(true))
  expect(screen.getByRole('button', { name: 'devices.resume' })).toBeInTheDocument()
})
it('offers onboarding only for an installation without a linked vault', async () => {
  storage.hasLinkedVault.mockResolvedValue(false)
  render(
    <MemoryRouter>
      <AccountEntry inviteHash="" />
    </MemoryRouter>
  )
  expect(await screen.findByText('Create New Account')).toBeInTheDocument()
})
it('fails closed on storage errors rather than suggesting a new account', async () => {
  storage.hasLinkedVault.mockRejectedValue(new Error('Storage unavailable'))
  render(
    <MemoryRouter>
      <AccountEntry inviteHash="" />
    </MemoryRouter>
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('devices.storageFailed')
  expect(screen.queryByText('Create New Account')).toBeNull()
})

it('allows standalone account onboarding without deleting the existing link', async () => {
  storage.hasLinkedVault.mockResolvedValue(true)
  render(
    <MemoryRouter>
      <AccountEntry inviteHash="" />
    </MemoryRouter>
  )
  fireEvent.click(await screen.findByRole('button', { name: 'devices.useAccount' }))
  expect(screen.getByText('Create New Account')).toBeInTheDocument()
  cleanup()
  render(
    <MemoryRouter>
      <AccountEntry inviteHash="" />
    </MemoryRouter>
  )
  expect(await screen.findByRole('button', { name: 'devices.resume' })).toBeInTheDocument()
})
