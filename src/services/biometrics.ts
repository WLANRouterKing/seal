import { Capacitor } from '@capacitor/core'
import {
  BiometricAuth,
  BiometryType,
} from '@aparajita/capacitor-biometric-auth'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

interface BiometricsState {
  available: boolean
  type: 'none' | 'fingerprint' | 'face' | 'iris' | 'webauthn'
  strongAuth: boolean
}

interface StoredCredential {
  credentialId: string
  publicKey: string
}

const CREDENTIAL_KEY = 'seal_biometric_credential'
const ENCRYPTED_KEY_PREFIX = 'seal_bio_encrypted_'

class BiometricsService {
  /**
   * Check if biometrics are available on this device/browser
   */
  async checkAvailability(): Promise<BiometricsState> {
    if (Capacitor.isNativePlatform()) {
      return this.checkNativeBiometrics()
    } else {
      return this.checkWebAuthnPRF()
    }
  }

  /**
   * Check native biometrics (Android/iOS)
   */
  private async checkNativeBiometrics(): Promise<BiometricsState> {
    try {
      const result = await BiometricAuth.checkBiometry()

      if (!result.isAvailable) {
        return { available: false, type: 'none', strongAuth: false }
      }

      let type: BiometricsState['type'] = 'fingerprint'
      if (result.biometryType === BiometryType.faceAuthentication ||
          result.biometryType === BiometryType.faceId) {
        type = 'face'
      } else if (result.biometryType === BiometryType.irisAuthentication) {
        type = 'iris'
      }

      return {
        available: true,
        type,
        strongAuth: result.strongBiometryIsAvailable ?? true
      }
    } catch (error) {
      console.error('Failed to check native biometrics:', error)
      return { available: false, type: 'none', strongAuth: false }
    }
  }

  /**
   * Check WebAuthn PRF support (desktop browsers)
   */
  private async checkWebAuthnPRF(): Promise<BiometricsState> {
    if (!window.PublicKeyCredential) {
      return { available: false, type: 'none', strongAuth: false }
    }

    try {
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      if (!available) {
        return { available: false, type: 'none', strongAuth: false }
      }

      return { available: true, type: 'webauthn', strongAuth: true }
    } catch (error) {
      console.error('Failed to check WebAuthn:', error)
      return { available: false, type: 'none', strongAuth: false }
    }
  }

  /**
   * Authenticate with biometrics and get/derive encryption key
   */
  async authenticate(reason: string): Promise<Uint8Array | null> {
    if (Capacitor.isNativePlatform()) {
      return this.authenticateNative(reason)
    } else {
      return this.authenticateWebAuthn()
    }
  }

  /**
   * Native biometric authentication
   */
  private async authenticateNative(reason: string): Promise<Uint8Array | null> {
    try {
      await BiometricAuth.authenticate({
        reason,
        allowDeviceCredential: true,
        cancelTitle: 'Cancel'
      })

      const deviceKey = await this.getOrCreateDeviceKey()
      return deviceKey
    } catch (error) {
      console.error('Native biometric auth failed:', error)
      return null
    }
  }

  /**
   * WebAuthn authentication
   */
  private async authenticateWebAuthn(): Promise<Uint8Array | null> {
    try {
      const storedCred = this.getStoredCredential()

      if (!storedCred) {
        return this.registerWebAuthn()
      }

      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{
            id: this.base64ToArrayBuffer(storedCred.credentialId),
            type: 'public-key'
          }],
          userVerification: 'required',
        }
      }) as PublicKeyCredential | null

      if (!credential) {
        return null
      }

      return this.deriveKeyFromCredential(credential.rawId)
    } catch (error) {
      console.error('WebAuthn auth failed:', error)
      return null
    }
  }

  /**
   * Register a new WebAuthn credential
   */
  private async registerWebAuthn(): Promise<Uint8Array | null> {
    try {
      const userId = crypto.getRandomValues(new Uint8Array(16))

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: {
            name: 'Seal',
            id: window.location.hostname
          },
          user: {
            id: userId,
            name: 'Seal User',
            displayName: 'Seal User'
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 }
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred'
          },
        }
      }) as PublicKeyCredential | null

      if (!credential) {
        return null
      }

      const response = credential.response as AuthenticatorAttestationResponse
      const publicKey = response.getPublicKey()

      const storedCred: StoredCredential = {
        credentialId: this.arrayBufferToBase64(credential.rawId),
        publicKey: publicKey ? this.arrayBufferToBase64(publicKey) : ''
      }
      localStorage.setItem(CREDENTIAL_KEY, JSON.stringify(storedCred))

      return this.deriveKeyFromCredential(credential.rawId)
    } catch (error) {
      console.error('WebAuthn registration failed:', error)
      return null
    }
  }

  /**
   * Derive encryption key from credential ID
   */
  private async deriveKeyFromCredential(credentialId: ArrayBuffer): Promise<Uint8Array> {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(credentialId),
      'HKDF',
      false,
      ['deriveBits']
    )

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        salt: encoder.encode('seal-biometric-key'),
        info: encoder.encode('encryption'),
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    )

    return new Uint8Array(derivedBits)
  }

  /**
   * Get or create a device-bound key for native platforms
   */
  private async getOrCreateDeviceKey(): Promise<Uint8Array> {
    const stored = localStorage.getItem('seal_device_key')
    if (stored) {
      return this.base64ToUint8Array(stored)
    }

    const key = crypto.getRandomValues(new Uint8Array(32))
    localStorage.setItem('seal_device_key', this.uint8ArrayToBase64(key))
    return key
  }

  /**
   * Encrypt data with biometric-protected key
   */
  async encrypt(data: string, key: Uint8Array): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const keyBuffer = new Uint8Array(key).buffer
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      'AES-GCM',
      false,
      ['encrypt']
    )

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      encoder.encode(data)
    )

    const combined = new Uint8Array(iv.length + encrypted.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(encrypted), iv.length)

    return this.uint8ArrayToBase64(combined)
  }

  /**
   * Decrypt data with biometric-protected key
   */
  async decrypt(encryptedData: string, key: Uint8Array): Promise<string | null> {
    try {
      const combined = this.base64ToUint8Array(encryptedData)
      const iv = combined.slice(0, 12)
      const ciphertext = combined.slice(12)

      const keyBuffer = new Uint8Array(key).buffer
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        'AES-GCM',
        false,
        ['decrypt']
      )

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        ciphertext
      )

      return decoder.decode(decrypted)
    } catch (error) {
      console.error('Decryption failed:', error)
      return null
    }
  }

  /**
   * Store encrypted key with biometrics
   */
  async storeEncryptedKey(keyId: string, nsec: string, biometricKey: Uint8Array): Promise<boolean> {
    try {
      const encrypted = await this.encrypt(nsec, biometricKey)
      localStorage.setItem(ENCRYPTED_KEY_PREFIX + keyId, encrypted)
      return true
    } catch (error) {
      console.error('Failed to store encrypted key:', error)
      return false
    }
  }

  /**
   * Retrieve and decrypt key with biometrics
   */
  async retrieveEncryptedKey(keyId: string, biometricKey: Uint8Array): Promise<string | null> {
    const encrypted = localStorage.getItem(ENCRYPTED_KEY_PREFIX + keyId)
    if (!encrypted) {
      return null
    }

    return this.decrypt(encrypted, biometricKey)
  }

  /**
   * Check if biometric-protected key exists
   */
  hasBiometricKey(keyId: string): boolean {
    return localStorage.getItem(ENCRYPTED_KEY_PREFIX + keyId) !== null
  }

  /**
   * Remove biometric credential and encrypted keys
   */
  clearBiometricData(): void {
    localStorage.removeItem(CREDENTIAL_KEY)
    localStorage.removeItem('seal_device_key')

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith(ENCRYPTED_KEY_PREFIX)) {
        localStorage.removeItem(key)
      }
    }
  }

  private getStoredCredential(): StoredCredential | null {
    const stored = localStorage.getItem(CREDENTIAL_KEY)
    return stored ? JSON.parse(stored) : null
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  }

  private uint8ArrayToBase64(array: Uint8Array): string {
    return btoa(String.fromCharCode(...array))
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }
}

export const biometricsService = new BiometricsService()