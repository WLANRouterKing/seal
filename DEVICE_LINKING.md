# Linked devices in Seal

The actual app now has **Settings → Linked devices → Add device**. On a clean
second installation/profile, choose **Link to an existing account**, enter the
primary's public npub, set a local password and show its QR code to the primary.
Both sides confirm the same code. Pasting the signed pairing text is also
supported for machines without a camera. Use the normal app dev server (`npm run
dev`, port 5173), not the separate MLS lab.

## Current behavior

This integration supports existing NIP-17 chats through an unlocked primary:
list chats, read up to 20 recent messages per chat, send text, lock/unlock, restore
a linked installation and revoke its access. No contacts are automatically added.
The primary service runs throughout the unlocked app, not only on Settings.
The primary must be running and unlocked for requests. There is no offline queue;
a timed-out send may have completed and must be checked before manually retrying.
The linked client keeps plaintext chat content in memory only, clears it on lock,
and currently does not retain an offline history. It locks after five minutes
of inactivity or when hidden. Files and native biometric unlock on the linked
client are not included; the primary's existing biometric login is unchanged.

This is **not the independent MLS mode** in `experiments/multidevice`. Existing
NIP-17 peers cannot decrypt MLS messages, and sharing the nsec to fake independent
devices would defeat revocation. The MLS experiment remains separate and alpha.

## Security boundaries

- Independent, locally generated companion and primary-bridge secrets. Neither
  the account nsec nor any password-derived/storage key crosses the transport.
- A signed, account-bound, five-minute enrollment request, explicit code comparison
  on both devices, and an account-signed NIP-44 encrypted grant. The plaintext
  enrollment request is QR/text only and is never published to a relay.
- Device traffic uses NIP-44 encryption plus verified Nostr signatures in custom
  ephemeral kind 24134 events. This is a Seal-specific protocol, not NIP-46 or an
  interoperability claim. Session, request ID, sequence, recipient, sender and
  freshness are checked. No generic signing/decryption endpoint is exposed.
- Strict operations: confirm, list chats, read history, send bounded text. Each
  request's sequence is persisted before side effects, preventing replayed sends
  across restarts. There is no automatic retry of ambiguous sends.
- Account-bound AES-GCM storage on the primary, encrypted with the unlocked app
  vault. Separate password-required scrypt/key-slot vault on the companion;
  non-extractable derived encryption keys; no plaintext storage fallback.
- Web Locks enforce one owning tab per primary account or companion installation.
  Unsupported environments fail closed. Session capabilities stop on vault lock.
- Revocation is persisted on the primary before subsequent requests are processed;
  it does not depend on delivery of the courtesy relay notice. Prior messages and
  sends already in progress cannot be recalled. Restoring an older primary backup
  may restore old grants: revoke and re-pair after such a restore.
- The initial UI uses `wss://nos.lol` for the device channel. Relay outages prevent
  synchronization. Relay operators see device public keys, timing and network
  metadata; the primary's public account key appears on enrollment grants.
- This is not a security audit. XSS in an unlocked app can use its capabilities.
  Physical Android/iOS/Windows/Linux camera/lifecycle tests remain necessary.

## Validation

```sh
npm run test:run
npm run build
# Explicit opt-in; sends only synthetic encrypted traffic:
SEAL_DEVICE_RELAY=wss://nos.lol npx vitest run src/services/devices/relay.test.ts
# Full actual-app UI test, against npm run dev on port 5173:
npm ci --prefix experiments/multidevice --ignore-scripts
(cd experiments/multidevice && npx playwright install chromium)
node experiments/multidevice/app-browser-smoke.cjs
```

Unit coverage includes QR tampering/expiry, explicit confirmation, account/session
binding, forbidden signing operations, replay across restart, revocation, storage
AAD, wrong passwords and lock revocation. The opt-in relay test passed against
nos.lol on 2026-10-22. The browser test uses two independent Chromium processes,
real UI enrollment by signed QR text, and a generated third peer that decrypts the
actual NIP-17 message and sends a reply through the public relay.

Recorded app validation on 2026-10-22:

- 92 app tests passed; one opt-in public-relay test skipped in the default suite.
  That public-relay test was run separately and passed.
- Web build, Electron TypeScript compilation and changed-source lint passed.
- GitHub Actions job `app-device-link` passed in run
  [39748767901](https://github.com/WLANRouterKing/seal/actions/runs/39748767901),
  testing code commit `7fffc70a55a73a87e5a5a5ad87cddcda466f5403`.
  The real app UI flow above passed, including decryption by the third peer.
- Camera capture and physical native-device behavior were not exercised by
  Chromium automation; signed QR text used the same inspection/approval path.
