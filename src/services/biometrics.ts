/**
 * Biometric unlock is disabled until keys are protected by WebAuthn PRF or
 * OS-backed authenticated key operations. Credential IDs and localStorage
 * values must never be treated as biometric secrets.
 */
class BiometricsService {
  async checkAvailability(): Promise<{
    available: boolean
    type: 'none'
    strongAuth: boolean
  }> {
    return { available: false, type: 'none', strongAuth: false }
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
