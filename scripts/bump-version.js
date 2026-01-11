#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const PACKAGE_JSON = join(root, 'package.json')
const LOCALE_DE = join(root, 'src/i18n/locales/de.json')
const LOCALE_EN = join(root, 'src/i18n/locales/en.json')

function getCurrentVersion() {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'))
  return pkg.version
}

function bumpVersion(current, type) {
  // Parse version: could be "1.2.3" or "1.2.3-alpha"
  const match = current.match(/^(\d+)\.(\d+)\.(\d+)(-alpha)?$/)
  if (!match) {
    throw new Error(`Invalid current version: ${current}`)
  }

  const [, majorStr, minorStr, patchStr, alphaSuffix] = match
  const major = Number(majorStr)
  const minor = Number(minorStr)
  const patch = Number(patchStr)
  const isAlpha = alphaSuffix !== undefined

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      // If currently alpha, drop the alpha suffix
      if (isAlpha) {
        return `${major}.${minor}.${patch}`
      }
      return `${major}.${minor}.${patch + 1}`
    case 'alpha':
      // If already alpha, bump patch and stay alpha
      if (isAlpha) {
        return `${major}.${minor}.${patch + 1}-alpha`
      }
      // Otherwise bump patch and add alpha
      return `${major}.${minor}.${patch + 1}-alpha`
    default:
      // Assume it's a specific version
      if (/^\d+\.\d+\.\d+(-alpha)?$/.test(type)) {
        return type
      }
      throw new Error(`Invalid version type: ${type}`)
  }
}

function updatePackageJson(version) {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'))
  pkg.version = version
  writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`Updated package.json to ${version}`)
}

function updateLocaleFile(filePath, version) {
  const locale = JSON.parse(readFileSync(filePath, 'utf8'))
  const displayVersion = version.includes('-alpha') ? `Seal v${version}` : `Seal v${version}-alpha`
  locale.settings.version = displayVersion
  writeFileSync(filePath, JSON.stringify(locale, null, 2) + '\n')
  console.log(`Updated ${filePath.split('/').pop()} to ${displayVersion}`)
}

function createGitTag(version, push = false) {
  const tag = `v${version}`
  try {
    execSync(`git tag -a ${tag} -m "Release ${tag}"`, { stdio: 'inherit' })
    console.log(`Created git tag: ${tag}`)

    if (push) {
      execSync(`git push origin ${tag}`, { stdio: 'inherit' })
      console.log(`Pushed tag ${tag} to origin`)
    }
  } catch (error) {
    console.error('Failed to create git tag:', error.message)
  }
}

// Main
const args = process.argv.slice(2)
const positionalArgs = args.filter(arg => !arg.startsWith('--'))
const type = positionalArgs[0] || 'patch'
const shouldTag = args.includes('--tag')
const shouldPush = args.includes('--push')

const currentVersion = getCurrentVersion()
const newVersion = bumpVersion(currentVersion, type)

console.log(`\nBumping version: ${currentVersion} -> ${newVersion}\n`)

updatePackageJson(newVersion)
updateLocaleFile(LOCALE_DE, newVersion)
updateLocaleFile(LOCALE_EN, newVersion)

if (shouldTag) {
  console.log('')
  createGitTag(newVersion, shouldPush)
}

console.log(`\nDone! Version bumped to ${newVersion}`)
console.log('\nNext steps:')
console.log('  git add -A && git commit -m "bump: v' + newVersion + '"')
if (!shouldTag) {
  console.log('  npm run version -- --tag        # to create git tag')
}
if (!shouldPush) {
  console.log('  git push && git push --tags     # to push changes')
}