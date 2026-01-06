package com.seal.app

import android.content.Context
import android.util.Log
import org.unifiedpush.android.connector.FailedReason
import org.unifiedpush.android.connector.PushMessage
import org.unifiedpush.android.connector.PushService

/**
 * UnifiedPush service that receives push notifications from distributors like ntfy.
 * This runs even when the app is closed.
 */
class UnifiedPushService : PushService() {
    companion object {
        private const val TAG = "UnifiedPushService"
    }

    override fun onNewEndpoint(endpoint: String, instance: String) {
        Log.d(TAG, "New endpoint received: $endpoint")
        // Store the endpoint to send to our push server
        val prefs = applicationContext.getSharedPreferences("unified_push", Context.MODE_PRIVATE)
        prefs.edit()
            .putString("endpoint", endpoint)
            .putString("instance", instance)
            .apply()

        // Notify the JavaScript side if the app is running
        UnifiedPushPlugin.notifyEndpoint(endpoint)
    }

    override fun onMessage(message: PushMessage, instance: String) {
        Log.d(TAG, "Push message received")

        // Show notification using Android's notification system
        val content = message.content.decodeToString()
        UnifiedPushPlugin.handlePushMessage(applicationContext, content)
    }

    override fun onRegistrationFailed(reason: FailedReason, instance: String) {
        Log.e(TAG, "Registration failed: $reason")
        UnifiedPushPlugin.notifyRegistrationFailed(reason.toString())
    }

    override fun onUnregistered(instance: String) {
        Log.d(TAG, "Unregistered from UnifiedPush")
        val prefs = applicationContext.getSharedPreferences("unified_push", Context.MODE_PRIVATE)
        prefs.edit()
            .remove("endpoint")
            .remove("instance")
            .apply()

        UnifiedPushPlugin.notifyUnregistered()
    }
}
