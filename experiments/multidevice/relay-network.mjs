import { SimplePool } from 'nostr-tools/pool'
import { verifyEvent } from 'nostr-tools'

/** Real Nostr WebSocket transport; no in-memory event delivery or fallback. */
export class RelayNetwork {
  #pool = new SimplePool({ enableReconnect: true })
  #subscriptions = new Set()
  #offline = false
  published = []
  constructor(relays, timeout = 12000) {
    if (!relays.length || relays.some((url) => !/^wss?:\/\//.test(url))) throw new Error('Provide WebSocket relay URLs')
    this.relays = [...new Set(relays)]
    this.timeout = timeout
  }
  async #connection(url) {
    if (this.#offline) throw new Error('Device disconnected')
    const relay = await this.#pool.ensureRelay(url, { connectionTimeout: this.timeout })
    if (this.#offline) {
      relay.close()
      throw new Error('Device disconnected')
    }
    relay.publishTimeout = this.timeout
    return relay
  }
  async publish(relays, event) {
    this.beforePublish?.(event)
    if (!verifyEvent(JSON.parse(JSON.stringify(event)))) throw new Error('Invalid outgoing signature')
    const results = await Promise.all(
      relays.map(async (from) => {
        try {
          const relay = await this.#connection(from)
          const message = await relay.publish(event)
          return [from, { from, ok: true, message }]
        } catch (error) {
          return [from, { from, ok: false, message: error.message }]
        }
      })
    )
    if (!results.some(([, result]) => result.ok))
      throw new Error('Relay rejected publication: ' + results.map(([, r]) => r.message).join('; '))
    this.published.push({ id: event.id, kind: event.kind })
    return Object.fromEntries(results)
  }
  async request(relays, filters) {
    const results = await Promise.allSettled(
      relays.map(async (url) => {
        const relay = await this.#connection(url)
        return new Promise((resolve, reject) => {
          const events = new Map()
          let done = false,
            subscription
          const finish = (error) => {
            if (done) return
            done = true
            clearTimeout(timer)
            subscription?.close()
            if (error) reject(error)
            else resolve([...events.values()])
          }
          const timer = setTimeout(() => finish(new Error('Relay query timeout: ' + url)), this.timeout)
          subscription = relay.subscribe(Array.isArray(filters) ? filters : [filters], {
            eoseTimeout: this.timeout + 1000,
            onevent: (event) => events.set(event.id, event),
            oneose: () => finish(),
            onclose: (reason) => finish(new Error('Relay closed query: ' + reason)),
          })
        })
      })
    )
    const ok = results.filter((r) => r.status === 'fulfilled')
    if (!ok.length) throw new Error('No relay query succeeded: ' + results.map((r) => r.reason?.message).join('; '))
    return [...new Map(ok.flatMap((r) => r.value).map((e) => [e.id, e])).values()]
  }
  subscription(relays, filters) {
    return {
      subscribe: (observer) => {
        let stopped = false
        const subscriptions = []
        const seen = new Set()
        const handle = {
          unsubscribe: () => {
            stopped = true
            subscriptions.forEach((s) => s.close())
            this.#subscriptions.delete(handle)
          },
        }
        this.#subscriptions.add(handle)
        for (const url of relays) {
          this.#connection(url)
            .then((relay) => {
              if (stopped) return
              subscriptions.push(
                relay.subscribe(Array.isArray(filters) ? filters : [filters], {
                  onevent: (event) => {
                    if (!stopped && !seen.has(event.id)) {
                      seen.add(event.id)
                      observer.next?.(event)
                    }
                  },
                  onclose: (reason) => {
                    if (!stopped) observer.error?.(new Error('Relay subscription closed: ' + reason))
                  },
                })
              )
            })
            .catch((error) => {
              if (!stopped) observer.error?.(error)
            })
        }
        return handle
      },
    }
  }
  async getUserInboxRelays(pubkey) {
    const lists = await this.request(this.relays, { kinds: [10050], authors: [pubkey], limit: 1 })
    const latest = lists.sort((a, b) => b.created_at - a.created_at)[0]
    const relays = latest?.tags.filter((t) => t[0] === 'relay' && /^wss?:\/\//.test(t[1])).map((t) => t[1])
    if (!relays?.length) throw new Error('No signed inbox relay list for account')
    return relays
  }
  disconnect() {
    this.#offline = true
    for (const sub of [...this.#subscriptions]) sub.unsubscribe()
    this.#pool.destroy()
  }
  reconnect() {
    this.#pool = new SimplePool({ enableReconnect: true })
    this.#offline = false
  }
}
