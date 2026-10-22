import { publishDirectory } from './independent'
import { getAccountSigner } from '../accountSignerSession'
import { onVaultCleared } from '../encryptionKeyManager'
import { primaryStore } from './storage'
import { DeviceTransport, exclusiveDeviceSession } from './transport'
import { PrimarySession, type PrimaryState } from './session'

let current: PrimarySession | undefined
let starting: Promise<PrimarySession> | undefined
let release: (() => void) | undefined
let generation = 0
const listeners = new Set<() => void>()
export const onDevicesChanged = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const changed = () => listeners.forEach((fn) => fn())
async function execute(): Promise<never> {
  throw new Error('Primary-mediated chat is disabled. Update Seal and link the device again.')
}
export async function getPrimarySession(): Promise<PrimarySession> {
  if (current) return current
  if (starting) return starting
  const signer = getAccountSigner()
  if (!signer) throw new Error('Unlock the primary device first')
  const issued = generation
  starting = (async () => {
    const unlock = await exclusiveDeviceSession('primary:' + signer.pubkey)
    try {
      if (issued !== generation) throw new Error('Primary device locked')
      const session = await PrimarySession.create(
        primaryStore<PrimaryState>(signer.pubkey),
        signer,
        (urls) => new DeviceTransport(urls),
        execute,
        changed,
        async (state) => {
          const devices = state.devices
            .filter((device) => device.status === 'linked')
            .map((device) => device.pubkey)
            .sort()
          if (
            state.directory &&
            JSON.stringify(JSON.parse(state.directory.content).devices) === JSON.stringify(devices)
          )
            return state.directory
          return publishDirectory(signer, devices, state.directory)
        }
      )
      if (issued !== generation) {
        session.close()
        throw new Error('Primary device locked')
      }
      release = unlock
      current = session
      return session
    } catch (error) {
      unlock()
      throw error
    }
  })()
  const pending = starting
  try {
    return await pending
  } finally {
    if (starting === pending) starting = undefined
  }
}
export function stopPrimarySession() {
  generation++
  starting = undefined
  current?.close()
  current = undefined
  release?.()
  release = undefined
  changed()
}
onVaultCleared(stopPrimarySession)
