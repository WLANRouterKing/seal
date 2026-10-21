# Seal encryption and threat model

## Local storage

A random 256-bit master key encrypts the Nostr private key with AES-256-GCM.
New password slots use versioned scrypt (N=32768, r=8, p=3, 32-byte output,
16-byte random salt) and AES-256-GCM. Legacy PBKDF2-SHA256 (100,000 iterations)
slots are upgraded after successful password authentication using an atomic
compare-and-replace, preserving the master key, ciphertext and biometric slots. HKDF derives a separate database key. Local protection is
mandatory for app access. New identities remain in memory until password
setup succeeds. Existing plaintext accounts must configure a password before
using chats. New passwords require at least 12 characters; existing passwords
remain usable for recovery. Public lookup keys (contact pubkeys,
message IDs, relay URL hashes) remain visible even in encrypted mode.

Encrypted accounts reject normal data writes while locked. Creating or
importing a password-protected account activates the database key immediately.
Blocked contacts are included in local encryption/decryption migrations.

The in-app login delay only limits attempts through the UI. It does not limit
offline guessing against copied storage. A strong password is still required.
Benchmark the scrypt configuration on the slowest supported physical devices
before release. Biometric-only unlock does not upgrade a legacy password slot.

Encryption migration stages ciphertext in memory, then commits all changed
stores together with the password key record in one IndexedDB transaction.
Concurrent edits or a lock abort the migration; write failures roll back all
changes. Staging requires memory proportional to the local database size.

Lock clears chat/contact caches and closes the message subscription. Generation
checks discard stale loads and send/profile completions. JavaScript strings,
browser internals and already-running crypto/network operations cannot be
reliably zeroized or recalled; this is not guaranteed process-memory erasure.

## Biometric unlock security change

Web/PWA unlock supports WebAuthn PRF with required user verification. A platform
passkey supplies a 32-byte PRF result, which HKDF derives into an AES-GCM wrapping
key for the existing master key. Only the credential ID, random PRF input, salt
and wrapped master key are persisted. The PRF output is never persisted and its
working buffer is cleared after use. Enrollment requires the existing password
and a successful separate PRF authentication before saving the new slot.

User verification may use biometrics OR a device PIN. WebAuthn does not promise
biometrics-only or hardware-only storage: providers may sync passkeys. Browser
and authenticator PRF support are both necessary; unsupported/cancelled requests
fail closed and leave password access intact. A platform-authenticator probe is
only a preliminary check; enrollment checks actual PRF output. Native Capacitor
uses authenticated Android Keystore/iOS Keychain operations,
described in docs/NATIVE-UNLOCK.md. These new native paths still require native
build and physical-device validation. No plaintext device-key fallback is provided.

Legacy slots without PRF or native metadata are retired only when a password slot exists;
new PRF/native slots survive restarts. Existing password access and ciphertext remain
intact. Removing a slot does not rotate the master key, revoke copied keys or
delete credentials from the user's passkey provider. Suspected exposure needs a
separate recovery and key-rotation plan. Same-origin malicious scripts or a
compromised unlocked device remain outside this at-rest protection boundary.

PRF tests use mocked authenticator responses and real WebCrypto encryption.
Actual browser/device enrollment, restart, cancellation and recovery must be
validated before release. Specification: https://www.w3.org/TR/webauthn-3/#prf-extension

## Messages and metadata

Incoming messages validate the outer gift-wrap signature, recipient tag, inner
seal signature, rumor structure/kind, and sender consistency before accepting
content. Sender archive copies are accepted without a public `self` marker.

NIP-44/17 does not implement a forward-secret ratchet. Compromise of a long-term
private key can expose recorded conversations. Independent password/key slots
are not forward secrecy: every slot unlocks the same master key.

Relays can observe network information and recipient tags. Media upload hosts
can associate identity-signed upload authorization with files. Expiration and
vanish requests cannot force untrusted servers or recipients to delete copies.
The current expiration tag is inside the encrypted rumor and is used for local
expiry; relay-enforced expiry is not guaranteed.

## Remaining work before a security-focused release

- Independent audit and real Android/iOS/Desktop testing.
- Native build/device validation and independent review of the new authenticated
  Keystore/Keychain and desktop/WebAuthn PRF implementations.
- Atomic, resumable migrations and account/master-key recovery and rotation.
- Robust memory/cache cleanup on lock, metadata minimization and network privacy.
- Forward-secret messaging architecture, with interoperability evaluated.
- Signed release/update supply chain and tighter renderer/content policies.
