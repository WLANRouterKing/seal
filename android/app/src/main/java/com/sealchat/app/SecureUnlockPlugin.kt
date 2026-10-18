package com.sealchat.app

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.security.KeyStore
import java.security.SecureRandom
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Auth-per-operation AES key. No device PIN or unauthenticated-key fallback. */
@CapacitorPlugin(name = "SecureUnlock")
class SecureUnlockPlugin : Plugin() {
    private val prefix = "seal.biometric."
    private var busy = false
    private val prefs get() = context.getSharedPreferences("seal_biometric_v2", 0)
    private fun store() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    private fun valid(id: String) = id.matches(Regex("[0-9a-f-]{36}"))
    private fun available() = BiometricManager.from(context).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS

    @PluginMethod
    fun availability(call: PluginCall) {
        call.resolve(JSObject().put("available", available()).put("kind", "biometric"))
    }

    @PluginMethod
    fun enroll(call: PluginCall) = activity.runOnUiThread {
        if (busy || !available()) { call.reject("Strong biometrics unavailable or busy"); return@runOnUiThread }
        val id = UUID.randomUUID().toString()
        try {
            val spec = KeyGenParameterSpec.Builder(prefix + id, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).setUserAuthenticationRequired(true).setInvalidatedByBiometricEnrollment(true)
            if (Build.VERSION.SDK_INT >= 30) spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
            else {
                @Suppress("DEPRECATION")
                spec.setUserAuthenticationValidityDurationSeconds(-1)
            }
            val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            generator.init(spec.build())
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, generator.generateKey())
            authenticate(call, cipher, id, true)
        } catch (_: Exception) { busy = false; delete(id); call.reject("Cannot create protected key") }
    }

    @PluginMethod
    fun unlock(call: PluginCall) = activity.runOnUiThread {
        val id = call.getString("id") ?: ""
        if (busy || !valid(id) || !available()) { call.reject("Biometrics unavailable or invalid key"); return@runOnUiThread }
        try {
            val key = store().getKey(prefix + id, null) as SecretKey
            val iv = Base64.decode(prefs.getString(id + ".iv", null) ?: error("Missing key"), Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
            authenticate(call, cipher, id, false)
        } catch (_: Exception) { busy = false; call.reject("Key unavailable or invalidated; use password and enroll again") }
    }

    private fun authenticate(call: PluginCall, cipher: Cipher, id: String, enrolling: Boolean) {
        busy = true
        val prompt = BiometricPrompt(activity, ContextCompat.getMainExecutor(context), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationError(code: Int, message: CharSequence) {
                busy = false
                if (enrolling) delete(id)
                call.reject("Biometric authentication cancelled or unavailable")
            }
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                var secret: ByteArray? = null
                try {
                    val authenticatedCipher = result.cryptoObject?.cipher ?: error("Missing authenticated cipher")
                    if (enrolling) {
                        secret = ByteArray(32).also { SecureRandom().nextBytes(it) }
                        val encrypted = authenticatedCipher.doFinal(secret)
                        check(prefs.edit().putString(id + ".iv", Base64.encodeToString(authenticatedCipher.iv, Base64.NO_WRAP))
                            .putString(id + ".data", Base64.encodeToString(encrypted, Base64.NO_WRAP)).commit())
                    } else {
                        val data = Base64.decode(prefs.getString(id + ".data", null) ?: error("Missing key"), Base64.NO_WRAP)
                        secret = authenticatedCipher.doFinal(data)
                    }
                    check(secret.size == 32)
                    call.resolve(JSObject().put("id", id).put("secret", Base64.encodeToString(secret, Base64.NO_WRAP)))
                } catch (_: Exception) {
                    if (enrolling) delete(id)
                    call.reject("Protected key operation failed")
                } finally { secret?.fill(0); busy = false }
            }
        })
        val info = BiometricPrompt.PromptInfo.Builder().setTitle("Unlock Seal")
            .setSubtitle("Access your encrypted account").setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .setNegativeButtonText("Use password").build()
        prompt.authenticate(info, BiometricPrompt.CryptoObject(cipher))
    }
    private fun delete(id: String) {
        if (!valid(id)) return
        try { store().deleteEntry(prefix + id) } catch (_: Exception) { /* No usable key remains. */ }
        prefs.edit().remove(id + ".iv").remove(id + ".data").commit()
    }
    @PluginMethod
    fun remove(call: PluginCall) {
        val id = call.getString("id") ?: ""
        if (!valid(id)) { call.reject("Invalid key id"); return }
        delete(id)
        call.resolve()
    }
}
