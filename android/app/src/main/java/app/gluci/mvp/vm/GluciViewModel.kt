package app.gluci.mvp.vm

import android.app.Application
import android.net.Uri
import android.util.Base64
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.gluci.mvp.data.ApiModule
import app.gluci.mvp.data.AuthRequest
import app.gluci.mvp.data.BillingStatusResponse
import app.gluci.mvp.data.ChatRequest
import app.gluci.mvp.data.CreateConversationRequest
import app.gluci.mvp.data.ConversationDto
import app.gluci.mvp.data.ProfilePatch
import app.gluci.mvp.data.ProfileResponse
import app.gluci.mvp.data.TokenStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import retrofit2.HttpException
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class UiMessage(
    val role: String,
    val content: String,
    val score: Double? = null,
    val verdict: String? = null,
    val intent: String? = null,
    val shareCardUrl: String? = null,
    val createdAtMs: Long? = null,
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

    private val _billing = MutableStateFlow<BillingStatusResponse?>(null)
    val billing: StateFlow<BillingStatusResponse?> = _billing.asStateFlow()

    private val _profile = MutableStateFlow<ProfileResponse?>(null)
    val profile: StateFlow<ProfileResponse?> = _profile.asStateFlow()

    private val _paywallUrl = MutableStateFlow<String?>(null)
    val paywallUrl: StateFlow<String?> = _paywallUrl.asStateFlow()

    private val _showPaywall = MutableStateFlow(false)
    val showPaywall: StateFlow<Boolean> = _showPaywall.asStateFlow()

    private val _sessionExpired = MutableStateFlow(false)
    val sessionExpired: StateFlow<Boolean> = _sessionExpired.asStateFlow()

    var pendingFirstMessage: String? = null

    init {
        viewModelScope.launch {
            store.token.collect { _token.value = it }
        }
    }

    suspend fun getTokenOnce(): String? = store.token.first()

    fun acknowledgeSessionExpired() {
        _sessionExpired.value = false
    }

    private fun isUnauthorized(e: Throwable): Boolean =
        e is HttpException && e.code() == 401

    private suspend fun handleUnauthorized() {
        store.clear()
        _token.value = null
        _conversations.value = emptyList()
        _messages.value = emptyList()
        _currentConversationId.value = null
        _billing.value = null
        _profile.value = null
        _usage.value = null
        _error.value = null
        _sessionExpired.value = true
    }

    fun onSessionStart() {
        viewModelScope.launch {
            if (store.token.first() != null) {
                refreshConversations()
                refreshUsage()
                refreshBilling()
                refreshProfile()
            }
        }
    }

    fun refreshProfile() {
        val t = _token.value ?: return
        viewModelScope.launch {
            try {
                _profile.value = api.getProfile("Bearer $t")
            } catch (e: Exception) {
                if (isUnauthorized(e)) handleUnauthorized()
            }
        }
    }

    fun refreshBilling() {
        val t = _token.value ?: return
        viewModelScope.launch {
            try {
                _billing.value = api.billingStatus("Bearer $t")
            } catch (e: Exception) {
                if (isUnauthorized(e)) handleUnauthorized()
            }
        }
    }

    fun startCheckout(onUrl: (String) -> Unit) {
        val t = _token.value ?: return
        if (_billing.value?.stripeConfigured != true) {
            _error.value = "Stripe billing is not configured on the server yet."
            return
        }
        viewModelScope.launch {
            _busy.value = true
            _error.value = null
            try {
                val r = api.checkout("Bearer $t")
                val url = r.url
                if (url != null) {
                    _paywallUrl.value = url
                    onUrl(url)
                } else {
                    _error.value = "Could not start checkout"
                }
            } catch (e: Exception) {
                _error.value = e.message ?: "Checkout failed"
            } finally {
                _busy.value = false
            }
        }
    }

    fun openBillingPortal(onUrl: (String) -> Unit) {
        val t = _token.value ?: return
        viewModelScope.launch {
            _busy.value = true
            _error.value = null
            try {
                val r = api.billingPortal("Bearer $t")
                val url = r.url
                if (url != null) onUrl(url) else _error.value = "Could not open billing portal"
            } catch (e: Exception) {
                _error.value = e.message ?: "Billing portal failed"
            } finally {
                _busy.value = false
            }
        }
    }

    fun dismissPaywall() {
        _showPaywall.value = false
    }

    fun showPaywallSheet() {
        _showPaywall.value = true
    }

    fun refreshConversations() {
        val t = _token.value ?: return
        viewModelScope.launch {
            try {
                val r = api.listConversations("Bearer $t")
                _conversations.value = r.conversations
            } catch (e: Exception) {
                if (isUnauthorized(e)) handleUnauthorized() else _error.value = e.message
            }
        }
    }

    fun refreshUsage() {
        val t = _token.value ?: return
        viewModelScope.launch {
            try {
                val u = api.usage("Bearer $t")
                _usage.value = u.freeChecksUsed to u.freeLimit
            } catch (e: Exception) {
                if (isUnauthorized(e)) handleUnauthorized()
            }
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
                _error.value = when {
                    e is HttpException && e.code() == 409 ->
                        "An account with that email already exists. Try signing in instead."
                    e is HttpException && e.code() == 400 ->
                        "Please enter a valid email and a password of at least 6 characters."
                    else -> e.message ?: "Sign up failed"
                }
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
                _error.value = when {
                    e is HttpException && (e.code() == 401 || e.code() == 400) ->
                        "Wrong email or password."
                    else -> e.message ?: "Sign in failed"
                }
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
                if (isUnauthorized(e)) handleUnauthorized()
                else _error.value = e.message ?: "Could not start chat"
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
                _messages.value = h.messages.map {
                    UiMessage(
                        role = it.role,
                        content = it.content,
                        score = it.score,
                        verdict = it.verdict,
                        intent = it.intent,
                        shareCardUrl = it.shareCardUrl,
                    )
                }
                onReady()
                val p = pendingFirstMessage
                if (p != null) {
                    pendingFirstMessage = null
                    sendText(p)
                }
            } catch (e: Exception) {
                if (isUnauthorized(e)) handleUnauthorized()
                else _error.value = e.message ?: "Load failed"
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
                appendLocalTurn(
                    user = text.trim(),
                    assistant = out.reply,
                    score = out.score,
                    verdict = out.verdict,
                    intent = out.intent,
                    shareCardUrl = out.shareCardUrl,
                )
                handlePaywall(out.paywall?.checkoutUrl)
                refreshConversations()
                refreshUsage()
                refreshBilling()
            } catch (e: Exception) {
                if (isUnauthorized(e)) handleUnauthorized()
                else _error.value = e.message ?: "Chat failed"
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
                appendLocalTurn(
                    user = caption ?: "(photo)",
                    assistant = out.reply,
                    score = out.score,
                    verdict = out.verdict,
                    intent = out.intent,
                    shareCardUrl = out.shareCardUrl,
                )
                handlePaywall(out.paywall?.checkoutUrl)
                refreshConversations()
                refreshUsage()
                refreshBilling()
            } catch (e: Exception) {
                if (isUnauthorized(e)) handleUnauthorized()
                else _error.value = e.message ?: "Upload failed"
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
                appendLocalTurn(
                    user = text,
                    assistant = out.reply,
                    score = out.score,
                    verdict = out.verdict,
                    intent = out.intent,
                    shareCardUrl = out.shareCardUrl,
                )
                handlePaywall(out.paywall?.checkoutUrl)
                refreshConversations()
                refreshUsage()
                refreshBilling()
            } catch (e: Exception) {
                if (isUnauthorized(e)) handleUnauthorized()
                else _error.value = e.message ?: "Chat failed"
            } finally {
                _busy.value = false
            }
        }
    }

    private fun handlePaywall(url: String?) {
        if (url != null) {
            _paywallUrl.value = url
            _showPaywall.value = true
        }
    }

    fun setGoal(goal: String) {
        val t = _token.value ?: return
        viewModelScope.launch {
            try {
                api.patchProfile("Bearer $t", ProfilePatch(goal = goal))
                _profile.value = ProfileResponse(goal = goal)
            } catch (e: Exception) {
                if (isUnauthorized(e)) handleUnauthorized()
            }
        }
    }

    private fun appendLocalTurn(
        user: String,
        assistant: String,
        score: Double? = null,
        verdict: String? = null,
        intent: String? = null,
        shareCardUrl: String? = null,
    ) {
        val now = System.currentTimeMillis()
        val cur = _messages.value.toMutableList()
        cur.add(UiMessage("user", user, createdAtMs = now))
        cur.add(
            UiMessage(
                role = "assistant",
                content = assistant,
                score = score,
                verdict = verdict,
                intent = intent,
                shareCardUrl = shareCardUrl,
                createdAtMs = now,
            ),
        )
        _messages.value = cur
    }

    companion object {
        private val timeFmt: DateTimeFormatter = DateTimeFormatter.ofPattern("h:mm a")

        fun formatMessageTime(ms: Long?): String {
            if (ms == null) return ""
            return Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()).format(timeFmt)
        }
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
