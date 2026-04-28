package app.gluci.mvp.screens

import app.gluci.mvp.BuildConfig

/** Maps localhost / 127.0.0.1 to the API host (e.g. 10.0.2.2 for emulator). */
fun String.reachableMediaUrl(): String {
    val apiBase = BuildConfig.API_BASE
    val host = runCatching { java.net.URI(apiBase).host }.getOrNull() ?: return this
    return this
        .replace("//localhost", "//$host")
        .replace("//127.0.0.1", "//$host")
}
