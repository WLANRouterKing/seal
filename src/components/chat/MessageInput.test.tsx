import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import MessageInput from './MessageInput'
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../../hooks/useAudioRecorder', () => ({
  useAudioRecorder: () => [{}, {}],
  formatDuration: vi.fn(),
  audioToFile: vi.fn(),
}))
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  })
})
afterEach(cleanup)
it('keeps the draft after a failed send and clears it only after success', async () => {
  const send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
  render(
    <MantineProvider>
      <MessageInput onSend={send} />
    </MantineProvider>
  )
  const input = screen.getByRole('textbox')
  fireEvent.change(input, { target: { value: 'keep this message' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'devices.send' })))
  expect(input).toHaveValue('keep this message')
  expect(screen.getByRole('alert')).toHaveTextContent('devices.sendFailed')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'devices.send' })))
  expect(input).toHaveValue('')
  expect(document.querySelector('input[type=file]')).toBeNull()
})
it('prevents duplicate submissions while the relay request is pending', async () => {
  let finish!: () => void
  const send = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  render(
    <MantineProvider>
      <MessageInput onSend={send} />
    </MantineProvider>
  )
  const input = screen.getByRole('textbox')
  fireEvent.change(input, { target: { value: 'once' } })
  const button = screen.getByRole('button', { name: 'devices.send' })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(send).toHaveBeenCalledTimes(1)
  expect(button).toBeDisabled()
  await act(async () => finish())
  expect(input).toHaveValue('')
})
