// Test instrumentation only. Keeps copies of known generated secrets so the
// regression test can detect raw/hex/base64/JSON-array leakage before sending.
// This is not a proof against arbitrary encodings or a production DLP system.
import { Buffer } from 'node:buffer'
export class WireSecretGuard {
  #secrets = new Map()
  checked = 0
  get size() {
    return this.#secrets.size
  }
  add(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 16) return
    const copy = Buffer.from(bytes)
    this.#secrets.set(copy.toString('hex'), copy)
  }
  addTree(value) {
    if (value instanceof Uint8Array) this.add(value)
    else if (value instanceof Map) for (const child of value.values()) this.addTree(child)
    else if (value && typeof value === 'object') for (const child of Object.values(value)) this.addTree(child)
  }
  observeState(state) {
    this.add(state.signaturePrivateKey)
    this.addTree(state.keySchedule)
    this.addTree(state.privatePath?.privateKeys)
    this.addTree(state.secretTree)
  }
  assertSafe(event) {
    if (![10050, 30443, 1059, 445, 5].includes(event.kind))
      throw new Error('Unexpected event kind on encrypted test transport')
    const json = JSON.stringify(event)
    const buffers = [Buffer.from(json), Buffer.from(event.content || '', 'base64')]
    for (const [hex, secret] of this.#secrets) {
      if (
        json.includes(hex) ||
        json.includes(secret.toString('base64')) ||
        json.includes(JSON.stringify([...secret])) ||
        buffers.some((bytes) => bytes.includes(secret))
      ) {
        throw new Error('Secret material detected in outgoing relay event; blocked')
      }
    }
    this.checked++
  }
  clear() {
    for (const bytes of this.#secrets.values()) bytes.fill(0)
    this.#secrets.clear()
  }
}
