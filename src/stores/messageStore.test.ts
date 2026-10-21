// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { clearEncryptionKey } from '../services/encryptionKeyManager'
import { useMessageStore } from './messageStore'
import { relayPool } from '../services/relay'

vi.mock('../services/relay', () => ({
  relayPool: { getConnectedUrls: () => ['wss://example.com'], subscribe: vi.fn() },
}))
vi.mock('../services/notifications', () => ({ notificationService: {} }))
vi.mock('../services/fileUpload', () => ({ uploadFile: vi.fn(), compressImage: vi.fn() }))
vi.mock('./relayStore', () => ({ useRelayStore: {} }))

it('clears chat caches and closes the private-key subscription synchronously on lock', () => {
  const close = vi.fn()
  vi.mocked(relayPool.subscribe).mockReturnValue(close)
  useMessageStore.setState({ chats: [{ pubkey: 'alice', unreadCount: 1, updatedAt: 1 }], activeChat: 'alice' })
  const unsubscribe = useMessageStore.getState().subscribeToMessages('pubkey', 'private-key')
  clearEncryptionKey()
  expect(close).toHaveBeenCalledOnce()
  expect(useMessageStore.getState().messages.size).toBe(0)
  expect(useMessageStore.getState().chats).toEqual([])
  expect(useMessageStore.getState().activeChat).toBeNull()
  unsubscribe()
})
