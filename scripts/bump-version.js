#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const PACKAGE_JSON = join(root, 'package.json')
const LOCALE_DE = join(root, 'src/i18n/locales/de.json')
const LOCALE_EN = join(root, 'src/i18n/locales/en.json')
const ANDROID_BUILD_GRADLE = join(root, 'android/app/build.gradle')
const IOS_PROJECT = join(root, 'ios/App/App.xcodeproj/project.pbxproj')

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
  const lockPath = join(root, 'package-lock.json')
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  lock.version = version
  lock.packages[''].version = version
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n')
  console.log(`Updated package files to ${version}`)
}

function updateLocaleFile(filePath, version) {
  const locale = JSON.parse(readFileSync(filePath, 'utf8'))
  const displayVersion = `Seal v${version}`
  locale.settings.version = displayVersion
  writeFileSync(filePath, JSON.stringify(locale, null, 2) + '\n')
  console.log(`Updated ${filePath.split('/').pop()} to ${displayVersion}`)
}

function getVersionCode(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return 1
  const [, major, minor, patch] = match
  return Number(major) * 10000 + Number(minor) * 100 + Number(patch)
}

function updateAndroidVersion(version) {
  let content = readFileSync(ANDROID_BUILD_GRADLE, 'utf8')
  const versionCode = getVersionCode(version)

  content = content.replace(
    /versionCode \d+/,
    `versionCode ${versionCode}`
  )
  content = content.replace(
    /versionName "[^"]+"/,
    `versionName "${version}"`
  )

  writeFileSync(ANDROID_BUILD_GRADLE, content)
  console.log(`Updated Android to ${version} (versionCode: ${versionCode})`)
}

function updateIOSVersion(version) {
  let content = readFileSync(IOS_PROJECT, 'utf8')
  const versionCode = getVersionCode(version)

  content = content.replace(
    /CURRENT_PROJECT_VERSION = \d+;/g,
    `CURRENT_PROJECT_VERSION = ${versionCode};`
  )
  content = content.replace(
    /MARKETING_VERSION = [\d.]+;/g,
    `MARKETING_VERSION = ${version.split('-')[0]};`
  )

  writeFileSync(IOS_PROJECT, content)
  console.log(`Updated iOS to ${version} (build: ${versionCode})`)
}

// Main
const args = process.argv.slice(2)
const positionalArgs = args.filter(arg => !arg.startsWith('--'))
const type = positionalArgs[0] || 'patch'
const shouldTag = args.includes('--tag')
const shouldPush = args.includes('--push')
if (shouldTag || shouldPush) {
  throw new Error('Commit the version changes before tagging. Use git tag -a v<VERSION> -m "Release v<VERSION>" after committing; push the tag separately.')
}

const currentVersion = getCurrentVersion()
const newVersion = bumpVersion(currentVersion, type)

console.log(`\nBumping version: ${currentVersion} -> ${newVersion}\n`)

updatePackageJson(newVersion)
updateLocaleFile(LOCALE_DE, newVersion)
updateLocaleFile(LOCALE_EN, newVersion)
updateAndroidVersion(newVersion)
updateIOSVersion(newVersion)

console.log(`
Version updated to ${newVersion}. Commit these changes first, then tag that commit:`)
console.log(`git tag -a v${newVersion} -m "Release v${newVersion}"`)
console.log(`git push origin HEAD && git push origin v${newVersion}`)
