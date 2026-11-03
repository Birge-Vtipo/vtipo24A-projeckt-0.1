package kz.birge.notifications

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

class BirgeLiveNotificationsModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context), LifecycleEventListener {
  private var permissionPromise: Promise? = null
  private val preferences get() = context.getSharedPreferences("birge_live_ui", Context.MODE_PRIVATE)

  init { context.addLifecycleEventListener(this) }
  override fun getName() = "BirgeLiveNotifications"

  @ReactMethod fun deviceMetadata(promise: Promise) {
    val name = "${Build.MANUFACTURER} ${Build.MODEL}".replace(Regex("\\s+"), " ").trim().take(80)
    promise.resolve(Arguments.createMap().apply {
      putString("name", name.ifBlank { "Android" })
      putString("platform", "android")
      putString("userAgent", "Birge Android/${Build.VERSION.RELEASE} (${Build.MODEL.take(60)})")
    })
  }

  private fun permissionState(): String {
    val enabled = (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).areNotificationsEnabled()
    if (Build.VERSION.SDK_INT < 33) return if (enabled) "granted" else "denied"
    if (context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED && enabled) return "granted"
    return if (preferences.getBoolean("asked", false)) "denied" else "undetermined"
  }

  @ReactMethod fun permission(promise: Promise) { promise.resolve(permissionState()) }

  @ReactMethod fun requestPermission(promise: Promise) {
    if (permissionState() == "granted" || Build.VERSION.SDK_INT < 33) { promise.resolve(permissionState()); return }
    context.runOnUiQueueThread {
      if (permissionPromise != null) { promise.reject("PERMISSION_BUSY", "Notification permission is already being requested."); return@runOnUiQueueThread }
      val activity = context.currentActivity as? PermissionAwareActivity
      if (activity == null) { promise.reject("APP_NOT_ACTIVE", "Open Birge before enabling notifications."); return@runOnUiQueueThread }
      permissionPromise = promise
      try {
        activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 4408, PermissionListener { requestCode, _, results ->
          if (requestCode != 4408) false else {
            if (results.isNotEmpty()) preferences.edit().putBoolean("asked", true).apply()
            permissionPromise?.resolve(permissionState()); permissionPromise = null
            true
          }
        })
      } catch (_: Exception) { permissionPromise = null; promise.reject("PERMISSION_FAILED", "Could not request notification permission.") }
    }
  }

  @ReactMethod fun configure(origin: String, token: String, userId: String, promise: Promise) {
    try {
      val config = LiveCredentials.validate(origin, token, userId)
      if (permissionState() != "granted") { promise.resolve(false); return }
      val prior = LiveCredentials.load(context)
      if (prior?.accountKey != config.accountKey) BirgeLiveNotificationsService.clearAlerts(context)
      LiveCredentials.save(context, config)
      val intent = Intent(context, BirgeLiveNotificationsService::class.java)
      if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
      promise.resolve(true)
    } catch (_: Exception) {
      // Keep credentials encrypted for a later retry from an active app; never log them.
      promise.resolve(false)
    }
  }

  @ReactMethod fun stop(promise: Promise) {
    LiveCredentials.clear(context)
    context.stopService(Intent(context, BirgeLiveNotificationsService::class.java))
    BirgeLiveNotificationsService.clearAlerts(context)
    promise.resolve(null)
  }

  @ReactMethod fun setView(active: Boolean, conversationId: String) {
    LiveView.active = active
    LiveView.conversation = conversationId.take(80)
  }

  override fun onHostPause() { LiveView.active = false }
  override fun onHostResume() { /* JS supplies the visible route after resume. */ }
  override fun onHostDestroy() { LiveView.active = false; permissionPromise?.reject("APP_NOT_ACTIVE", "Birge was closed."); permissionPromise = null }
  override fun invalidate() { context.removeLifecycleEventListener(this); super.invalidate() }
}
