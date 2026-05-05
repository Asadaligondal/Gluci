package app.gluci.mvp

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import app.gluci.mvp.data.ApiModule
import coil.ImageLoader
import coil.ImageLoaderFactory

class GluciApp : Application(), ImageLoaderFactory {

    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            GluciFirebaseMessagingService.CHANNEL_ID,
            "Nudges",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply { description = "Daily Gluci check-in nudges" }
        nm.createNotificationChannel(channel)
    }

    override fun newImageLoader(): ImageLoader {
        return ImageLoader.Builder(this)
            .okHttpClient(ApiModule.coilOkHttpClient())
            .crossfade(true)
            .build()
    }
}
