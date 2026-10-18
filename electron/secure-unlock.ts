import { BrowserWindow, session } from 'electron'

// Isolated HTTPS origin: the main app keeps its existing file:// IndexedDB.
// No HTTP server, remote assets, node access, preload, or main-app secrets here.
const origin = 'https://seal-unlock.localhost'
let busy = false

// Serialized into a sandboxed window. Must not capture Node/main-process values.
async function authenticatorOperation(mode: 'enroll' | 'unlock', savedId?: string) {
  const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
  const decode = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
  const random = () => crypto.getRandomValues(new Uint8Array(32))
  const urlEncode = (bytes: Uint8Array) => encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  let metadata: { credentialId: string; input: string }
  if (mode === 'enroll') {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: random(),
        rp: { name: 'Seal Desktop', id: location.hostname },
        user: { id: random(), name: 'Seal vault', displayName: 'Seal vault' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        attestation: 'none',
        timeout: 60000,
        extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null
    if (!credential) throw new Error('Cancelled')
    metadata = { credentialId: encode(new Uint8Array(credential.rawId)), input: encode(random()) }
  } else {
    metadata = JSON.parse(atob(savedId!))
    if (!metadata.credentialId || decode(metadata.input).length !== 32) throw new Error('Invalid credential')
  }
  const challenge = random()
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: decode(metadata.credentialId) }],
      userVerification: 'required',
      timeout: 60000,
      extensions: { prf: { eval: { first: decode(metadata.input) } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  if (!credential || encode(new Uint8Array(credential.rawId)) !== metadata.credentialId)
    throw new Error('Wrong credential')
  const response = credential.response as AuthenticatorAssertionResponse
  const client = JSON.parse(new TextDecoder().decode(response.clientDataJSON))
  const auth = new Uint8Array(response.authenticatorData)
  const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(location.hostname)))
  if (
    client.type !== 'webauthn.get' ||
    client.challenge !== urlEncode(challenge) ||
    client.origin !== location.origin ||
    client.crossOrigin === true ||
    auth.length < 37 ||
    (auth[32] & 5) !== 5 ||
    !rpHash.every((v, i) => auth[i] === v)
  )
    throw new Error('Invalid authentication')
  const extensions = credential.getClientExtensionResults() as AuthenticationExtensionsClientOutputs & {
    prf?: { results?: { first?: ArrayBuffer } }
  }
  const output = extensions.prf?.results?.first
  if (!output || output.byteLength !== 32)
    throw new Error('This authenticator does not support PRF. Use your password.')
  const secret = new Uint8Array(output)
  try {
    return { id: btoa(JSON.stringify(metadata)), secret: encode(secret) }
  } finally {
    secret.fill(0)
  }
}

export async function desktopSecureUnlock(
  parent: BrowserWindow,
  mode: 'enroll' | 'unlock',
  id?: string
): Promise<{ id: string; secret: string }> {
  if (busy) throw new Error('Authentication already in progress')
  if (mode === 'unlock' && (typeof id !== 'string' || id.length > 8192)) throw new Error('Invalid credential')
  busy = true
  const isolatedSession = session.fromPartition('seal-secure-unlock')
  const window = new BrowserWindow({
    parent,
    modal: true,
    width: 440,
    height: 300,
    title: 'Seal — secure unlock',
    autoHideMenuBar: true,
    webPreferences: {
      session: isolatedSession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  const argumentsJSON = JSON.stringify([mode, id]).replace(/</g, '\\u003c')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Seal secure unlock</title></head><body>
  <h2>Unlock Seal</h2><p>Use a PRF-capable passkey or FIDO2 security key. Your device may request biometrics or a PIN.</p>
  <button id="unlock">Continue</button><p id="status"></p>
  <script>window.sealResult = new Promise(resolve => {
    document.getElementById('unlock').onclick = async () => {
      document.getElementById('unlock').disabled = true;
      try { resolve({ ok: true, value: await (${authenticatorOperation.toString()})(...${argumentsJSON}) }); }
      catch { resolve({ ok: false }); }
    };
  });</script></body></html>`
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await isolatedSession.protocol.handle('https', (request) => {
      if (request.url !== origin + '/' || request.method !== 'GET') return new Response('', { status: 403 })
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy':
            "default-src 'none'; script-src 'unsafe-inline'; frame-ancestors 'none'; form-action 'none'",
        },
      })
    })
    return await new Promise((resolve, reject) => {
      window.on('closed', () => reject(new Error('Authentication cancelled')))
      timer = setTimeout(() => reject(new Error('Authentication timed out')), 180000)
      window
        .loadURL(origin + '/')
        .then(async () => {
          const result = await window.webContents.executeJavaScript('window.sealResult')
          if (
            !result?.ok ||
            typeof result.value?.id !== 'string' ||
            result.value.id.length > 8192 ||
            typeof result.value.secret !== 'string' ||
            Buffer.from(result.value.secret, 'base64').length !== 32
          ) {
            throw new Error('Secure passkey unlock unavailable or cancelled; use password')
          }
          resolve(result.value)
        })
        .catch(reject)
    })
  } finally {
    clearTimeout(timer)
    if (!window.isDestroyed()) window.destroy()
    isolatedSession.protocol.unhandle('https')
    busy = false
  }
}
