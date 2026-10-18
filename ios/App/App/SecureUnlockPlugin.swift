import Capacitor
import LocalAuthentication
import Security
import Foundation

@objc(SecureUnlockPlugin)
public class SecureUnlockPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureUnlockPlugin"
    public let jsName = "SecureUnlock"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "availability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enroll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unlock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]
    private let service = "app.sealchat.biometric.v2"
    private let queue = DispatchQueue(label: "app.sealchat.biometric")
    private func query(_ id: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service, kSecAttrAccount as String: id]
    }
    @objc func availability(_ call: CAPPluginCall) {
        let context = LAContext()
        let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        call.resolve(["available": available, "kind": context.biometryType == .faceID ? "face" : "biometric"])
    }
    @objc func enroll(_ call: CAPPluginCall) {
        queue.async {
            let context = LAContext()
            guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil),
                  let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
                                                             .biometryCurrentSet, nil) else {
                call.reject("Biometrics and device passcode are required"); return
            }
            let id = UUID().uuidString
            var secret = Data(count: 32)
            let status = secret.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, 32, $0.baseAddress!) }
            guard status == errSecSuccess else { call.reject("Random generation failed"); return }
            defer { secret.resetBytes(in: 0..<secret.count) }
            var item = self.query(id)
            item[kSecAttrAccessControl as String] = access
            item[kSecValueData as String] = secret
            item[kSecAttrSynchronizable as String] = false
            guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else {
                call.reject("Cannot store protected key"); return
            }
            // Read through the ACL before advertising enrollment as successful.
            guard let result = self.read(id) else {
                SecItemDelete(self.query(id) as CFDictionary)
                call.reject("Biometric authentication cancelled or unavailable"); return
            }
            call.resolve(["id": id, "secret": result])
        }
    }
    private func read(_ id: String) -> String? {
        let context = LAContext()
        context.localizedFallbackTitle = ""
        context.touchIDAuthenticationAllowableReuseDuration = 0
        defer { context.invalidate() }
        var item = query(id)
        item[kSecReturnData as String] = true
        item[kSecMatchLimit as String] = kSecMatchLimitOne
        item[kSecUseAuthenticationContext as String] = context
        item[kSecUseOperationPrompt as String] = "Unlock your encrypted Seal account"
        var result: CFTypeRef?
        guard SecItemCopyMatching(item as CFDictionary, &result) == errSecSuccess,
              var data = result as? Data, data.count == 32 else { return nil }
        defer { data.resetBytes(in: 0..<data.count) }
        return data.base64EncodedString()
    }
    @objc func unlock(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), UUID(uuidString: id) != nil else {
            call.reject("Invalid key id"); return
        }
        queue.async {
            guard let secret = self.read(id) else {
                call.reject("Key unavailable, cancelled or invalidated; use password"); return
            }
            call.resolve(["id": id, "secret": secret])
        }
    }
    @objc func remove(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), UUID(uuidString: id) != nil else {
            call.reject("Invalid key id"); return
        }
        queue.async {
            let status = SecItemDelete(self.query(id) as CFDictionary)
            if status == errSecSuccess || status == errSecItemNotFound { call.resolve() }
            else { call.reject("Cannot remove protected key") }
        }
    }
}

class SealBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SecureUnlockPlugin())
    }
}
