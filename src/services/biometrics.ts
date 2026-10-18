import { Capacitor } from '@capacitor/core'
import { nativeUnlockProvider, nativeUnlockBridge } from './nativeSecureUnlock'
import { createPasskeySlot, unlockWithPasskeySlot, type KeySlot } from './masterKey'

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const decode = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
const random = () => crypto.getRandomValues(new Uint8Array(32))
const urlEncode = (bytes: Uint8Array) => encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** PRF output is used only in memory; credential IDs and salts are public metadata. */
class BiometricsService {
  isCompatibleSlot(slot: KeySlot): boolean {
    if (slot.type !== 'passkey') return false
    const provider = nativeUnlockProvider()
    return slot.native
      ? slot.native.version === 1 && slot.native.provider === provider
      : !provider && !Capacitor.isNativePlatform() && slot.prf?.version === 1
  }

  async checkAvailability() {
    if (nativeUnlockProvider()) {
      try {
        const result = await nativeUnlockBridge().availability()
        return {
          available: result.available,
          type:
            result.kind === 'passkey'
              ? ('webauthn' as const)
              : result.kind === 'face'
                ? ('face' as const)
                : ('fingerprint' as const),
          strongAuth: result.available,
        }
      } catch {
        return { available: false, type: 'none' as const, strongAuth: false }
      }
    }

    const available =
      !Capacitor.isNativePlatform() &&
      globalThis.isSecureContext === true &&
      typeof PublicKeyCredential !== 'undefined' &&
      !!navigator.credentials &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false))
    // Actual PRF support is checked during enrollment, never inferred from this probe.
    return { available, type: available ? ('webauthn' as const) : ('none' as const), strongAuth: available }
  }

  private async evaluate(credentialId: string, input: string): Promise<Uint8Array> {
    const challenge = random()
    const credential = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: decode(credentialId) }],
        userVerification: 'required',
        timeout: 60000,
        extensions: { prf: { eval: { first: decode(input) } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null
    if (!credential || encode(new Uint8Array(credential.rawId)) !== credentialId) throw new Error('Wrong credential')
    const response = credential.response as AuthenticatorAssertionResponse
    const client = JSON.parse(new TextDecoder().decode(response.clientDataJSON))
    const authData = new Uint8Array(response.authenticatorData)
    const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(location.hostname)))
    if (
      client.type !== 'webauthn.get' ||
      client.challenge !== urlEncode(challenge) ||
      client.origin !== location.origin ||
      client.crossOrigin === true ||
      authData.length < 37 ||
      (authData[32] & 5) !== 5 ||
      !rpHash.every((v, i) => authData[i] === v)
    ) {
      throw new Error('Invalid authenticator response')
    }
    const extensions = credential.getClientExtensionResults() as AuthenticationExtensionsClientOutputs & {
      prf?: { results?: { first?: ArrayBuffer } }
    }
    const result = extensions.prf?.results?.first
    if (!result || result.byteLength !== 32) throw new Error('PRF unavailable; use password')
    return new Uint8Array(result)
  }

  async enroll(masterKey: Uint8Array): Promise<KeySlot> {
    const provider = nativeUnlockProvider()
    if (provider) {
      const result = await nativeUnlockBridge().enroll()
      let secret = new Uint8Array()
      try {
        secret = decode(result.secret)
        if (secret.length !== 32 || !result.id || result.id.length > 8192) throw new Error('Invalid protected secret')
        return { ...(await createPasskeySlot(masterKey, secret)), native: { version: 1, provider, id: result.id } }
      } catch (error) {
        await nativeUnlockBridge()
          .remove({ id: result.id })
          .catch(() => {})
        throw error
      } finally {
        secret.fill(0)
      }
    }

    if (!(await this.checkAvailability()).available) throw new Error('Secure passkey unlock unavailable')
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: random(),
        rp: { name: 'Seal', id: location.hostname },
        user: { id: random(), name: 'Seal local vault', displayName: 'Seal local vault' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'required',
          userVerification: 'required',
        },
        attestation: 'none',
        timeout: 60000,
        extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null
    if (!credential) throw new Error('Enrollment cancelled')
    const credentialId = encode(new Uint8Array(credential.rawId))
    const input = encode(random())
    // Always test a separate authentication before persisting a slot, including on
    // browsers that do not return PRF results during credential creation.
    const secret = await this.evaluate(credentialId, input)
    try {
      return { ...(await createPasskeySlot(masterKey, secret)), prf: { version: 1, credentialId, input } }
    } finally {
      secret.fill(0)
    }
  }

  async unlock(slot: KeySlot): Promise<Uint8Array | null> {
    if (slot.native) {
      if (slot.native.version !== 1 || slot.native.provider !== nativeUnlockProvider()) return null
      const result = await nativeUnlockBridge().unlock({ id: slot.native.id })
      const secret = decode(result.secret)
      try {
        if (result.id !== slot.native.id || secret.length !== 32) return null
        return await unlockWithPasskeySlot(slot, secret)
      } finally {
        secret.fill(0)
      }
    }

    if (slot.prf?.version !== 1 || !(await this.checkAvailability()).available) return null
    const secret = await this.evaluate(slot.prf.credentialId, slot.prf.input)
    try {
      return await unlockWithPasskeySlot(slot, secret)
    } finally {
      secret.fill(0)
    }
  }

  async removeSlot(slot: KeySlot): Promise<void> {
    if (slot.native?.provider === nativeUnlockProvider()) {
      await nativeUnlockBridge().remove({ id: slot.native!.id })
    }
  }

  clearBiometricData(): void {
    localStorage.removeItem('seal_biometric_credential')
    localStorage.removeItem('seal_device_key')
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith('seal_bio_encrypted_')) localStorage.removeItem(key)
    }
  }
}
export const biometricsService = new BiometricsService()
