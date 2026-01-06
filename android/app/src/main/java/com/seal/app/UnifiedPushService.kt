package com.seal.app

import android.content.Context
import android.util.Log
import org.unifiedpush.android.connector.FailedReason
import org.unifiedpush.android.connector.PushService
import org.unifiedpush.android.connector.data.PushEndpoint
import org.unifiedpush.android.connector.data.PushMessage

/**
 * UnifiedPush service that receives push notifications from distributors like ntfy.
 * This runs even when the app is closed.
 */
class UnifiedPushService : PushService() {
    companion object {
        private const val TAG = "UnifiedPushService"
    }

    override fun onNewEndpoint(endpoint: PushEndpoint, instance: String) {
        val endpointUrl = endpoint.url
        Log.d(TAG, "New endpoint received: $endpointUrl")
        // Store the endpoint to send to our push server
        val prefs = applicationContext.getSharedPreferences("unified_push", Context.MODE_PRIVATE)
        prefs.edit()
            .putString("endpoint", endpointUrl)
            .putString("instance", instance)
            .apply()

        // Notify the JavaScript side if the app is running
        UnifiedPushPlugin.notifyEndpoint(endpointUrl)
    }

    override fun onMessage(message: PushMessage, instance: String) {
        Log.d(TAG, "Push message received")

        // Show notification using Android's notification system
        val content = String(message.content)
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
