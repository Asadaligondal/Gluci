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
)

data class ProfilePatch(
    val goal: String? = null,
)

data class UsageResponse(
    @SerializedName("freeChecksUsed") val freeChecksUsed: Int,
    @SerializedName("freeLimit") val freeLimit: Int,
    @SerializedName("subscriptionStatus") val subscriptionStatus: String,
)

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

    @PATCH("v1/profile/")
    suspend fun patchProfile(
        @Header("Authorization") authorization: String,
        @Body body: ProfilePatch,
    ): Response<Unit>

    @GET("v1/summary/usage")
    suspend fun usage(
        @Header("Authorization") authorization: String,
    ): UsageResponse
}
