// Singleton that holds the derived encryption key in memory
// Key is set on unlock and cleared on lock

interface EncryptionKeyState {
  key: CryptoKey | null
  salt: Uint8Array | null
}

const state: EncryptionKeyState = {
  key: null,
  salt: null,
}

export function setEncryptionKey(key: CryptoKey, salt: Uint8Array): void {
  state.key = key
  state.salt = salt
}

export function getEncryptionKey(): { key: CryptoKey; salt: Uint8Array } | null {
  if (state.key && state.salt) {
    return { key: state.key, salt: state.salt }
  }
  return null
}

export function clearEncryptionKey(): void {
  state.key = null
  state.salt = null
}

export function isEncryptionUnlocked(): boolean {
  return state.key !== null
}
