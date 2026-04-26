package app.gluci.mvp.data

import app.gluci.mvp.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object ApiModule {
    fun api(): GluciApi {
        val log = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }
        val client = OkHttpClient.Builder()
            .connectTimeout(120, TimeUnit.SECONDS)
            .readTimeout(120, TimeUnit.SECONDS)
            .writeTimeout(120, TimeUnit.SECONDS)
            .addInterceptor(log)
            .build()
        val base = BuildConfig.API_BASE.trimEnd('/') + "/"
        return Retrofit.Builder()
            .baseUrl(base)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(GluciApi::class.java)
    }
}
