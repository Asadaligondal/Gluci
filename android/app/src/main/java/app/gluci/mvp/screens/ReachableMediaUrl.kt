package app.gluci.mvp.screens

import app.gluci.mvp.BuildConfig

/** Resolves relative / localhost URLs for Coil; leaves content:// and file:// unchanged. */
fun String.reachableMediaUrl(): String {
    if (startsWith("content:") || startsWith("file:") || startsWith("android.resource:")) return this
    val trimmedBase = BuildConfig.API_BASE.trim().trimEnd('/')
    val s = when {
        startsWith("http://") || startsWith("https://") -> this
        startsWith("/") -> "$trimmedBase$this"
        else -> this
    }
    val host = runCatching { java.net.URI(trimmedBase).host }.getOrNull() ?: return s
    return s
        .replace("//localhost", "//$host")
        .replace("//127.0.0.1", "//$host")
}
