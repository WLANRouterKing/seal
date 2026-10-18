// @vitest-environment node
import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { biometricsService } from './biometrics'
import { generateMasterKey } from './masterKey'

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false }, registerPlugin: () => ({}) }))
const credentialId = new Uint8Array([1, 2, 3])
let secret: Uint8Array
let failure: string
const create = vi.fn(async () => ({ rawId: credentialId.buffer }))
const get = vi.fn(async ({ publicKey }: CredentialRequestOptions) => {
  const options = publicKey!
  const authData = new Uint8Array(37)
  authData.set(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('sealchat.app'))))
  authData[32] = failure === 'uv' ? 1 : 5
  const challenge = Buffer.from(options.challenge as ArrayBuffer).toString('base64url')
  return {
    rawId: failure === 'id' ? new Uint8Array([9]).buffer : credentialId.buffer,
    response: {
      authenticatorData: authData.buffer,
      clientDataJSON: new TextEncoder().encode(
        JSON.stringify({
          type: 'webauthn.get',
          challenge: failure === 'challenge' ? 'invalid' : challenge,
          origin: failure === 'origin' ? 'https://evil.example' : 'https://sealchat.app',
        })
      ).buffer,
    },
    getClientExtensionResults: () => (failure === 'prf' ? {} : { prf: { results: { first: secret.slice().buffer } } }),
  }
})
beforeEach(() => {
  failure = ''
  secret = new Uint8Array(32).fill(42)
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('location', { hostname: 'sealchat.app', origin: 'https://sealchat.app' })
  vi.stubGlobal('PublicKeyCredential', { isUserVerifyingPlatformAuthenticatorAvailable: async () => true })
  vi.stubGlobal('navigator', { credentials: { create, get } })
  vi.clearAllMocks()
})
describe('PRF-backed unlock', () => {
  it('wraps the master key and requires the same PRF secret to decrypt it', async () => {
    const master = generateMasterKey()
    const slot = await biometricsService.enroll(master)
    expect(await biometricsService.unlock(slot)).toEqual(master)
    expect(JSON.stringify(slot)).not.toContain(Buffer.from(secret).toString('base64'))
    expect(get.mock.calls[0][0].publicKey?.userVerification).toBe('required')
    secret.fill(43)
    expect(await biometricsService.unlock(slot)).toBeNull()
  })
  it.each(['prf', 'uv', 'origin', 'challenge', 'id'])('fails closed on %s failure', async (reason) => {
    failure = reason
    await expect(biometricsService.enroll(generateMasterKey())).rejects.toThrow()
  })
  it('does not fall back when the authenticator is cancelled', async () => {
    get.mockRejectedValueOnce(new Error('cancelled'))
    await expect(biometricsService.enroll(generateMasterKey())).rejects.toThrow('cancelled')
  })
  it('rejects insecure contexts and legacy slots', async () => {
    vi.stubGlobal('isSecureContext', false)
    expect((await biometricsService.checkAvailability()).available).toBe(false)
    expect(await biometricsService.unlock({ type: 'passkey', salt: '', wrappedKey: '' })).toBeNull()
  })
})
