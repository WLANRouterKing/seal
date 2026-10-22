import { SimplePool, type Event } from 'nostr-tools'
import { DEVICE_KIND, relayURLs } from './protocol'
export class DeviceTransport {
  private pool = new SimplePool({ enableReconnect: true })
  private closed = false
  readonly relays: string[]
  constructor(relays: string[]) {
    this.relays = relayURLs(relays)
  }
  listen(recipient: string, receive: (event: Event) => void) {
    const subscription = this.pool.subscribeMany(
      this.relays,
      { kinds: [DEVICE_KIND], '#p': [recipient], since: Math.floor(Date.now() / 1000) - 90 },
      { onevent: receive }
    )
    return () => subscription.close()
  }
  async publish(event: Event) {
    if (this.closed) throw new Error('Device transport closed')
    await Promise.any(this.pool.publish(this.relays, event))
    if (this.closed) throw new Error('Device transport closed')
  }
  close() {
    this.closed = true
    this.pool.destroy()
  }
}

// A single owner prevents concurrent sequence allocation and stale roster writes.
export async function exclusiveDeviceSession(name: string): Promise<() => void> {
  if (!navigator.locks) throw new Error('This platform needs Web Locks support for device linking')
  return new Promise((resolve, reject) => {
    navigator.locks
      .request('seal-devices:' + name, { ifAvailable: true }, (lock) => {
        if (!lock) {
          reject(new Error('Device linking is already open in another tab'))
          return
        }
        return new Promise<void>((release) => resolve(release))
      })
      .catch(reject)
  })
}
