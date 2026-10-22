# Independent linked devices (development branch)

## Acceptance criterion

After one confirmed QR/text enrollment, the linked browser must send and receive
text messages, restore its encrypted local state, and retrieve messages missed
while locked **with the primary app completely closed**. The ordinary Seal chat
and contacts UI is used. The primary is needed only to authorize/remove devices.
The former primary-mediated chat RPC is disabled in the app.

Both conversation participants need this Seal version. This is an explicit
Seal extension, not transparent interoperability with unchanged NIP-17 clients.
The separate MLS lab is not used by this implementation.

## How to use

Update both installations and your conversation partner. Previous bridge-only
links must be revoked on the primary and locally deleted, then enrolled again.
On the second installation, choose **Link to an existing account**, enter the
primary's public npub, set a password and present the QR or pairing text. On the
primary use **Settings → Linked devices → Add device**, inspect the request and
compare the code on both devices. After both confirmations, the primary can close.

The second installation owns a separate private key. Its contacts, block list,
timers and received text history persist in its password-encrypted device vault.
Contacts are added manually. Old account-key-encrypted history is not copied.
Messages sent after enrollment are encrypted separately for every authorized
inbox and the account inbox; the primary catches up when reopened. Lock clears
runtime keys and plaintext UI state. Unlock does not contact the primary.

## Wire format and authority

- Existing signed, short-lived QR enrollment and NIP-44 encrypted confirmation
  transport bind the public account identity to the newly generated device key.
- An account-signed parameterized replaceable kind 30078 event with
  `d=seal-independent-devices-v1` publishes `{version:1,devices:[public keys]}`.
  No account private key, device private key, vault master key or password-derived
  key is published or transferred. This directory publicly reveals device count
  and the mapping of account to device public keys.
- A device signs its own inner kind 14 application event containing recipient
  account, bounded text, timestamp, nonce and optional expiration. This event and
  the account-signed authorization proof travel **inside** NIP-44/NIP-59 gift
  wraps. The NIP-17 seal and rumor authors still match the actual device signer;
  Seal separately verifies the account authorization before displaying account
  identity. It never substitutes an unproven account pubkey.
- Each authorized recipient device and sender sibling receives an independently
  encrypted persistent kind 1059 event. Relays hold ciphertext for offline pickup.
  Inner signed event IDs deduplicate copies and replays.
- A sender resolves the recipient directory before sending. A receiver checks
  signatures, transport/inner signer equality, recipient scope, authorization
  proof and the currently fetched directory. Observed directory high-water marks
  persist encrypted; a known newer directory cannot be replaced by older data.
- Removing a device publishes a new signed directory. Publication must receive
  relay acknowledgment before the action returns successfully. Updated peers
  stop encrypting to that device and reject new messages from its removed key.
  Previously delivered ciphertext/content cannot be recalled. In-flight sends
  may complete using their previously resolved recipient list.

## Important implementation boundaries

Discovery and independent delivery currently use `wss://nos.lol`. A relay outage
can block directory resolution and delivery. Signed replaceable events prove
origin, **not global freshness**: a censoring relay can hide a removal from a
client which has not seen it. Persisted high-water marks stop observed rollback,
not censorship. This is not consensus or an audited revocation protocol.

This remains a development implementation, without an independent security
review. It uses NIP-44 encryption and device-specific signing, not MLS or a
forward-secret per-message ratchet. Browser XSS can use unlocked device keys.
Physical native-device lifecycle/biometric checks remain separate release gates.

Independent attachment/voice-message delivery, import of pre-link history,
synchronization of contact edits and remote deletion across devices are not
implemented. Companion text deletion/blocking/timers are local preferences.
Main-device file messages continue on the existing account-addressed path.
Unchanged legacy peers can still exchange legacy messages with a primary account,
but the independent companion refuses to send without a compatible peer directory.
No silent fallback to an online-primary bridge exists.

## Validation

```sh
npm run test:run
npm run build
npm ci --prefix experiments/multidevice --ignore-scripts
(cd experiments/multidevice && npx playwright install chromium)
npm run dev -- --host 127.0.0.1
# in another terminal:
node experiments/multidevice/app-browser-smoke.cjs
```

The app browser test uses three independent Chromium processes and real nos.lol
traffic. It enrolls through the real UI, closes the primary page, exchanges text
between companion and peer, locks/reloads the companion, retrieves missed text,
sends again with the primary still closed, then reopens the primary to revoke.
It is not the MLS simulation or the former primary-online smoke test.

Unit tests cover authorization signatures, tampering, unapproved/removed device
signers, account/recipient substitution, encryption with a disposed account
signer, vault encryption/locking, UI routes and failed-send draft preservation.
