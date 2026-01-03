# Seal Encryption Architecture

This document describes the encryption system used in Seal to protect user data.

## Overview

Seal uses a **Master Key** based encryption system, similar to LUKS (Linux Unified Key Setup) or VeraCrypt. This allows multiple unlock methods (password, passkey/biometrics) to access the same encrypted data.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Master Key                            │
│              (256-bit random, never stored plaintext)        │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│     Password Slot       │     │     Passkey Slot        │
│  (AES-GCM key wrap)     │     │  (AES-GCM key wrap)     │
│                         │     │                         │
│  - Salt (16 bytes)      │     │  - Salt (16 bytes)      │
│  - Wrapped Master Key   │     │  - Wrapped Master Key   │
└─────────────────────────┘     └─────────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   Master Key    │
                    └─────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│    Encrypted nsec       │     │   Database Encryption   │
│   (AES-256-GCM)         │     │    Key (derived via     │
│                         │     │        HKDF)            │
└─────────────────────────┘     └─────────────────────────┘
```

## Components

### 1. Master Key

- **Size**: 256 bits (32 bytes)
- **Generation**: `crypto.getRandomValues()`
- **Purpose**: Encrypts all sensitive data (nsec, database)
- **Storage**: Never stored in plaintext - only wrapped by key slots

### 2. Key Slots

A slot is a wrapped (encrypted) copy of the Master Key. Each unlock method has its own slot:

#### Password Slot
- **Key Derivation**: PBKDF2 (100,000 iterations, SHA-256)
- **Wrapping**: AES-256-GCM
- **Components**:
  - `salt`: 16 random bytes for PBKDF2
  - `wrappedKey`: IV (12 bytes) + encrypted Master Key

#### Passkey Slot (WebAuthn / Biometrics)
- **Key Derivation**: HKDF-SHA256 from WebAuthn credential ID
- **Wrapping**: AES-256-GCM
- **Components**:
  - `salt`: 16 random bytes for HKDF
  - `wrappedKey`: IV (12 bytes) + encrypted Master Key

### 3. Encrypted nsec

The Nostr private key (nsec) is encrypted with the Master Key:
- **Algorithm**: AES-256-GCM
- **Storage**: `encryptedNsec` field (IV + ciphertext, base64)

### 4. Database Encryption Key

Derived from Master Key using HKDF:
```
dbKey = HKDF-SHA256(
  masterKey,
  salt: dbSalt,
  info: "seal-database-encryption",
  length: 256 bits
)
```

Used to encrypt: messages, contacts, relays, settings

## Storage Format (V2)

```typescript
interface EncryptedKeysV2 {
  _v: 2                    // Version marker
  encryptedNsec: string    // nsec encrypted with Master Key
  slots: KeySlot[]         // Array of unlock method slots
  dbSalt: string           // Salt for DB key derivation
  npub?: string            // Public key (visible when locked)
  identityHidden?: boolean // If true, npub is also hidden
}

interface KeySlot {
  type: 'password' | 'passkey'
  salt: string             // Base64-encoded derivation salt
  wrappedKey: string       // Base64-encoded wrapped Master Key
}
```

## Security Properties

### 1. Key Separation
- Master Key is never derived from password (it's random)
- Password only unwraps the Master Key
- Changing password doesn't require re-encrypting all data

### 2. Multiple Unlock Methods
- Adding/removing passkey doesn't affect password slot
- Each slot independently protects the same Master Key
- Slots can be added/removed without re-encryption

### 3. Forward Secrecy (per-slot)
- Compromising one slot doesn't reveal other slots
- Each slot uses independent salt

### 4. Brute Force Protection
- PBKDF2 with 100,000 iterations for password
- Rate limiting (3 attempts, then exponential backoff)
- Lockout after repeated failures

## Migration (V1 → V2)

Legacy accounts (V1 format) are automatically migrated on first unlock:

1. Decrypt nsec with password (old method)
2. Generate new Master Key
3. Create password slot
4. Encrypt nsec with Master Key
5. Save as V2 format

## Key Flows

### Setting Password (First Time)
```
1. Generate Master Key (random 256 bits)
2. Generate DB Salt (random 128 bits)
3. Derive wrapping key from password (PBKDF2)
4. Wrap Master Key → Password Slot
5. Encrypt nsec with Master Key
6. Store: { slots: [passwordSlot], encryptedNsec, dbSalt }
```

### Unlock with Password
```
1. Load stored keys
2. Find password slot
3. Derive wrapping key from password (PBKDF2)
4. Unwrap Master Key
5. Decrypt nsec
6. Derive DB key from Master Key
7. Unlock complete
```

### Enable Passkey
```
1. Verify password (unwrap Master Key)
2. Authenticate with WebAuthn
3. Derive wrapping key from credential (HKDF)
4. Wrap same Master Key → Passkey Slot
5. Add passkey slot to existing slots
```

### Unlock with Passkey
```
1. Load stored keys
2. Find passkey slot
3. Authenticate with WebAuthn
4. Derive wrapping key from credential (HKDF)
5. Unwrap Master Key
6. Decrypt nsec
7. Derive DB key from Master Key
8. Unlock complete
```

## Files

- `src/services/masterKey.ts` - Master Key management, slot creation/unlock
- `src/services/encryption.ts` - PBKDF2, AES-GCM primitives
- `src/services/biometrics.ts` - WebAuthn credential management
- `src/stores/authStore.ts` - Authentication state, unlock flows
- `src/services/db.ts` - Storage format, type definitions

## Future Considerations

- **Hardware Key Slot**: Could add support for hardware security keys (YubiKey)
- **Recovery Key Slot**: Paper backup key that can unlock Master Key
- **Key Rotation**: Ability to generate new Master Key and re-wrap all slots
