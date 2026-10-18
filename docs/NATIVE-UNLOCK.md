# Device unlock: implementation and release gates

This branch contains implementation, not a claim of verified biometric support
on every device. Password protection and password recovery remain mandatory.
No native integration may fall back to plaintext keys or a successful prompt
followed by an unauthenticated key read.

| Build | Key protection | Important limits |
| --- | --- | --- |
| Android | Random wrapping secret encrypted with an Android Keystore AES-GCM key; each encrypt/decrypt operation uses BiometricPrompt.CryptoObject with BIOMETRIC_STRONG | Class 3 biometrics required; enrollment changes invalidate the key. No device-PIN fallback. Keystore hardware backing is device dependent. |
| iOS | Random wrapping secret in Keychain, WhenPasscodeSetThisDeviceOnly + biometryCurrentSet; every read uses a new LAContext | Face ID/Touch ID and device passcode required. No iCloud sync or device migration for this secret. Biometric enrollment changes require password recovery and re-enrollment. |
| Windows desktop | Isolated local HTTPS WebAuthn PRF ceremony; passkey/FIDO2-derived wrapping secret | Windows Hello/provider must support PRF. Plain Windows Hello consent or DPAPI is not accepted. Unsupported authenticators use the app password. |
| Linux desktop | Same PRF ceremony, allowing external FIDO2 authenticators | A PRF-capable authenticator with user verification is required. This does NOT implement generic laptop fingerprint-reader unlock through PAM/fprintd. Those dialogs alone do not supply an authenticated decryption key. |
| macOS desktop | Same PRF ceremony, allowing compatible external authenticators | No separate native Touch ID Keychain implementation in this change; integrated Touch ID availability is not promised. |
| Browser/PWA | Existing WebAuthn PRF implementation | Browser and provider support needed; verification may use biometrics or a PIN and provider sync may apply. |

The app's slot stores only wrapped master-key ciphertext and a public native ID
or public PRF credential metadata. The native bridge releases a 32-byte wrapping
secret only after its protected operation. JS wipes working byte buffers, but
JS/Swift/IPC string copies cannot be reliably zeroized. Same-origin script
compromise and compromise of an already unlocked process are outside this
at-rest boundary. Removing an unlock slot does not rotate the master key.

Desktop authentication uses an isolated sandboxed session and an intercepted
HTTPS origin (`https://seal-unlock.localhost`). It serves only the local ceremony
page and blocks other HTTPS requests. It does not move the main application's
existing file-origin IndexedDB, expose a local server or disable TLS checking.
IPC accepts requests only from the main app frame. The provider manages removal
of desktop passkeys; disabling the slot removes their ability to unlock this
vault, but does not delete the provider's credential. Availability is preliminary:
only a successful PRF enrollment confirms support on the actual device.

## Validation before release

Local checks cover web TypeScript, Electron TypeScript, lint, web build, and
mocked native bridge/WebAuthn tests with real AES-GCM/HKDF operations. No Android,
iOS or desktop biometric hardware is attached to this environment. Android SDK,
a functional Java runtime, Xcode, and the Electron executable are unavailable.
PR workflow `native-security-checks.yml` adds unsigned Android/iOS compilation
and desktop compilation on Windows/Linux/macOS. These do not replace device tests.
The TestFlight upload job is skipped for pull requests.

On each supported device/provider, verify:

1. Enroll after password confirmation, lock, authenticate and read old messages.
2. Restart the process/device and repeat; no automatic unlock or silent key read.
3. Cancel the prompt, provide wrong biometrics/PIN, trigger lockout, remove the
   credential or change enrolled biometrics; no plaintext fallback or data loss.
4. Unlock with the password and re-enroll after invalidation; disable device
   unlock and verify it cannot reopen the vault. Check logout deletes mobile keys.
5. Lock/logout while enrollment/unlock is pending; delayed results must not
   restore an unlocked session. Try unsupported PRF keys and copied slot metadata.
6. Inspect persistent files/backups: only ciphertext/public identifiers outside
   native protected storage. Verify existing accounts survive the upgrade.
7. Android debug/release signing, iOS real-device signing and each packaged desktop
   target must be checked separately from compilation.

References:
- https://developer.android.com/identity/sign-in/biometric-auth
- https://developer.apple.com/documentation/security/secaccesscontrolcreateflags/biometrycurrentset
- https://www.w3.org/TR/webauthn-3/#prf-extension
- https://www.electronjs.org/docs/latest/api/protocol
