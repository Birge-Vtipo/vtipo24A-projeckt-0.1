package kz.birge.notifications

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.net.URI
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal data class LiveConfig(val origin: String, val token: String, val userId: String) {
  val accountKey: String get() = MessageDigest.getInstance("SHA-256").digest("$origin|$userId".toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
}

internal object LiveCredentials {
  private const val ALIAS = "birge.live.notifications.v1"
  private const val PREFERENCES = "birge_live_credentials"

  fun validate(origin: String, token: String, userId: String): LiveConfig {
    val uri = URI(origin)
    require(uri.scheme == "https" && !uri.host.isNullOrBlank() && uri.userInfo == null && uri.query == null && uri.fragment == null && (uri.path.isNullOrEmpty() || uri.path == "/"))
    require(Regex("^[A-Za-z0-9_-]{43}$").matches(token))
    require(Regex("^[a-fA-F0-9-]{36}$").matches(userId))
    return LiveConfig(origin.trimEnd('/'), token, userId)
  }

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true)
        .build())
    }.generateKey()
  }

  @Synchronized fun save(context: Context, config: LiveConfig) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key())
    cipher.updateAAD(context.packageName.toByteArray(Charsets.UTF_8))
    val json = JSONObject().put("origin", config.origin).put("token", config.token).put("userId", config.userId)
    val encrypted = cipher.doFinal(json.toString().toByteArray(Charsets.UTF_8))
    check(context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit()
      .putString("cipher", Base64.encodeToString(encrypted, Base64.NO_WRAP))
      .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP)).commit())
  }

  @Synchronized fun load(context: Context): LiveConfig? {
    val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    val data = preferences.getString("cipher", null) ?: return null
    return try {
      require(data.length <= 8192)
      val iv = Base64.decode(preferences.getString("iv", ""), Base64.NO_WRAP)
      require(iv.size == 12)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
      cipher.updateAAD(context.packageName.toByteArray(Charsets.UTF_8))
      val json = JSONObject(String(cipher.doFinal(Base64.decode(data, Base64.NO_WRAP)), Charsets.UTF_8))
      validate(json.getString("origin"), json.getString("token"), json.getString("userId"))
    } catch (_: Exception) {
      preferences.edit().clear().commit()
      null
    }
  }

  @Synchronized fun clear(context: Context) { context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().clear().commit() }
}

internal object LiveView {
  @Volatile var active = false
  @Volatile var conversation = ""
}
