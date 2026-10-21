// Experimental local-only pairing envelope. Not a Nostr interoperability spec.
// Uses signed Nostr events and NIP-44; never publish these envelopes to relays.
import { finalizeEvent, generateSecretKey, getPublicKey, nip44, verifyEvent } from 'nostr-tools'
const now = () => Math.floor(Date.now() / 1000)
const randomId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) => x.toString(16).padStart(2, '0')).join('')
const hex = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s)
const copy = (value) => JSON.parse(JSON.stringify(value))
const marker = 'seal-experimental-device-link-v1'
const maxAge = 300

export function inspectRequest(input, clock = now()) {
  const request = copy(input)
  if (JSON.stringify(request).length > 4096 || request.kind !== 30078 || !verifyEvent(request))
    throw new Error('Invalid pairing request')
  if (JSON.stringify(request.tags) !== JSON.stringify([['d', marker]])) throw new Error('Invalid pairing scope')
  const body = JSON.parse(request.content)
  if (
    Object.keys(body).sort().join() !== 'account,deviceId,expires,session' ||
    !hex(body.account) ||
    !hex(body.deviceId) ||
    !hex(body.session)
  )
    throw new Error('Invalid pairing identity')
  if (
    !Number.isInteger(body.expires) ||
    body.expires !== request.created_at + maxAge ||
    request.created_at > clock + 30 ||
    body.expires <= clock
  )
    throw new Error('Pairing expired')
  return { request, ...body, confirmation: request.id.slice(0, 24).match(/.{4}/g).join('-') }
}

export function createPairingRequest(account, deviceId, clock = now()) {
  if (!hex(account) || !hex(deviceId)) throw new Error('Invalid pairing identity')
  const secret = generateSecretKey()
  const request = finalizeEvent(
    {
      kind: 30078,
      created_at: clock,
      tags: [['d', marker]],
      content: JSON.stringify({ account, deviceId, session: randomId(), expires: clock + maxAge }),
    },
    secret
  )
  let consumed = false
  const info = inspectRequest(request, clock)
  return {
    request: copy(request),
    confirmation: info.confirmation,
    cancel() {
      consumed = true
      secret.fill(0)
    },
    async accept(input, confirmation, currentTime = now()) {
      if (consumed) throw new Error('Pairing already consumed')
      inspectRequest(request, currentTime)
      if (confirmation !== info.confirmation) throw new Error('Confirm both device codes first')
      const response = copy(input)
      if (
        JSON.stringify(response).length > 2_000_000 ||
        !verifyEvent(response) ||
        response.pubkey !== account ||
        response.kind !== 30078 ||
        JSON.stringify(response.tags) !==
          JSON.stringify([
            ['d', marker],
            ['e', request.id],
            ['p', getPublicKey(secret)],
          ])
      )
        throw new Error('Untrusted pairing response')
      consumed = true
      let key
      try {
        key = nip44.v2.utils.getConversationKey(secret, account)
        const payload = JSON.parse(nip44.v2.decrypt(response.content, key))
        if (payload.requestId !== request.id || payload.deviceId !== deviceId)
          throw new Error('Pairing binding mismatch')
        return payload.bundle
      } finally {
        secret.fill(0)
        key?.fill(0)
      }
    },
  }
}

export async function approvePairing(input, accountSigner, bundle, confirmation, clock = now()) {
  const info = inspectRequest(input, clock)
  if (info.account !== (await accountSigner.getPublicKey())) throw new Error('Wrong account')
  if (confirmation !== info.confirmation) throw new Error('Confirm both device codes first')
  const content = await accountSigner.nip44.encrypt(
    info.request.pubkey,
    JSON.stringify({ requestId: info.request.id, deviceId: info.deviceId, bundle })
  )
  // A local signing template only; no relay publication.
  return accountSigner.signEvent({
    kind: 30078,
    created_at: clock,
    tags: [
      ['d', marker],
      ['e', info.request.id],
      ['p', info.request.pubkey],
    ],
    content,
  })
}
