# Security hardening patch for Seal v0.2.2

Base: 8a7bd3199f634040b45eb54b493435874725dfb6.

## Apply

From a clean checkout of the base revision (or a compatible later revision):

```sh
git switch -c security/hardening
git apply --check /path/to/seal-expanded.patch
git apply /path/to/seal-expanded.patch
npm ci
npm run test:run
npm run lint
npm run build
```

These changes are intended for review in a pull request and have not been deployed to sealchat.app.

## Changes

- Replace insecure browser biometric unlock with WebAuthn PRF; keep native biometric unlock disabled. Retire old passkey slots only
  when a password slot exists; preserve password access and ciphertext.
- Explain password/passkey unlock in German and English. Require a password, remove skip/removal paths, and keep new unprotected identities in memory only.
- Validate outer and inner signatures, message structure/kind and recipient.
- Remove the public `self` tag from new sender archive copies.
- Refuse plaintext fallback writes for locked password-protected accounts.
- Activate DB encryption immediately when creating/importing with a password.
- Include blocked contacts in encryption/decryption migrations.
- Prevent setPassword from overwriting an existing live master key.
- Remove pairing-code and SDP debug output; allow browser page zoom.
- Correct encryption documentation, including forward secrecy and offline attacks.
- Repair missing lockfile entries and add fake-indexeddb for storage tests.

## Validation

- 60 tests passed, including security and invitation/onboarding regression tests using real crypto
  and an in-memory IndexedDB implementation.
- ESLint passed.
- TypeScript and Vite production build passed; existing large-bundle warning remains.
- Native builds and two-device/browser end-to-end testing were not performed.
- No independent security audit. Compatible dependency updates reduced the full
  npm audit from 60 to 13 affected package entries (0 critical, 2 high, 11 moderate).
  See docs/SECURITY-BACKLOG.md for all open GitHub PRs and remaining risks.
- The restricted execution environment reports zero CPUs. PWA/Workbox validation
  used a validation-only Node preload giving its worker scheduler one CPU entry;
  no application code or dependency source was changed for this workaround.
- Visual browser validation was blocked because the remote browser could not
  reach the local dev server. Onboarding was covered by a component test.

## Rollout and remaining risks

Users with biometric unlock must know their existing password. Do not roll this
out without communicating the change. Slot removal does not rotate the master
key or revoke previously copied secrets. Previously exposed identities require
an explicit recovery and rotation plan. The patch does not add forward secrecy,
a memory-hard password KDF, hardware keystore support, guaranteed relay deletion,
atomic migrations, or comprehensive lock-time memory cleanup.

NIP-44/17's long-term-key limitations and metadata exposure remain. See
ENCRYPTION.md for the bounded threat model. Test migration with backed-up,
representative accounts on supported devices before release.

## Product extension

See docs/PRODUCT-ROADMAP.md. This combined patch includes the previous security
patch plus desktop split view, contact invitation links/QR, public identity
parsing, explicit local contact verification, and a corrected backup-first
onboarding. Apply to the original base; do not apply on top of the previous
security patch without resolving overlapping changes. No paid features are
represented as implemented. Deployment remains a separate release step.

## PRF follow-up validation

PRF authentication uses mocked WebAuthn responses with real WebCrypto in tests.
Native keystore integration and actual biometric device testing remain pending.
Passwords remain required as a recovery path; user verification can use device PIN.
