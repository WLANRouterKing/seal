package com.seal.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.unifiedpush.android.connector.UnifiedPush

@CapacitorPlugin(name = "UnifiedPush")
class UnifiedPushPlugin : Plugin() {
    companion object {
        private const val TAG = "UnifiedPushPlugin"
        private const val CHANNEL_ID = "seal_messages"
        private const val NOTIFICATION_ID = 1001

        // Static reference for callbacks from the service
        private var pluginInstance: UnifiedPushPlugin? = null

        fun notifyEndpoint(endpoint: String) {
            pluginInstance?.let { plugin ->
                val data = JSObject()
                data.put("endpoint", endpoint)
                plugin.notifyListeners("onEndpoint", data)
            }
        }

        fun notifyRegistrationFailed(reason: String) {
            pluginInstance?.let { plugin ->
                val data = JSObject()
                data.put("reason", reason)
                plugin.notifyListeners("onRegistrationFailed", data)
            }
        }

        fun notifyUnregistered() {
            pluginInstance?.let { plugin ->
                plugin.notifyListeners("onUnregistered", JSObject())
            }
        }

        fun handlePushMessage(context: Context, content: String) {
            Log.d(TAG, "Handling push message: $content")

            // Try to notify the JavaScript side
            pluginInstance?.let { plugin ->
                val data = JSObject()
                data.put("message", content)
                plugin.notifyListeners("onMessage", data)
            }

            // Always show a notification (app might be closed)
            showNotification(context, content)
        }

        private fun showNotification(context: Context, content: String) {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // Create notification channel for Android 8.0+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Seal Messages",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Notifications for new messages"
                    enableVibration(true)
                }
                notificationManager.createNotificationChannel(channel)
            }

            // Create intent to open the app
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // Parse the message content (expects JSON from push server)
            val title: String
            val body: String
            try {
                val json = org.json.JSONObject(content)
                title = json.optString("title", "Seal")
                body = json.optString("message", "New message")
            } catch (e: Exception) {
                title = "Seal"
                body = "New message"
            }

            // Build and show notification
            val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setVibrate(longArrayOf(0, 250, 250, 250))
                .build()

            notificationManager.notify(NOTIFICATION_ID, notification)
        }
    }

    override fun load() {
        pluginInstance = this
        Log.d(TAG, "UnifiedPush plugin loaded")
    }

    @PluginMethod
    fun register(call: PluginCall) {
        val context = activity ?: run {
            call.reject("No activity available")
            return
        }

        try {
            // Check if a distributor is available
            val distributors = UnifiedPush.getDistributors(context)

            if (distributors.isEmpty()) {
                call.reject("No UnifiedPush distributor found. Please install ntfy app.")
                return
            }

            // Use the first available distributor (usually ntfy)
            val distributor = distributors.first()
            UnifiedPush.saveDistributor(context, distributor)
            UnifiedPush.register(context)

            val result = JSObject()
            result.put("distributor", distributor)
            call.resolve(result)

            Log.d(TAG, "Registered with distributor: $distributor")
        } catch (e: Exception) {
            Log.e(TAG, "Registration failed", e)
            call.reject("Registration failed: ${e.message}")
        }
    }

    @PluginMethod
    fun unregister(call: PluginCall) {
        val context = activity ?: run {
            call.reject("No activity available")
            return
        }

        try {
            UnifiedPush.unregister(context)
            call.resolve()
            Log.d(TAG, "Unregistered from UnifiedPush")
        } catch (e: Exception) {
            Log.e(TAG, "Unregister failed", e)
            call.reject("Unregister failed: ${e.message}")
        }
    }

    @PluginMethod
    fun getEndpoint(call: PluginCall) {
        val context = activity ?: run {
            call.reject("No activity available")
            return
        }

        val prefs = context.getSharedPreferences("unified_push", Context.MODE_PRIVATE)
        val endpoint = prefs.getString("endpoint", null)

        val result = JSObject()
        result.put("endpoint", endpoint)
        call.resolve(result)
    }

    @PluginMethod
    fun getDistributors(call: PluginCall) {
        val context = activity ?: run {
            call.reject("No activity available")
            return
        }

        val distributors = UnifiedPush.getDistributors(context)

        val result = JSObject()
        result.put("distributors", distributors.toTypedArray())
        result.put("count", distributors.size)
        call.resolve(result)
    }

    @PluginMethod
    fun isRegistered(call: PluginCall) {
        val context = activity ?: run {
            call.reject("No activity available")
            return
        }

        val prefs = context.getSharedPreferences("unified_push", Context.MODE_PRIVATE)
        val endpoint = prefs.getString("endpoint", null)

        val result = JSObject()
        result.put("registered", endpoint != null)
        call.resolve(result)
    }
}
