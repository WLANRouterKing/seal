// @vitest-environment node
import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { biometricsService } from './biometrics'
import { generateMasterKey } from './masterKey'

const native = vi.hoisted(() => ({
  provider: 'android' as 'android' | 'ios' | 'desktop',
  availability: vi.fn(),
  enroll: vi.fn(),
  unlock: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('./nativeSecureUnlock', () => ({
  nativeUnlockProvider: () => native.provider,
  nativeUnlockBridge: () => native,
}))
const secret = new Uint8Array(32).fill(7)
const encoded = Buffer.from(secret).toString('base64')
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  vi.resetAllMocks()
  native.provider = 'android'
  native.availability.mockResolvedValue({ available: true, kind: 'biometric' })
  native.enroll.mockResolvedValue({ id: 'protected-id', secret: encoded })
  native.unlock.mockResolvedValue({ id: 'protected-id', secret: encoded })
  native.remove.mockResolvedValue(undefined)
})
describe('native authenticated key bridge', () => {
  it.each(['android', 'ios', 'desktop'] as const)('wraps and restores the same master key on %s', async (provider) => {
    native.provider = provider
    const master = generateMasterKey()
    const slot = await biometricsService.enroll(master)
    expect(slot.native).toEqual({ version: 1, provider, id: 'protected-id' })
    expect(JSON.stringify(slot)).not.toContain(encoded)
    expect(await biometricsService.unlock(slot)).toEqual(master)
    await biometricsService.removeSlot(slot)
    expect(native.remove).toHaveBeenCalledWith({ id: 'protected-id' })
  })
  it('rejects a slot copied from another platform', async () => {
    const slot = await biometricsService.enroll(generateMasterKey())
    native.provider = 'ios'
    expect(await biometricsService.unlock(slot)).toBeNull()
    expect(native.unlock).not.toHaveBeenCalled()
  })
  it('does not downgrade to WebAuthn/passwordless storage on native failure', async () => {
    native.enroll.mockRejectedValue(new Error('cancelled'))
    await expect(biometricsService.enroll(generateMasterKey())).rejects.toThrow('cancelled')
    expect(native.unlock).not.toHaveBeenCalled()
  })
  it('cleans up malformed enrollment output', async () => {
    native.enroll.mockResolvedValue({ id: 'bad', secret: 'AA==' })
    await expect(biometricsService.enroll(generateMasterKey())).rejects.toThrow()
    expect(native.remove).toHaveBeenCalledWith({ id: 'bad' })
  })
  it('rejects native output for a different key id', async () => {
    const slot = await biometricsService.enroll(generateMasterKey())
    native.unlock.mockResolvedValue({ id: 'other', secret: encoded })
    expect(await biometricsService.unlock(slot)).toBeNull()
  })
  it('reports unavailable rather than enabling an unprotected fallback', async () => {
    native.availability.mockRejectedValue(new Error('Missing native plugin'))
    expect((await biometricsService.checkAvailability()).available).toBe(false)
  })
})
