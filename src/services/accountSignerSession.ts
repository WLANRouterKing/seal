import { useAuthStore } from '../stores/authStore'
import { createLocalAccountSigner, type AccountSigner, type LocalAccountSigner } from './accountSigner'
import { getVaultGeneration, isEncryptionUnlocked, onVaultCleared } from './encryptionKeyManager'
import { nsecToPrivateKey } from './keys'

let current: LocalAccountSigner | undefined
let generation = -1
function clear() {
  current?.dispose()
  current = undefined
  generation = -1
}
onVaultCleared(clear)

/** Centralized legacy-key access. Chat components receive only capabilities. */
export function getAccountSigner(): AccountSigner | null {
  const { keys, isLocked, hasPassword } = useAuthStore.getState()
  if (!keys || isLocked || !hasPassword || !isEncryptionUnlocked()) {
    clear()
    return null
  }
  if (generation !== getVaultGeneration()) clear()
  if (!current) {
    const hex = nsecToPrivateKey(keys.nsec)
    if (!hex) return null
    const local = createLocalAccountSigner(hex)
    generation = getVaultGeneration()
    const issuedGeneration = generation
    const check = () => {
      if (issuedGeneration !== getVaultGeneration() || !isEncryptionUnlocked()) {
        local.dispose()
        throw new Error('Account signer locked')
      }
      local.assertActive()
    }
    current = {
      pubkey: local.pubkey,
      assertActive: check,
      dispose: () => local.dispose(),
      async signEvent(event) {
        check()
        const result = await local.signEvent(event)
        check()
        return result
      },
      async encrypt(peer, plaintext) {
        check()
        const result = await local.encrypt(peer, plaintext)
        check()
        return result
      },
      async decrypt(peer, ciphertext) {
        check()
        const result = await local.decrypt(peer, ciphertext)
        check()
        return result
      },
    }
  }
  return current
}
