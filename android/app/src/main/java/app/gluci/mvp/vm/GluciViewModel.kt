package app.gluci.mvp.vm

import android.app.Application
import android.net.Uri
import android.util.Base64
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.gluci.mvp.data.ApiModule
import app.gluci.mvp.data.AuthRequest
import app.gluci.mvp.data.ChatRequest
import app.gluci.mvp.data.CreateConversationRequest
import app.gluci.mvp.data.ConversationDto
import app.gluci.mvp.data.ProfilePatch
import app.gluci.mvp.data.TokenStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

data class UiMessage(
    val role: String,
    val content: String,
)

class GluciViewModel(app: Application) : AndroidViewModel(app) {
    private val store = TokenStore(app.applicationContext)
    private val api = ApiModule.api()

    private val _token = MutableStateFlow<String?>(null)
    val token: StateFlow<String?> = _token.asStateFlow()

    private val _conversations = MutableStateFlow<List<ConversationDto>>(emptyList())
    val conversations: StateFlow<List<ConversationDto>> = _conversations.asStateFlow()

    private val _currentConversationId = MutableStateFlow<String?>(null)
    val currentConversationId: StateFlow<String?> = _currentConversationId.asStateFlow()

    private val _messages = MutableStateFlow<List<UiMessage>>(emptyList())
    val messages: StateFlow<List<UiMessage>> = _messages.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private val _usage = MutableStateFlow<Pair<Int, Int>?>(null)
    val usage: StateFlow<Pair<Int, Int>?> = _usage.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    var pendingFirstMessage: String? = null

    init {
        viewModelScope.launch {
            store.token.collect { _token.value = it }
        }
    }

    suspend fun getTokenOnce(): String? = store.token.first()

    fun onSessionStart() {
        viewModelScope.launch {
            if (store.token.first() != null) {
                refreshConversations()
                refreshUsage()
            }
        }
    }

    fun refreshConversations() {
        val t = _token.value ?: return
        viewModelScope.launch {
            try {
                val r = api.listConversations("Bearer $t")
                _conversations.value = r.conversations
            } catch (e: Exception) {
                _error.value = e.message
            }
        }
    }

    fun refreshUsage() {
        val t = _token.value ?: return
        viewModelScope.launch {
            try {
                val u = api.usage("Bearer $t")
                _usage.value = u.freeChecksUsed to u.freeLimit
            } catch (_: Exception) { /* ignore */ }
        }
    }

    fun signUp(email: String, password: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _busy.value = true
            _error.value = null
            try {
                val r = api.signup(AuthRequest(email.trim(), password))
                store.setToken(r.token)
                onSuccess()
                refreshConversations()
                refreshUsage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Sign up failed"
            } finally {
                _busy.value = false
            }
        }
    }

    fun signIn(email: String, password: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _busy.value = true
            _error.value = null
            try {
                val r = api.login(AuthRequest(email.trim(), password))
                store.setToken(r.token)
                onSuccess()
                refreshConversations()
                refreshUsage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Sign in failed"
            } finally {
                _busy.value = false
            }
        }
    }

    fun signOut(onDone: () -> Unit) {
        viewModelScope.launch {
            store.clear()
            _conversations.value = emptyList()
            _messages.value = emptyList()
            _currentConversationId.value = null
            onDone()
        }
    }

    fun createConversation(
        title: String? = null,
        onCreated: (String) -> Unit,
    ) {
        val t = _token.value ?: return
        viewModelScope.launch {
            _busy.value = true
            _error.value = null
            try {
                val c = api.createConversation("Bearer $t", CreateConversationRequest(title = title))
                _currentConversationId.value = c.id
                _messages.value = emptyList()
                refreshConversations()
                onCreated(c.id)
            } catch (e: Exception) {
                _error.value = e.message ?: "Could not start chat"
            } finally {
                _busy.value = false
            }
        }
    }

    fun openConversation(
        id: String,
        onReady: () -> Unit,
    ) {
        _currentConversationId.value = id
        viewModelScope.launch {
            _busy.value = true
            _error.value = null
            try {
                val t = _token.value!!
                val h = api.history("Bearer $t", id)
                _messages.value = h.messages.map { UiMessage(it.role, it.content) }
                onReady()
                val p = pendingFirstMessage
                if (p != null) {
                    pendingFirstMessage = null
                    sendText(p)
                }
            } catch (e: Exception) {
                _error.value = e.message ?: "Load failed"
            } finally {
                _busy.value = false
            }
        }
    }

    fun newChatWithQuickHint(
        hint: String,
        onCreated: (String) -> Unit,
    ) {
        pendingFirstMessage = hint
        createConversation(
            title = when {
                hint.contains("restaurant", true) -> "Restaurant"
                hint.contains("barcode", true) || hint.contains("grocery", true) -> "Grocery"
                else -> "Check a meal"
            },
            onCreated = onCreated,
        )
    }

    fun sendText(
        text: String,
    ) {
        val t = _token.value ?: return
        val conv = _currentConversationId.value ?: return
        if (text.isBlank()) return
        viewModelScope.launch {
            _busy.value = true
            _error.value = null
            try {
                val out = api.chat(
                    "Bearer $t",
                    ChatRequest(conversationId = conv, text = text.trim()),
                )
                appendLocalTurn(text.trim(), out.reply)
                refreshConversations()
                refreshUsage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Chat failed"
            } finally {
                _busy.value = false
            }
        }
    }

    fun sendImage(uri: Uri, caption: String?) {
        val t = _token.value ?: return
        val conv = _currentConversationId.value ?: return
        viewModelScope.launch {
            _busy.value = true
            _error.value = null
            try {
                val (b64, mime) = readImageBase64(uri)
                val out = api.chat(
                    "Bearer $t",
                    ChatRequest(
                        conversationId = conv,
                        text = caption,
                        imageBase64 = b64,
                        mimeType = mime,
                    ),
                )
                appendLocalTurn(caption ?: "(photo)", out.reply)
                refreshConversations()
                refreshUsage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Upload failed"
            } finally {
                _busy.value = false
            }
        }
    }

    fun sendBarcode(
        code: String,
        note: String?,
    ) {
        val t = _token.value ?: return
        val conv = _currentConversationId.value ?: return
        viewModelScope.launch {
            _busy.value = true
            _error.value = null
            try {
                val text = listOfNotNull(note, "Barcode: $code").joinToString("\n")
                val out = api.chat(
                    "Bearer $t",
                    ChatRequest(conversationId = conv, text = text, barcode = code),
                )
                appendLocalTurn(text, out.reply)
                refreshConversations()
                refreshUsage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Chat failed"
            } finally {
                _busy.value = false
            }
        }
    }

    fun setGoal(goal: String) {
        val t = _token.value ?: return
        viewModelScope.launch {
            try {
                api.patchProfile("Bearer $t", ProfilePatch(goal = goal))
            } catch (_: Exception) { /* ignore */ }
        }
    }

    private fun appendLocalTurn(
        user: String,
        assistant: String,
    ) {
        val cur = _messages.value.toMutableList()
        cur.add(UiMessage("user", user))
        cur.add(UiMessage("assistant", assistant))
        _messages.value = cur
    }

    private fun readImageBase64(uri: Uri): Pair<String, String> {
        val ctx = getApplication<Application>().contentResolver
        val input = ctx.openInputStream(uri) ?: throw IllegalStateException("Cannot open image")
        val bytes = input.use { it.readBytes() }
        val mime = ctx.getType(uri) ?: "image/jpeg"
        val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
        return b64 to mime
    }
}
