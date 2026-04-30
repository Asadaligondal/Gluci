package app.gluci.mvp.data

import com.google.gson.JsonElement
import com.google.gson.annotations.SerializedName
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

data class RegisterResponse(
    val token: String,
    val userId: String,
)

data class AuthRequest(
    val email: String,
    val password: String,
)

data class AuthResponse(
    val token: String,
    val userId: String,
)

data class CreateConversationRequest(
    val title: String? = null,
)

data class CreateConversationResponse(
    val id: String,
    val title: String,
)

data class ConversationsResponse(
    val conversations: List<ConversationDto>,
)

data class ConversationDto(
    val id: String,
    val title: String,
    @SerializedName("updatedAt") val updatedAt: String? = null,
)

data class ChatRequest(
    @SerializedName("conversationId") val conversationId: String,
    val text: String? = null,
    @SerializedName("imageBase64") val imageBase64: String? = null,
    @SerializedName("mimeType") val mimeType: String? = null,
    val barcode: String? = null,
)

data class GluciCurvePoint(
    val minute: Int,
    @SerializedName("mg_dl") val mgDl: Double,
)

data class ChatResponse(
    val reply: String,
    val score: Double?,
    val verdict: String?,
    val intent: String?,
    val tip: String?,
    val food: String? = null,
    val glucoseCurve: List<GluciCurvePoint>?,
    val topOrders: List<TopOrder>?,
    @SerializedName("shareCardUrl") val shareCardUrl: String?,
    @SerializedName("userImageUrl") val userImageUrl: String? = null,
    @SerializedName("shareLandingUrl") val shareLandingUrl: String? = null,
    val paywall: PaywallInfo?,
    /** Hybrid meal scoring — internal diagnostics; UI uses confidence for badge only. */
    @SerializedName("mealGI") val mealGI: Double? = null,
    @SerializedName("mealGL") val mealGL: Double? = null,
    val confidence: String? = null,
)

data class TopOrder(
    val name: String,
    val score: Double,
    val tweaks: String,
)

data class PaywallInfo(
    val message: String?,
    @SerializedName("checkoutUrl") val checkoutUrl: String?,
)

data class HistoryResponse(
    val messages: List<HistoryMessage>,
)

data class HistoryMessage(
    val id: String,
    val role: String,
    val content: String,
    val imageUrl: String? = null,
    val score: Double? = null,
    val verdict: String? = null,
    val intent: String? = null,
    val shareCardUrl: String? = null,
    val tip: String? = null,
    val food: String? = null,
    /** Present on assistant bubbles when backend stored glucose curve in metadata. */
    val glucoseCurve: JsonElement? = null,
    @SerializedName("mealGI") val mealGI: Double? = null,
    @SerializedName("mealGL") val mealGL: Double? = null,
    val confidence: String? = null,
)

data class ProfilePatch(
    val goal: String? = null,
    val dietaryJson: Map<String, String>? = null,
    val reengagementOptOut: Boolean? = null,
    val reengagementFrequencyDays: Int? = null,
    val appOnboardingComplete: Boolean? = null,
)

/** GET /v1/profile/ */
data class ProfileResponse(
    val goal: String? = null,
    val dietaryJson: Map<String, @JvmSuppressWildcards Any>? = null,
    val memoryJson: Map<String, @JvmSuppressWildcards Any>? = null,
    @SerializedName("reengagementOptOut") val reengagementOptOut: Boolean = false,
    @SerializedName("reengagementFrequencyDays") val reengagementFrequencyDays: Int = 1,
    @SerializedName("appOnboardingComplete") val appOnboardingComplete: Boolean = false,
    @SerializedName("shareRef") val shareRef: String? = null,
)

data class ChannelsResponse(
    @SerializedName("telegramLinked") val telegramLinked: Boolean = false,
    @SerializedName("whatsappLinked") val whatsappLinked: Boolean = false,
    val linkCode: String? = null,
    @SerializedName("linkCodeExpiresAt") val linkCodeExpiresAt: String? = null,
)

data class LinkCodeResponse(
    val code: String,
    @SerializedName("expiresAt") val expiresAt: String,
)

data class UsageResponse(
    @SerializedName("freeChecksUsed") val freeChecksUsed: Int,
    @SerializedName("freeLimit") val freeLimit: Int,
    @SerializedName("subscriptionStatus") val subscriptionStatus: String,
)

/** GET /v1/summary/daily — matches backend DailySummary. */
data class DailySummaryDto(
    val checks: Int,
    @SerializedName("averageScore") val averageScore: Double,
    @SerializedName("bestVerdict") val bestVerdict: String? = null,
    @SerializedName("bestIntent") val bestIntent: String? = null,
    @SerializedName("bestScore") val bestScore: Double? = null,
    @SerializedName("improvementArea") val improvementArea: String,
    @SerializedName("suggestionTomorrow") val suggestionTomorrow: String,
    /** Same as suggestionTomorrow; kept for older API clients. */
    val focus: String? = null,
)

data class DailySummaryEnvelope(
    val summary: DailySummaryDto?,
)

/** GET /v1/summary/weekly — matches backend WeeklySummary. */
data class WeeklySummaryDto(
    @SerializedName("periodStart") val periodStart: String,
    @SerializedName("periodEnd") val periodEnd: String,
    val checks: Int,
    @SerializedName("averageScore") val averageScore: Double,
    @SerializedName("bestVerdict") val bestVerdict: String? = null,
    @SerializedName("bestIntent") val bestIntent: String? = null,
    @SerializedName("commonPattern") val commonPattern: String,
    @SerializedName("bestSwapHint") val bestSwapHint: String,
    @SerializedName("mostImprovedArea") val mostImprovedArea: String,
    @SerializedName("focusNextWeek") val focusNextWeek: String,
)

data class WeeklySummaryEnvelope(
    val summary: WeeklySummaryDto?,
)

/** GET /v1/summary/week-daily — rolling 7 UTC days average scores from usage events. */
data class WeekDailyBarDto(
    val date: String,
    @SerializedName("averageScore") val averageScore: Double?,
    val checks: Int,
)

data class WeekDailyEnvelope(
    val days: List<WeekDailyBarDto>,
)

data class BillingStatusResponse(
    @SerializedName("subscriptionStatus") val subscriptionStatus: String,
    @SerializedName("freeChecksUsed") val freeChecksUsed: Int,
    @SerializedName("freeLimit") val freeLimit: Int,
    @SerializedName("cancelAtPeriodEnd") val cancelAtPeriodEnd: Boolean? = null,
    @SerializedName("currentPeriodEnd") val currentPeriodEnd: String? = null,
    @SerializedName("stripeConfigured") val stripeConfigured: Boolean = false,
)

data class CheckoutResponse(
    val url: String?,
    @SerializedName("sessionId") val sessionId: String? = null,
)

data class PortalResponse(val url: String?)

interface GluciApi {
    @POST("v1/auth/register")
    suspend fun register(): RegisterResponse

    @POST("v1/auth/signup")
    suspend fun signup(@Body body: AuthRequest): AuthResponse

    @POST("v1/auth/login")
    suspend fun login(@Body body: AuthRequest): AuthResponse

    @GET("v1/conversations/")
    suspend fun listConversations(
        @Header("Authorization") authorization: String,
    ): ConversationsResponse

    @POST("v1/conversations/")
    suspend fun createConversation(
        @Header("Authorization") authorization: String,
        @Body body: CreateConversationRequest = CreateConversationRequest(),
    ): CreateConversationResponse

    @DELETE("v1/conversations/{id}")
    suspend fun deleteConversation(
        @Header("Authorization") authorization: String,
        @Path("id") id: String,
    ): Response<Unit>

    @POST("v1/chat/")
    suspend fun chat(
        @Header("Authorization") authorization: String,
        @Body body: ChatRequest,
    ): ChatResponse

    @GET("v1/history/")
    suspend fun history(
        @Header("Authorization") authorization: String,
        @Query("conversationId") conversationId: String,
    ): HistoryResponse

    @GET("v1/profile/")
    suspend fun getProfile(
        @Header("Authorization") authorization: String,
    ): ProfileResponse

    @PATCH("v1/profile/")
    suspend fun patchProfile(
        @Header("Authorization") authorization: String,
        @Body body: ProfilePatch,
    ): Response<Unit>

    @GET("v1/summary/usage")
    suspend fun usage(
        @Header("Authorization") authorization: String,
    ): UsageResponse

    @GET("v1/summary/daily")
    suspend fun dailySummary(
        @Header("Authorization") authorization: String,
    ): DailySummaryEnvelope

    @GET("v1/summary/weekly")
    suspend fun weeklySummary(
        @Header("Authorization") authorization: String,
    ): WeeklySummaryEnvelope

    @GET("v1/summary/week-daily")
    suspend fun weekDailyScores(
        @Header("Authorization") authorization: String,
    ): WeekDailyEnvelope

    @GET("v1/channels/")
    suspend fun getChannels(
        @Header("Authorization") authorization: String,
    ): ChannelsResponse

    @POST("v1/channels/link-code")
    suspend fun postLinkCode(
        @Header("Authorization") authorization: String,
    ): LinkCodeResponse

    @GET("v1/billing/status")
    suspend fun billingStatus(
        @Header("Authorization") authorization: String,
    ): BillingStatusResponse

    @POST("v1/billing/checkout")
    suspend fun checkout(
        @Header("Authorization") authorization: String,
    ): CheckoutResponse

    @POST("v1/billing/portal")
    suspend fun billingPortal(
        @Header("Authorization") authorization: String,
    ): PortalResponse

    @POST("v1/analytics/event")
    suspend fun postAnalyticsEvent(
        @Header("Authorization") authorization: String,
        @Body body: AnalyticsEventBody,
    ): OkResponse
}

data class OkResponse(val ok: Boolean = true)

data class AnalyticsEventBody(
    val name: String,
    val properties: Map<String, @JvmSuppressWildcards Any>? = null,
)
