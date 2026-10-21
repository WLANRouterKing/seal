// Singleton that holds the derived encryption key in memory
// Key is set on unlock and cleared on lock

interface EncryptionKeyState {
  key: CryptoKey | null
  salt: Uint8Array | null
}

let generation = 0
const clearListeners = new Set<() => void>()

export function getVaultGeneration(): number {
  return generation
}
export function onVaultCleared(listener: () => void): () => void {
  clearListeners.add(listener)
  return () => {
    clearListeners.delete(listener)
  }
}

const state: EncryptionKeyState = {
  key: null,
  salt: null,
}

export function setEncryptionKey(key: CryptoKey, salt: Uint8Array): void {
  generation++
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
  generation++
  state.key = null
  state.salt = null
  for (const listener of clearListeners) {
    try {
      listener()
    } catch (error) {
      console.error('Vault cleanup failed:', error)
    }
  }
}

export function isEncryptionUnlocked(): boolean {
  return state.key !== null
}
