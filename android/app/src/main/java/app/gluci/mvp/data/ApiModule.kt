package app.gluci.mvp.data

import android.util.Log
import app.gluci.mvp.BuildConfig
import okhttp3.Dns
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.dnsoverhttps.DnsOverHttps
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.net.InetAddress
import java.util.concurrent.TimeUnit

object ApiModule {
    /** System DNS first; if it fails (e.g. flaky emulator DNS), fall back to Cloudflare DNS-over-HTTPS. */
    private fun buildResilientDns(): Dns {
        val bootstrap = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()
        val doh = DnsOverHttps.Builder()
            .client(bootstrap)
            .url("https://1.1.1.1/dns-query".toHttpUrl())
            .bootstrapDnsHosts(
                InetAddress.getByName("1.1.1.1"),
                InetAddress.getByName("1.0.0.1"),
            )
            .includeIPv6(false)
            .build()
        return object : Dns {
            override fun lookup(hostname: String): List<InetAddress> {
                return try {
                    Dns.SYSTEM.lookup(hostname)
                } catch (e: Exception) {
                    Log.w("GluciApi", "System DNS failed for $hostname, falling back to DoH: ${e.message}")
                    doh.lookup(hostname)
                }
            }
        }
    }

    fun api(): GluciApi {
        val log = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }
        val client = OkHttpClient.Builder()
            .dns(buildResilientDns())
            .connectTimeout(120, TimeUnit.SECONDS)
            .readTimeout(120, TimeUnit.SECONDS)
            .writeTimeout(120, TimeUnit.SECONDS)
            .addInterceptor(log)
            .build()
        val base = BuildConfig.API_BASE.trim().trimEnd('/') + "/"
        if (BuildConfig.DEBUG) {
            Log.d("GluciApi", "baseUrl=$base")
        }
        return Retrofit.Builder()
            .baseUrl(base)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(GluciApi::class.java)
    }
}
