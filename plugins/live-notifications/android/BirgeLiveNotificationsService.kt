package kz.birge.notifications

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.atomic.AtomicInteger

class BirgeLiveNotificationsService : Service() {
  companion object {
    private const val ONGOING = 22021
    private const val CONNECTION = "birge_connection_v1"
    private const val MESSAGES = "birge_messages_v1"
    private const val SOCIAL = "birge_social_v1"
    private const val SECURITY = "birge_security_v1"
    private const val STOP = "kz.birge.notifications.STOP"
    private const val MAX_JSON = 512 * 1024
    private const val ALERT_PREFIX = "birge-live:"

    fun clearAlerts(context: Context) {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.activeNotifications.filter { it.tag?.startsWith(ALERT_PREFIX) == true }.forEach { manager.cancel(it.tag, it.id) }
    }
  }

  private val generation = AtomicInteger(0)
  private val main = Handler(Looper.getMainLooper())
  @Volatile private var eventConnection: HttpURLConnection? = null
  @Volatile private var jsonConnection: HttpURLConnection? = null
  private var worker: Thread? = null
  private var runningConfig: LiveConfig? = null
  private var startupThreshold = System.currentTimeMillis() - 10_000L
  private val manager get() = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  private val history get() = getSharedPreferences("birge_live_history", Context.MODE_PRIVATE)

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() { super.onCreate(); createChannels() }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == STOP) {
      LiveCredentials.clear(this); clearAlerts(this); stopSelf(); return START_NOT_STICKY
    }
    val config = LiveCredentials.load(this)
    if (config == null || !notificationsAllowed()) { stopSelf(); return START_NOT_STICKY }
    try {
      val ongoing = ongoingNotification()
      if (Build.VERSION.SDK_INT >= 34) startForeground(ONGOING, ongoing, ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING)
      else startForeground(ONGOING, ongoing)
    } catch (_: Exception) { stopSelf(); return START_NOT_STICKY }
    if (runningConfig == config && worker?.isAlive == true) return START_STICKY
    stopWorker()
    runningConfig = config
    startupThreshold = System.currentTimeMillis() - 10_000L
    val current = generation.get()
    worker = Thread({ listen(config, current) }, "BirgeLiveNotifications").apply { isDaemon = true; start() }
    return START_STICKY
  }

  override fun onDestroy() {
    stopWorker()
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  private fun stopWorker() {
    generation.incrementAndGet()
    eventConnection?.disconnect(); jsonConnection?.disconnect()
    eventConnection = null; jsonConnection = null
    worker?.interrupt(); worker = null
    runningConfig = null
  }

  private fun active(value: Int) = generation.get() == value && !Thread.currentThread().isInterrupted
  private fun notificationsAllowed() = manager.areNotificationsEnabled() && (Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)

  private class SessionExpired : Exception()
  private fun expire(config: LiveConfig, value: Int): Nothing {
    main.post {
      if (generation.get() == value && LiveCredentials.load(this) == config) {
        LiveCredentials.clear(this); clearAlerts(this); stopSelf()
      }
    }
    throw SessionExpired()
  }

  private fun open(config: LiveConfig, route: String, poll: Boolean): HttpURLConnection {
    return (URL(config.origin + route).openConnection() as HttpURLConnection).apply {
      requestMethod = "GET"
      instanceFollowRedirects = false
      connectTimeout = 15_000
      readTimeout = if (poll) 70_000 else 20_000
      useCaches = false
      setRequestProperty("Authorization", "Bearer ${config.token}")
      setRequestProperty("Accept", "application/json")
      setRequestProperty("Cache-Control", "no-cache")
    }
  }

  private fun listen(config: LiveConfig, value: Int) {
    var delay = 1_000L
    while (active(value)) {
      var connection: HttpURLConnection? = null
      try {
        val cursor = history.getString("${config.accountKey}:cursor", null)?.toLongOrNull()?.takeIf { it >= 0 }
        val route = "/social/events?transport=poll" + if (cursor == null) "" else "&after=$cursor"
        connection = open(config, route, true)
        eventConnection = connection
        val started = SystemClock.elapsedRealtime()
        val status = connection.responseCode
        if (status == 401) expire(config, value)
        check(status == 200 && connection.contentType.orEmpty().startsWith("application/json"))
        val event = readJson(connection, 4096)
        val id = (event.opt("id") as? Number)?.toLong() ?: error("Invalid event cursor")
        check(id >= 0)
        if (!active(value)) return
        when (event.optString("type")) {
          "change" -> {
            pull(config, value)
            // Advance only after notification processing succeeds, so reconnects can retry.
            if (active(value)) history.edit().putString("${config.accountKey}:cursor", id.toString()).commit()
          }
          "heartbeat" -> {
            check(cursor != null && id == cursor)
            // A valid idle poll is held by the server; reject broken instant-heartbeat loops.
            check(SystemClock.elapsedRealtime() - started >= 1000L)
          }
          else -> error("Invalid event response")
        }
        delay = 1_000L
        continue
      } catch (_: SessionExpired) { return }
      catch (_: Exception) { /* Network failures reconnect without exposing URLs, tokens or content. */ }
      finally {
        connection?.disconnect()
        if (eventConnection === connection) eventConnection = null
      }
      if (!active(value)) return
      try { Thread.sleep(delay) } catch (_: InterruptedException) { return }
      delay = (delay * 2).coerceAtMost(30_000L)
    }
  }

  private fun readJson(connection: HttpURLConnection, maximum: Int): JSONObject {
    check(connection.contentLengthLong <= maximum)
    val bytes = ByteArrayOutputStream()
    connection.inputStream.use { input ->
      val buffer = ByteArray(8192)
      while (true) {
        val length = input.read(buffer)
        if (length < 0) break
        check(bytes.size() + length <= maximum)
        bytes.write(buffer, 0, length)
      }
    }
    return JSONObject(bytes.toString("UTF-8"))
  }

  private fun pull(config: LiveConfig, value: Int) {
    if (!active(value)) return
    val connection = open(config, "/social/notifications", false)
    jsonConnection = connection
    try {
      val status = connection.responseCode
      if (status == 401) expire(config, value)
      check(status == 200)
      val notifications = readJson(connection, MAX_JSON)
      if (active(value)) process(config, notifications, value)
    } finally {
      connection.disconnect()
      if (jsonConnection === connection) jsonConnection = null
    }
  }

  private fun createdAt(item: JSONObject): Long {
    val date = item.optString("created_at")
    return try { SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC"); isLenient = false }.parse(date)?.time ?: 0 }
    catch (_: Exception) { 0 }
  }

  private fun process(config: LiveConfig, data: JSONObject, value: Int) {
    val account = config.accountKey
    val seen = linkedSetOf<String>()
    try {
      val stored = JSONArray(history.getString("$account:seen", "[]"))
      for (index in 0 until stored.length().coerceAtMost(200)) seen.add(stored.getString(index))
    } catch (_: Exception) { seen.clear() }
    val initialized = history.getBoolean("$account:initialized", false)
    val items = data.optJSONArray("notifications") ?: JSONArray()
    val preferences = data.optJSONObject("preferences") ?: JSONObject()
    val candidates = mutableListOf<JSONObject>()
    for (index in 0 until items.length().coerceAtMost(200)) {
      val item = items.optJSONObject(index) ?: continue
      val id = item.optString("id").take(128)
      if (id.isBlank() || !seen.add(id)) continue
      if (!item.isNull("read_at") || item.optBoolean("read", false)) continue
      if (!initialized && createdAt(item) < startupThreshold) continue
      val type = item.optString("type")
      val allowed = when (type) {
        "message", "group_message" -> preferences.optBoolean("messages", true)
        "follow" -> preferences.optBoolean("follows", true)
        "login" -> preferences.optBoolean("logins", true)
        else -> false
      }
      if (!allowed) continue
      if ((type == "message" || type == "group_message") && LiveView.active && LiveView.conversation == item.optString("conversation_id")) continue
      candidates.add(item)
    }
    if (!active(value)) return
    // Retain only IDs, scoped by a hash of account + origin. Credentials live elsewhere encrypted.
    history.edit().putString("$account:seen", JSONArray(seen.toList().takeLast(200)).toString()).putBoolean("$account:initialized", true).commit()
    if (!notificationsAllowed()) { main.post { if (generation.get() == value) stopSelf() }; return }
    candidates.sortedBy { createdAt(it) }.takeLast(10).forEach { if (active(value)) show(config, it) }
  }

  private fun icon(): Int = resources.getIdentifier("birge_live_notification", "drawable", packageName).takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info
  private fun builder(channel: String): Notification.Builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, channel) else Notification.Builder(this)
  private fun clean(value: String, maximum: Int) = value.replace(Regex("[\\p{Cc}\\p{Cf}]"), " ").take(maximum)

  private fun pending(item: JSONObject?): PendingIntent {
    val route = Uri.Builder().scheme("birge").authority("")
    when (item?.optString("type")) {
      "message", "group_message" -> route.path("/messages").appendQueryParameter("conversation", item.optString("conversation_id").take(80))
      "follow" -> {
        val actor = item.optString("actor_id").ifBlank { item.optString("sender_id") }
        route.path(if (Regex("^[a-fA-F0-9-]{36}$").matches(actor)) "/user/$actor" else "/notifications")
      }
      "login" -> route.path("/settings")
      else -> route.path("/notifications")
    }
    if (item != null) route.appendQueryParameter("notification", item.optString("id").take(128))
    val intent = packageManager.getLaunchIntentForPackage(packageName) ?: Intent().setPackage(packageName)
    intent.action = Intent.ACTION_VIEW
    intent.data = route.build()
    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
    return PendingIntent.getActivity(this, item?.optString("id")?.hashCode() ?: ONGOING, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun ongoingNotification(): Notification {
    val stop = PendingIntent.getService(this, ONGOING, Intent(this, BirgeLiveNotificationsService::class.java).setAction(STOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification = builder(CONNECTION).setSmallIcon(icon()).setContentTitle("Birge")
      .setContentText("Хабарландыру байланысы қосулы · Уведомления подключены")
      .setContentIntent(pending(null)).setOngoing(true).setOnlyAlertOnce(true)
      .setVisibility(Notification.VISIBILITY_PRIVATE).setCategory(Notification.CATEGORY_SERVICE)
      .setShowWhen(false).setSound(null).setDefaults(0)
      .addAction(Notification.Action.Builder(null, "Тоқтату / Отключить", stop).build())
    if (Build.VERSION.SDK_INT >= 31) notification.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
    return notification.build()
  }

  private fun show(config: LiveConfig, item: JSONObject) {
    val type = item.optString("type")
    val channel = when (type) { "message", "group_message" -> MESSAGES; "login" -> SECURITY; else -> SOCIAL }
    val title = clean(item.optString("title", "Birge"), 100)
    val body = clean(item.optString("body", "Жаңа хабарландыру / Новое уведомление"), 240)
    val public = builder(channel).setSmallIcon(icon()).setContentTitle("Birge").setContentText("Жаңа хабарландыру / Новое уведомление").setVisibility(Notification.VISIBILITY_PRIVATE).build()
    val notification = builder(channel).setSmallIcon(icon()).setContentTitle(title).setContentText(body)
      .setStyle(Notification.BigTextStyle().bigText(body)).setContentIntent(pending(item))
      .setColor(Color.rgb(57, 49, 133)).setAutoCancel(true).setOnlyAlertOnce(true)
      .setVisibility(Notification.VISIBILITY_PRIVATE).setPublicVersion(public)
      .setCategory(if (type == "message" || type == "group_message") Notification.CATEGORY_MESSAGE else Notification.CATEGORY_SOCIAL)
      .build()
    manager.notify("$ALERT_PREFIX${config.accountKey}:${item.optString("id").take(128)}", 0, notification)
  }

  private fun createChannels() {
    if (Build.VERSION.SDK_INT < 26) return
    val connection = NotificationChannel(CONNECTION, "Birge байланысы / Соединение", NotificationManager.IMPORTANCE_LOW).apply {
      description = "Фондық хабарландыру байланысы / Фоновое соединение уведомлений"
      setSound(null, null); enableVibration(false); setShowBadge(false); lockscreenVisibility = Notification.VISIBILITY_PRIVATE
    }
    val messages = NotificationChannel(MESSAGES, "Хабарламалар / Сообщения", NotificationManager.IMPORTANCE_HIGH).apply { lockscreenVisibility = Notification.VISIBILITY_PRIVATE }
    val social = NotificationChannel(SOCIAL, "Жазылушылар / Подписчики", NotificationManager.IMPORTANCE_DEFAULT).apply { lockscreenVisibility = Notification.VISIBILITY_PRIVATE }
    val security = NotificationChannel(SECURITY, "Аккаунт қауіпсіздігі / Безопасность", NotificationManager.IMPORTANCE_DEFAULT).apply { lockscreenVisibility = Notification.VISIBILITY_PRIVATE }
    manager.createNotificationChannels(listOf(connection, messages, social, security))
  }
}
