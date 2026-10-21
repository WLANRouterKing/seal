// Loopback HTTPS regression check; openssl generates disposable test certificates.
const fs = require('node:fs'),
  path = require('node:path'),
  https = require('node:https'),
  http = require('node:http'),
  net = require('node:net'),
  assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const root = fs.mkdtempSync(path.join(process.cwd(), '.tls-check-'))
const target = https.createServer,
  listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', r))
let server, proxy
const sockets = new Set()
;(async () => {
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        path.join(root, 'key.pem'),
        '-out',
        path.join(root, 'cert.pem'),
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=IP:127.0.0.1',
      ],
      { stdio: 'ignore' }
    )
    const cert = fs.readFileSync(path.join(root, 'cert.pem'))
    server = target({ key: fs.readFileSync(path.join(root, 'key.pem')), cert }, (_, res) => res.end('trusted target'))
    proxy = http.createServer()
    let tunnels = 0
    proxy.on('connect', (req, socket, head) => {
      tunnels++
      sockets.add(socket)
      const upstream = net.connect(server.address().port, '127.0.0.1', () => {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length) upstream.write(head)
        socket.pipe(upstream)
        upstream.pipe(socket)
      })
      sockets.add(upstream)
      upstream.on('error', () => socket.destroy())
    })
    server.on('connection', (socket) => sockets.add(socket))
    proxy.on('connection', (socket) => sockets.add(socket))
    await listen(server)
    await listen(proxy)
    process.env.GLOBAL_AGENT_HTTPS_PROXY = `http://127.0.0.1:${proxy.address().port}`
    process.env.GLOBAL_AGENT_NO_PROXY = 'bypass.invalid'
    const req = require('node:module').createRequire(
      path.join(process.cwd(), 'node_modules/app-builder-lib/package.json')
    )
    req('@electron/get').initializeProxy()
    const get = (ca) =>
      new Promise((resolve, reject) => {
        https
          .get(`https://127.0.0.1:${server.address().port}`, { ca }, (res) => {
            let data = ''
            res.on('data', (c) => (data += c))
            res.on('end', () => resolve(data))
          })
          .on('error', reject)
      })
    assert.equal(await get(cert), 'trusted target')
    await assert.rejects(get(undefined), /self-signed|certificate/i)
    assert.equal(tunnels, 2)
    console.log('HTTPS proxy CONNECT works; trusted certificate accepted and untrusted certificate rejected')
  } finally {
    for (const s of sockets) s.destroy()
    server?.close()
    proxy?.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
