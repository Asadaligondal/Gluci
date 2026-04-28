package app.gluci.mvp

import android.app.Application
import app.gluci.mvp.data.ApiModule
import coil.ImageLoader
import coil.ImageLoaderFactory

class GluciApp : Application(), ImageLoaderFactory {
    override fun newImageLoader(): ImageLoader {
        return ImageLoader.Builder(this)
            .okHttpClient(ApiModule.coilOkHttpClient())
            .crossfade(true)
            .build()
    }
}
