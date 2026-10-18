# Seal encryption and threat model

## Local storage

A random 256-bit master key encrypts the Nostr private key with AES-256-GCM.
A password slot wraps the master key using PBKDF2-SHA256 (100,000 iterations)
and AES-256-GCM. HKDF derives a separate database key. Local protection is
currently optional; without a password, the identity and some metadata are
stored without at-rest encryption. Public lookup keys (contact pubkeys,
message IDs, relay URL hashes) remain visible even in encrypted mode.

Encrypted accounts reject normal data writes while locked. Creating or
importing a password-protected account activates the database key immediately.
Blocked contacts are included in local encryption/decryption migrations.

The in-app login delay only limits attempts through the UI. It does not limit
offline guessing against copied storage. A strong password is still required.
KDF tuning and a versioned migration to a memory-hard KDF remain future work.

## Biometric unlock security change

Biometric unlock is disabled in this release. Previous browser unlock keys were
derived from a locally stored credential ID, and native device keys were stored
in localStorage. Neither provided cryptographic biometric protection against a
copy of application storage.

At initialization, legacy passkey slots are removed only when a password slot
exists, preserving the password slot and encrypted data. Legacy localStorage
biometric material is then removed. Users must unlock with their existing
password. No new biometric slots can be enabled. A malformed account without a
password slot is left untouched and reports an initialization error.

This does NOT rotate the master key or the Nostr identity. Already copied
storage/key material remains exposed; deleting local slots cannot revoke it.
Suspected compromise requires a separate recovery and key-rotation plan.

Future biometric support must use genuine WebAuthn PRF output or OS-backed key
operations gated by authentication. Unsupported devices must use passwords,
never credential IDs or plaintext device keys as a fallback.

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
- Authenticated hardware-backed key storage and reviewed WebAuthn PRF support.
- Atomic, resumable migrations and account/master-key recovery and rotation.
- Robust memory/cache cleanup on lock, metadata minimization and network privacy.
- Forward-secret messaging architecture, with interoperability evaluated.
- Signed release/update supply chain and tighter renderer/content policies.
