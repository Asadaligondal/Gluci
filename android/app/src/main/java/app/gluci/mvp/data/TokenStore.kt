package app.gluci.mvp.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore("gluci")

class TokenStore(private val context: Context) {
    private val key = stringPreferencesKey("auth_token")

    val token: Flow<String?> = context.dataStore.data.map { it[key] }

    suspend fun setToken(t: String) {
        context.dataStore.edit { it[key] = t }
    }

    suspend fun clear() {
        context.dataStore.edit { it.remove(key) }
    }
}
