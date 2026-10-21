# Seal independent-device lab

**Experimental. Not enabled in the Seal app. Use generated test accounts only.**

This implements and exercises separate MLS device keys for one Nostr account,
password-encrypted device storage, a local pairing-envelope prototype and a
small device-management UI. The browser member can exchange messages while
its account signer is disabled. The main device can remove that browser leaf
without removing its own leaf.

The UI simulates three devices in one page, with a serialized in-memory relay.
**It is not a completed remote-device pairing feature.** No public relays are
contacted and no real nsec can be entered. The device authorization-signing
callback is local; only Welcome delivery uses the pairing envelope. Real
cross-device authorization transport, synchronized rosters and integration
with existing Seal chats remain unimplemented.

## Run locally

With Node 22 or newer, from the repository root:

```sh
npm ci --prefix experiments/multidevice --ignore-scripts
npm test --prefix experiments/multidevice
npm run dev --prefix experiments/multidevice
```

Open `http://127.0.0.1:5174`. Set a test password (at least 12 characters), confirm
both device-code checkboxes and link the simulated browser. Switch the main
device offline, exchange messages, lock/unlock the browser and then remove it
with the main device back online. Delete the test data before closing the page.
The main device and peer are ephemeral; page reload ends the simulation. The
browser's encrypted IndexedDB data remains until deleted or site data is cleared.

```sh
npm run build --prefix experiments/multidevice
# Browser test, while the dev server above is running:
cd experiments/multidevice
npx playwright install chromium
node browser-smoke.cjs
```

The separate GitHub workflow runs protocol/storage tests, builds the lab and
runs the browser lifecycle test. Nothing from this directory is imported into
Seal's production entry point or deployment bundle.

## Explicit experimental library fix

Pinned implementation: `@internet-privacy/marmot-ts@0.7.0`. Upstream labels it
Alpha and says not to use it in production.

The original package rejects a second leaf with the same account credential,
even with a different MLS signing key. Commit `eff5848` contains the original
failing-case reproduction. The adopted Marmot identity spec permits multiple
leaves for one account.

`apply-library-fix.mjs` adjusts only Marmot's key-package-to-leaf comparator to
compare MLS signature keys through the existing key-package comparator. It
retains duplicate signature-key rejection and all credential/account-proof
validation. The script requires the exact package version and SHA-256 of the
original file and refuses unknown contents. It is explicit in `test`, `dev`
and `build`, not a hidden install hook. This is an experimental downstream fix,
not an upstream-reviewed release.

## Implemented boundaries

- Independent same-account leaves; account key is not copied into the browser
  client. The pairing-time signing callback is detached after setup.
- Real MLS bidirectional messages with account signing disabled, rehydration of
  browser state and removal. A stale removed-device snapshot that never received
  the removal cannot read a subsequent-epoch message.
- Separate device namespaces and scrypt-derived AES-256-GCM encryption. AAD binds
  account, device, store and record. Salts/IVs are random; wrong passwords, moved
  ciphertext and lock/unlock races fail closed. No plaintext fallback.
- Encrypted storage adapters for group, KeyPackage, ingest, lifecycle, rewind,
  removal-marker and invitation state. Lock drops the lab's browser client and
  plaintext message list. Unlock creates a new client from encrypted records.
- Pairing request bound to account, device, fresh session and five-minute expiry;
  explicit confirmation code on both sides. Account-signed NIP-44 encrypted
  response; one-use receiving key erased after acceptance or cancellation.
  This local-only kind-30078 envelope is **not a standardized Nostr extension**.
- Device list with per-chat `linked`, `removing`, `removed` or `failed` status.
  Removal resolves the leaf by account and MLS signature key at commit time,
  rather than trusting a previously saved index that may have been reused.
  Only an acknowledged, locally applied removal is shown as removed.
- No contacts are automatically created.

The main-device roster is RAM-only in the lab. A production roster must be
persisted in that device's vault and synchronized through an authenticated
protocol; it must not be kept in the browser device's vault.

## Remaining release gates

1. Reviewed upstream/fork support for same-account leaves, with broader MLS
   conformance and hostile fork/order/relay testing. The targeted tests do not
   establish a security audit or full interoperability.
2. Real authenticated transport for device authorization, including strict
   signing-request validation, cancellation and replay handling across restarts.
   The current QR UI is a local simulation, not a remote enrollment channel.
3. New-chat invites, KeyPackage replenishment and account-inbox delivery while
   the main device is offline. Current tests cover already-established groups.
4. Synchronized device roster and removal across **all** chats, including failures,
   retries, concurrent admins and convergence. No global account revocation is
   claimed. A removed device still knows previously received content.
5. Consent-based history transfer without cloning a live MLS leaf; backup and
   recovery; migration and protocol negotiation with peers. Legacy NIP-17 chats
   cannot silently gain per-device revocation.
6. Transactional MLS state transitions across records, crash/rollback recovery,
   exclusive ownership across browser tabs and data-eviction handling. Each
   IndexedDB record write is atomic; an entire MLS transition is not yet one
   storage transaction. This prevents claiming production readiness.
7. Real Android/iOS/Windows/Linux device and biometric tests, browser E2E results
   and an independent review before activation. Active browser XSS can access
   unlocked device material; encryption does not protect a compromised JS realm.

## Related production change

`src/services/accountSigner.ts` defines an account-signing capability, and
`accountSignerSession.ts` binds the software adapter to the current vault
session. Existing NIP-17 messages/files now use that interface. Lock revokes old
references; changing the vault generation invalidates them too. This refactor
preserves the existing message format. It is not hardware isolation: the
unlocked legacy auth store still holds the nsec, including for explicit export.

## References

- [Implementation and Alpha warning](https://github.com/marmot-protocol/marmot-ts)
- [Account identity and multiple leaves](https://github.com/marmot-protocol/marmot/blob/master/foundation/identity.md)
- [Account-to-leaf proof](https://github.com/marmot-protocol/marmot/blob/master/app-components/account-identity-proof-v2.md)
- [Multi-device direction, non-normative](https://github.com/marmot-protocol/marmot/blob/master/ideas/multi-device.md)

The lockfile pins tested code; upstream documents can change.

## Validation recorded for this draft

- Seal: 87 passing tests, successful web build and Electron TypeScript compilation.
- Lab: 8 passing tests, including same-account sibling catch-up and duplicate-leaf
  rejection; successful separate web build.
- Browser lifecycle: passed in GitHub Actions on Chromium, including pairing UI,
  offline exchange, lock/restore, removal, cleanup and mobile-width overflow check.
  Local execution was blocked by a Chromium archive download failure; no local
  browser pass is claimed.
- Lint: no errors. Source formatting passes. Production dependency audit: no
  reported vulnerabilities. These checks are not a cryptographic audit.
- Android/iOS physical devices and native biometric flows were not retested by
  this change. No production deployment, merge or release has been performed.
