package app.gluci.mvp.vm

import android.app.Application
import android.net.Uri
import android.util.Base64
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.gluci.mvp.data.ApiModule
import app.gluci.mvp.data.AnalyticsEventBody
import app.gluci.mvp.data.AuthRequest
import app.gluci.mvp.data.BillingStatusResponse
import app.gluci.mvp.data.ChannelsResponse
import app.gluci.mvp.data.ChatRequest
import app.gluci.mvp.data.CreateConversationRequest
import app.gluci.mvp.data.ConversationDto
import app.gluci.mvp.data.DailySummaryDto
import app.gluci.mvp.data.ProfilePatch
import app.gluci.mvp.data.ProfileResponse
import app.gluci.mvp.data.TokenStore
import app.gluci.mvp.data.WeeklySummaryDto
import app.gluci.mvp.data.GluciCurvePoint
import app.gluci.mvp.data.WeekDailyBarDto
import app.gluci.mvp.data.parseGlucoseCurve
import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import retrofit2.HttpException
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

enum class OutgoingStatus {
    None,
    Sending,
    Sent,
}

data class UiMessage(
    val id: String? = null,
    val role: String,
    val content: String,
    val imageUrl: String? = null,
    val score: Double? = null,
    val verdict: String? = null,
    val intent: String? = null,
    val shareCardUrl: String? = null,
    val shareLandingUrl: String? = null,
    val glucoseCurve: List<GluciCurvePoint>? = null,
    val tip: String? = null,
    val food: String? = null,
    val mealImageUrl: String? = null,
    val outgoingStatus: OutgoingStatus = OutgoingStatus.None,
    val createdAtMs: Long? = null,
)

data class LastFoodInsight(
    val glucoseCurve: List<GluciCurvePoint>?,
    val score: Float?,
    val verdict: String?,
    val tip: String?,
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

    private val _dailySummary = MutableStateFlow<DailySummaryDto?>(null)
    val dailySummary: StateFlow<DailySummaryDto?> = _dailySummary.asStateFlow()

    private val _weeklySummary = MutableStateFlow<WeeklySummaryDto?>(null)
    val weeklySummary: StateFlow<WeeklySummaryDto?> = _weeklySummary.asStateFlow()

    private val _weekDailyBars = MutableStateFlow<List<WeekDailyBarDto>>(emptyList())
    val weekDailyBars: StateFlow<List<WeekDailyBarDto>> = _weekDailyBars.asStateFlow()

    private val _lastFoodInsight = MutableStateFlow<LastFoodInsight?>(null)
    val lastFoodInsight: StateFlow<LastFoodInsight?> = _lastFoodInsight.asStateFlow()

    private val _summariesLoading = MutableStateFlow(false)
    val summariesLoading: StateFlow<Boolean> = _summariesLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _billing = MutableStateFlow<BillingStatusResponse?>(null)
    val billing: StateFlow<BillingStatusResponse?> = _billing.asStateFlow()

    private val _profile = MutableStateFlow<ProfileResponse?>(null)
    val profile: StateFlow<ProfileResponse?> = _profile.asStateFlow()

    private val _channels = MutableStateFlow<ChannelsResponse?>(null)
    val channels: StateFlow<ChannelsResponse?> = _channels.asStateFlow()

    private val _paywallUrl = MutableStateFlow<String?>(null)
    val paywallUrl: StateFlow<String?> = _paywallUrl.asStateFlow()

    private val _showPaywall = MutableStateFlow(false)
    val showPaywall: StateFlow<Boolean> = _showPaywall.asStateFlow()

    private val _sessionExpired = MutableStateFlow(false)
    val sessionExpired: StateFlow<Boolean> = _sessionExpired.asStateFlow()

    init {
        viewModelScope.launch {
            store.token.collect { _token.value = it }
        }
    }

    suspend fun getTokenOnce(): String? = store.token.first()

    /**
     * Loads profile and returns whether app onboarding is complete.
     * On failure returns true (fail-open to home).
     */
    suspend fun fetchProfileGate(): Boolean {
        val t = store.token.first() ?: return true
        return try {
            val p = api.getProfile("Bearer $t")
            _profile.value = p
            p.appOnboardingComplete
        } catch (_: Exception) {
            true
        }
    }

    fun logAnalyticsEvent(name: String, properties: Map<String, Any>? = null) {
        val t = _token.value ?: return
        viewModelScope.launch {
            try {
                api.postAnalyticsEvent("Bearer $t", AnalyticsEventBody(name = name, properties = properties))
            } catch (_: Exception) { /* non-blocking */ }
        }
    }

    fun completeAppOnboarding(onDone: () -> Unit) {
        val t = _token.value ?: return
        viewModelScope.launch {
            try {
                api.patchProfile("Bearer $t", ProfilePatch(appOnboardingComplete = true))
                refreshProfile()
                logAnalyticsEvent("onboarding_complete", emptyMap())
                onDone()
            } catch (e: Exception) {
                if (isUnauthorized(e)) handleUnauthorized()
            }
        }
    }

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
        _channels.value = null
        _usage.value = null
        _dailySummary.value = null
        _weeklySummary.value = null
        _weekDailyBars.value = emptyList()
        _lastFoodInsight.value = null
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
                refreshChannels()
                refreshSummaries()
            }
        }
    }

    fun refreshSummaries() {
        viewModelScope.launch {
            val t = store.token.first() ?: return@launch
            _summariesLoading.value = true
            try {
                val auth = "Bearer $t"
                _dailySummary.value = api.dailySummary(auth).summary
                _weeklySummary.value = api.weeklySummary(auth).summary
                _weekDailyBars.value = api.weekDailyScores(auth).days
            } catch (e: Exception) {
                if (isUnauthorized(e)) handleUnauthorized()
            } finally {
                _summariesLoading.value = false
            }
        }
    }

    fun refreshChannels() {
        val t = _token.value ?: return
        viewModelScope.launch {
            try {
                _channels.value = api.getChannels("Bearer $t")
            } catch (e: Exception) {
                if (isUnauthorized(e)) handleUnauthorized()
            }
        }
    }

    /**
     * Creates a 15-minute code. User sends in Telegram: `/link CODE` or in WhatsApp: `link CODE`.
     */
    fun requestLinkCode() {
        val t = _token.value ?: return
        viewModelScope.launch {
            _busy.value = true
            _error.value = null
            try {
                api.postLinkCode("Bearer $t")
                _channels.value = api.getChannels("Bearer $t")
            } catch (e: Exception) {
                if (isUnauthorized(e)) handleUnauthorized() else _error.value = e.message
            } finally {
                _busy.value = false
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
                    logAnalyticsEvent("checkout_open", null)
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
                refreshSummaries()
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
                refreshSummaries()
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
            _channels.value = null
            _dailySummary.value = null
            _weeklySummary.value = null
            _weekDailyBars.value = emptyList()
            _lastFoodInsight.value = null
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

    fun deleteConversation(id: String) {
        val t = _token.value ?: return
        viewModelScope.launch {
            _error.value = null
            try {
                api.deleteConversation("Bearer $t", id)
                if (_currentConversationId.value == id) {
                    _currentConversationId.value = null
                    _messages.value = emptyList()
                }
                refreshConversations()
            } catch (e: Exception) {
                if (isUnauthorized(e)) handleUnauthorized()
                else _error.value = e.message ?: "Could not delete chat"
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
                val rows = mutableListOf<UiMessage>()
                var pendingMealImage: String? = null
                for (it in h.messages) {
                    if (it.role == "user") {
                        pendingMealImage = it.imageUrl?.takeIf { url -> !url.isNullOrBlank() }
                        rows.add(
                            UiMessage(
                                id = it.id,
                                role = it.role,
                                content = it.content,
                                imageUrl = it.imageUrl,
                                createdAtMs = null,
                            ),
                        )
                    } else {
                        rows.add(
                            UiMessage(
                                id = it.id,
                                role = it.role,
                                content = it.content,
                                imageUrl = it.imageUrl,
                                score = it.score,
                                verdict = it.verdict,
                                intent = it.intent,
                                shareCardUrl = it.shareCardUrl,
                                glucoseCurve = it.glucoseCurve.parseGlucoseCurve(),
                                tip = it.tip,
                                food = it.food,
                                mealImageUrl = pendingMealImage,
                                createdAtMs = null,
                            ),
                        )
                    }
                }
                _messages.value = rows
                onReady()
            } catch (e: Exception) {
                if (isUnauthorized(e)) handleUnauthorized()
                else _error.value = e.message ?: "Load failed"
            } finally {
                _busy.value = false
            }
        }
    }

    fun sendText(
        text: String,
    ) {
        val t = _token.value ?: return
        val conv = _currentConversationId.value ?: return
        if (text.isBlank()) return
        viewModelScope.launch {
            val trimmed = text.trim()
            val now = System.currentTimeMillis()
            _messages.value = _messages.value + UiMessage(
                role = "user",
                content = trimmed,
                outgoingStatus = OutgoingStatus.Sending,
                createdAtMs = now,
            )
            _busy.value = true
            _error.value = null
            try {
                val out = api.chat(
                    "Bearer $t",
                    ChatRequest(conversationId = conv, text = trimmed),
                )
                markLastSendingUserSent()
                appendAssistantOnly(
                    reply = out.reply,
                    score = out.score,
                    verdict = out.verdict,
                    intent = out.intent,
                    shareCardUrl = out.shareCardUrl,
                    shareLandingUrl = out.shareLandingUrl,
                    glucoseCurve = out.glucoseCurve,
                    tip = out.tip,
                    food = out.food,
                    mealImageUrl = null,
                )
                handlePaywall(out.paywall?.checkoutUrl)
                refreshConversations()
                refreshUsage()
                refreshBilling()
                refreshSummaries()
            } catch (e: Exception) {
                if (isUnauthorized(e)) handleUnauthorized()
                else {
                    removeLastOutgoingSending()
                    _error.value = e.message ?: "Chat failed"
                }
            } finally {
                _busy.value = false
            }
        }
    }

    fun sendImage(uri: Uri, caption: String?) {
        val t = _token.value ?: return
        val conv = _currentConversationId.value ?: return
        viewModelScope.launch {
            val cap = caption?.trim().orEmpty()
            val localUri = uri.toString()
            val now = System.currentTimeMillis()
            _messages.value = _messages.value + UiMessage(
                role = "user",
                content = cap,
                imageUrl = localUri,
                outgoingStatus = OutgoingStatus.Sending,
                createdAtMs = now,
            )
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
                markLastSendingUserSent { last ->
                    last.copy(imageUrl = out.userImageUrl ?: localUri)
                }
                appendAssistantOnly(
                    reply = out.reply,
                    score = out.score,
                    verdict = out.verdict,
                    intent = out.intent,
                    shareCardUrl = out.shareCardUrl,
                    shareLandingUrl = out.shareLandingUrl,
                    glucoseCurve = out.glucoseCurve,
                    tip = out.tip,
                    food = out.food,
                    mealImageUrl = out.userImageUrl,
                )
                handlePaywall(out.paywall?.checkoutUrl)
                refreshConversations()
                refreshUsage()
                refreshBilling()
                refreshSummaries()
            } catch (e: Exception) {
                if (isUnauthorized(e)) handleUnauthorized()
                else {
                    removeLastOutgoingSending()
                    _error.value = e.message ?: "Upload failed"
                }
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
                    userImageUrl = null,
                    score = out.score,
                    verdict = out.verdict,
                    intent = out.intent,
                    shareCardUrl = out.shareCardUrl,
                    shareLandingUrl = out.shareLandingUrl,
                    glucoseCurve = out.glucoseCurve,
                    tip = out.tip,
                    food = out.food,
                    mealImageUrl = null,
                )
                handlePaywall(out.paywall?.checkoutUrl)
                refreshConversations()
                refreshUsage()
                refreshBilling()
                refreshSummaries()
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
                api.patchProfile("Bearer $t", ProfilePatch(goal = goal.trim().takeIf { it.isNotEmpty() }))
                refreshProfile()
            } catch (e: Exception) {
                if (isUnauthorized(e)) handleUnauthorized()
            }
        }
    }

    fun savePersonalization(
        goal: String,
        allergies: String,
        preferences: String,
        reengagementOptOut: Boolean,
        frequencyDays: Int,
    ) {
        val t = _token.value ?: return
        viewModelScope.launch {
            try {
                val dietary = buildMap {
                    if (allergies.isNotBlank()) put("allergies", allergies.trim())
                    if (preferences.isNotBlank()) put("preferences", preferences.trim())
                }
                api.patchProfile(
                    "Bearer $t",
                    ProfilePatch(
                        goal = goal.trim().takeIf { it.isNotEmpty() },
                        dietaryJson = dietary.ifEmpty { null },
                        reengagementOptOut = reengagementOptOut,
                        reengagementFrequencyDays = frequencyDays.coerceIn(1, 30),
                    ),
                )
                refreshProfile()
                logAnalyticsEvent("profile_update", mapOf("hasDietary" to dietary.isNotEmpty()))
            } catch (e: Exception) {
                if (isUnauthorized(e)) handleUnauthorized()
            }
        }
    }

    private fun appendLocalTurn(
        user: String,
        assistant: String,
        userImageUrl: String? = null,
        score: Double? = null,
        verdict: String? = null,
        intent: String? = null,
        shareCardUrl: String? = null,
        shareLandingUrl: String? = null,
        glucoseCurve: List<GluciCurvePoint>? = null,
        tip: String? = null,
        food: String? = null,
        mealImageUrl: String? = null,
    ) {
        val now = System.currentTimeMillis()
        val cur = _messages.value.toMutableList()
        cur.add(
            UiMessage(
                role = "user",
                content = user,
                imageUrl = userImageUrl,
                outgoingStatus = OutgoingStatus.Sent,
                createdAtMs = now,
            ),
        )
        cur.add(
            UiMessage(
                role = "assistant",
                content = assistant,
                score = score,
                verdict = verdict,
                intent = intent,
                shareCardUrl = shareCardUrl,
                shareLandingUrl = shareLandingUrl,
                glucoseCurve = glucoseCurve,
                tip = tip,
                food = food,
                mealImageUrl = mealImageUrl,
                createdAtMs = now,
            ),
        )
        _messages.value = cur
        _lastFoodInsight.value = LastFoodInsight(glucoseCurve, score?.toFloat(), verdict, tip)
    }

    private fun appendAssistantOnly(
        reply: String,
        score: Double?,
        verdict: String?,
        intent: String?,
        shareCardUrl: String?,
        shareLandingUrl: String? = null,
        glucoseCurve: List<GluciCurvePoint>? = null,
        tip: String? = null,
        food: String? = null,
        mealImageUrl: String? = null,
    ) {
        val now = System.currentTimeMillis()
        _lastFoodInsight.value = LastFoodInsight(glucoseCurve, score?.toFloat(), verdict, tip)
        _messages.value = _messages.value + UiMessage(
            role = "assistant",
            content = reply,
            score = score,
            verdict = verdict,
            intent = intent,
            shareCardUrl = shareCardUrl,
            shareLandingUrl = shareLandingUrl,
            glucoseCurve = glucoseCurve,
            tip = tip,
            food = food,
            mealImageUrl = mealImageUrl,
            createdAtMs = now,
        )
    }

    private fun markLastSendingUserSent(transform: ((UiMessage) -> UiMessage)? = null) {
        val cur = _messages.value.toMutableList()
        val idx = cur.indexOfLast { it.role == "user" && it.outgoingStatus == OutgoingStatus.Sending }
        if (idx >= 0) {
            val updated = transform?.invoke(cur[idx]) ?: cur[idx]
            cur[idx] = updated.copy(outgoingStatus = OutgoingStatus.Sent)
            _messages.value = cur
        }
    }

    private fun removeLastOutgoingSending() {
        val cur = _messages.value.toMutableList()
        val idx = cur.indexOfLast { it.role == "user" && it.outgoingStatus == OutgoingStatus.Sending }
        if (idx >= 0) cur.removeAt(idx)
        _messages.value = cur
    }

    companion object {
        private val timeFmt: DateTimeFormatter = DateTimeFormatter.ofPattern("h:mm a")

        fun getCurveColor(peakMgDl: Float): Color {
            return when {
                peakMgDl < 20f -> Color(0xFF4CAF50)
                peakMgDl <= 40f -> Color(0xFFFF9800)
                else -> Color(0xFFF44336)
            }
        }

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
