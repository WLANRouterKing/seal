// Explicit, version- and content-pinned experimental patch. Not a postinstall hook.
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const root = new URL('./node_modules/@internet-privacy/marmot-ts/', import.meta.url)
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
if (pkg.version !== '0.7.0') throw new Error('Review patch against the new Marmot version')
const target = new URL('dist/core/client-config.js', root)
const original = await readFile(target, 'utf8')
const before = 'keyPackageEqualityConfig: defaultKeyPackageEqualityConfig,'
const after = `// Seal experimental same-account device fix: distinguish MLS signing keys.
    // Credential/proof validation remains in Marmot; duplicate signing keys
    // are still rejected by the existing key-package comparator.
    keyPackageEqualityConfig: {
        ...defaultKeyPackageEqualityConfig,
        compareKeyPackageToLeafNode(keyPackage, leafNode) {
            return defaultKeyPackageEqualityConfig.compareKeyPackages(keyPackage, { leafNode });
        },
    },`
const restored = original.includes(after) ? original.replace(after, before) : original
const expected = '70bad4cbfba866537e32d5b06e3bdcc1d3ae2c3f5fe7635d86dc7ff228627812'
if (createHash('sha256').update(restored).digest('hex') !== expected)
  throw new Error('Unexpected library contents; refusing patch')
if (!original.includes(after)) await writeFile(target, original.replace(before, after))
console.log('Applied experimental Marmot 0.7.0 same-account leaf comparison fix')
