import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter, useLocation } from 'react-router-dom'
import Onboarding from './Onboarding'

const auth = vi.hoisted(() => ({ importKeys: vi.fn(), isLoading: false, error: null, clearError: vi.fn() }))
vi.mock('../stores/authStore', () => ({ useAuthStore: () => auth }))
vi.mock('../services/keys', () => ({
  generateKeyPair: () => ({ nsec: 'test-only-private-key', npub: 'test-only-public-key' }),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

function Location() {
  return (
    <output data-testid="location">
      {useLocation().pathname}
      {useLocation().hash}
    </output>
  )
}
beforeEach(() => {
  cleanup()
  auth.importKeys.mockReset().mockResolvedValue(true)
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi
      .fn()
      .mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  })
})
it('requires backup confirmation before persisting a new identity and keeps the invitation', async () => {
  render(
    <MantineProvider>
      <MemoryRouter initialEntries={['/onboarding#invite=npub-pending']}>
        <Onboarding />
        <Location />
      </MemoryRouter>
    </MantineProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.createAccount' }))
  expect(auth.importKeys).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'backup.continueButton' })).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'backup.continueButton' }))
  await waitFor(() => expect(auth.importKeys).toHaveBeenCalledWith('test-only-private-key'))
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/contacts#invite=npub-pending'))
})
