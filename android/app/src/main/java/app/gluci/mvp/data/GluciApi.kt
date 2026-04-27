package app.gluci.mvp.data

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

data class ChatResponse(
    val reply: String,
    val score: Double?,
    val verdict: String?,
    val intent: String?,
    val topOrders: List<TopOrder>?,
    @SerializedName("shareCardUrl") val shareCardUrl: String?,
    val paywall: PaywallInfo?,
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
    val score: Double? = null,
    val verdict: String? = null,
    val intent: String? = null,
    val shareCardUrl: String? = null,
)

data class ProfilePatch(
    val goal: String? = null,
)

/** GET /v1/profile/ — goal is the main field used in the app UI. */
data class ProfileResponse(
    val goal: String? = null,
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
}
