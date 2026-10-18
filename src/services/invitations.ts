import { isValidNpub, pubkeyToNpub } from './keys'

/** Only public identities are accepted. Never accept nsec or arbitrary URLs. */
export function parseContactIdentity(input: string): string | null {
  let value = input.trim()
  if (value.length > 2048) return null
  if (value.startsWith('https://')) {
    try {
      const url = new URL(value)
      if (
        url.origin !== 'https://sealchat.app' ||
        url.pathname !== '/contacts' ||
        url.search ||
        url.username ||
        url.password
      )
        return null
      const params = new URLSearchParams(url.hash.slice(1))
      if (params.getAll('invite').length !== 1 || [...params.keys()].some((key) => key !== 'invite')) return null
      value = params.get('invite') || ''
    } catch {
      return null
    }
  }
  if (value.startsWith('nostr:')) value = value.slice(6)
  if (isValidNpub(value)) return value
  if (/^[0-9a-f]{64}$/i.test(value)) return pubkeyToNpub(value.toLowerCase())
  return null
}

export function createInvitation(npub: string): string {
  if (!isValidNpub(npub)) throw new Error('Invalid public identity')
  // Fragment keeps the identity out of HTTP requests and normal referrer headers.
  return `https://sealchat.app/contacts#invite=${encodeURIComponent(npub)}`
}

export function invitationFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  if (params.getAll('invite').length !== 1) return null
  const value = params.get('invite') || ''
  return isValidNpub(value) ? value : null
}
