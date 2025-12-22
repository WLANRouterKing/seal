import { Relay, type Filter, type Event } from 'nostr-tools'
import type { Relay as RelayType } from '../types'

interface Subscription {
  close: () => void
}

interface RelayConnection {
  relay: Relay
  status: RelayType['status']
  subscriptions: Map<string, Subscription>
}

class RelayPool {
  private connections: Map<string, RelayConnection> = new Map()
  private listeners: Set<(relays: RelayType[]) => void> = new Set()

  async connect(url: string): Promise<boolean> {
    if (this.connections.has(url)) {
      return this.connections.get(url)!.status === 'connected'
    }

    try {
      this.updateConnection(url, { status: 'connecting' })
      const relay = await Relay.connect(url)

      this.connections.set(url, {
        relay,
        status: 'connected',
        subscriptions: new Map()
      })

      relay.onclose = () => {
        this.updateConnection(url, { status: 'disconnected' })
        this.scheduleReconnect(url)
      }

      this.notifyListeners()
      return true
    } catch (error) {
      console.error(`Failed to connect to ${url}:`, error)
      this.updateConnection(url, { status: 'error' })
      this.scheduleReconnect(url)
      return false
    }
  }

  private updateConnection(url: string, updates: Partial<RelayConnection>) {
    const existing = this.connections.get(url)
    if (existing) {
      Object.assign(existing, updates)
    } else {
      this.connections.set(url, {
        relay: null as unknown as Relay,
        status: updates.status || 'disconnected',
        subscriptions: new Map(),
        ...updates
      })
    }
    this.notifyListeners()
  }

  private scheduleReconnect(url: string, delay: number = 5000) {
    setTimeout(() => {
      const conn = this.connections.get(url)
      if (conn && conn.status !== 'connected') {
        this.connect(url)
      }
    }, delay)
  }

  disconnect(url: string): void {
    const conn = this.connections.get(url)
    if (conn) {
      conn.subscriptions.forEach((sub) => sub.close())
      if (conn.relay) {
        conn.relay.close()
      }
      this.connections.delete(url)
      this.notifyListeners()
    }
  }

  disconnectAll(): void {
    for (const url of this.connections.keys()) {
      this.disconnect(url)
    }
  }

  async reconnectAll(): Promise<void> {
    const urls = Array.from(this.connections.keys())
    console.log(`[RelayPool] Reconnecting to ${urls.length} relays...`)

    for (const url of urls) {
      const conn = this.connections.get(url)
      if (conn && conn.status !== 'connected') {
        // Clear the old connection to force a fresh reconnect
        if (conn.relay) {
          try {
            conn.relay.close()
          } catch (e) {
            // Ignore close errors
          }
        }
        this.connections.delete(url)
        await this.connect(url)
      }
    }
  }

  subscribe(
    urls: string[],
    filters: Filter[],
    onEvent: (event: Event) => void,
    onEose?: () => void
  ): () => void {
    const subId = crypto.randomUUID()
    const closers: Subscription[] = []
    let eoseCount = 0
    const expectedEose = urls.filter((url) => this.connections.get(url)?.status === 'connected').length

    for (const url of urls) {
      const conn = this.connections.get(url)
      if (conn?.status === 'connected' && conn.relay) {
        const sub = conn.relay.subscribe(filters, {
          onevent: onEvent,
          oneose: () => {
            eoseCount++
            if (eoseCount >= expectedEose && onEose) {
              onEose()
            }
          }
        })
        closers.push(sub)
        conn.subscriptions.set(subId, sub)
      }
    }

    return () => {
      closers.forEach((sub) => sub.close())
      for (const conn of this.connections.values()) {
        conn.subscriptions.delete(subId)
      }
    }
  }

  async publish(urls: string[], event: Event): Promise<{ successes: string[]; failures: string[] }> {
    const successes: string[] = []
    const failures: string[] = []

    await Promise.all(
      urls.map(async (url) => {
        const conn = this.connections.get(url)
        if (conn?.status === 'connected' && conn.relay) {
          try {
            await conn.relay.publish(event)
            successes.push(url)
          } catch (error) {
            console.error(`Failed to publish to ${url}:`, error)
            failures.push(url)
          }
        } else {
          failures.push(url)
        }
      })
    )

    return { successes, failures }
  }

  getStatus(): RelayType[] {
    return Array.from(this.connections.entries()).map(([url, conn]) => ({
      url,
      status: conn.status,
      read: true,
      write: true
    }))
  }

  getConnectedUrls(): string[] {
    return Array.from(this.connections.entries())
      .filter(([, conn]) => conn.status === 'connected')
      .map(([url]) => url)
  }

  onStatusChange(callback: (relays: RelayType[]) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  private notifyListeners(): void {
    const status = this.getStatus()
    this.listeners.forEach((cb) => cb(status))
  }
}

export const relayPool = new RelayPool()
