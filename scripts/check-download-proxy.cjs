// Exercises electron-builder's actual downloader after the scoped proxy override.
// Uses only loopback servers and disposable fixture data; no external downloads.
const assert = require('node:assert/strict')
const http = require('node:http')
const { createRequire } = require('node:module')
const { createHash } = require('node:crypto')
const { mkdtemp, readFile, rm } = require('node:fs/promises')
const path = require('node:path')

async function main() {
  const root = await mkdtemp(path.join(process.cwd(), '.proxy-check-'))
  const payload = Buffer.from('Seal downloader compatibility fixture')
  let proxied = 0
  const proxy = http.createServer((req, res) => {
    if (!req.url.startsWith('http://seal-download.invalid/')) {
      res.writeHead(400).end()
      return
    }
    proxied++
    res.end(payload)
  })
  const direct = http.createServer((_req, res) => res.end('direct'))
  const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const close = (server) =>
    new Promise((resolve) => {
      server.close(resolve)
      server.closeAllConnections()
    })
  try {
    await listen(proxy)
    await listen(direct)
    // Set only namespaced proxy configuration; never read or log user credentials.
    process.env.GLOBAL_AGENT_HTTP_PROXY = `http://127.0.0.1:${proxy.address().port}`
    process.env.GLOBAL_AGENT_HTTPS_PROXY = process.env.GLOBAL_AGENT_HTTP_PROXY
    process.env.GLOBAL_AGENT_NO_PROXY = '127.0.0.1'
    const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'))
    const downloader = builderRequire('@electron/get')
    downloader.initializeProxy()
    assert.equal(global.GLOBAL_AGENT.HTTP_PROXY, process.env.GLOBAL_AGENT_HTTP_PROXY)
    const filename = 'electron-v45.0.0-linux-x64.zip'
    const options = {
      version: '45.0.0',
      artifactName: 'electron',
      platform: 'linux',
      arch: 'x64',
      mirrorOptions: { mirror: 'http://seal-download.invalid/' },
      cacheRoot: path.join(root, 'cache'),
      tempDirectory: root,
      checksums: { [filename]: createHash('sha256').update(payload).digest('hex') },
      downloadOptions: { quiet: true },
    }
    const file = await downloader.downloadArtifact(options)
    assert.deepEqual(await readFile(file), payload)
    assert.equal(proxied, 1)
    const response = await new Promise((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${direct.address().port}`, (res) => {
          let body = ''
          res.on('data', (chunk) => {
            body += chunk
          })
          res.on('end', () => resolve(body))
        })
        .on('error', reject)
    })
    assert.equal(response, 'direct')
    assert.equal(proxied, 1, 'NO_PROXY must bypass the proxy')
    await assert.rejects(
      downloader.downloadArtifact({
        ...options,
        force: true,
        checksums: { [filename]: '0'.repeat(64) },
      }),
      /checksum/i
    )
    console.log('Downloader proxy, NO_PROXY and checksum validation passed')
  } finally {
    await Promise.all([close(proxy), close(direct)])
    await rm(root, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
