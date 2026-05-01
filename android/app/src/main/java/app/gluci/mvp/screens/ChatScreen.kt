package app.gluci.mvp.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Spa
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.VerticalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import app.gluci.mvp.ui.components.FoodResultCard
import app.gluci.mvp.vm.GluciViewModel
import app.gluci.mvp.vm.OutgoingStatus
import app.gluci.mvp.vm.UiMessage
import coil.compose.AsyncImage
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.ui.platform.LocalContext

private val SageMuted = Color(0xFF769A8F)
/** Mint “primary fixed” from mock — not all Material3 versions expose `primaryFixed` on ColorScheme. */
private val PrimaryFixedMint = Color(0xFFC5EBDE)
private val UserBubble = Color(0xFFC5EBDE).copy(alpha = 0.88f)
private val UserBubbleText = Color(0xFF0D3129)
private val AiBubble = Color.White.copy(alpha = 0.92f)
private val MutedCaption = Color(0xFF9CA3AF)

@Composable
fun ChatScreen(
    vm: GluciViewModel,
    nav: NavController,
    conversationId: String,
) {
    val messages by vm.messages.collectAsState()
    val busy by vm.busy.collectAsState()
    val err by vm.error.collectAsState()
    var input by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    var sharedCard by remember { mutableStateOf<Triple<String, String, String?>?>(null) }
    var pendingImageUri by remember { mutableStateOf<Uri?>(null) }
    val ctx = LocalContext.current

    LaunchedEffect(conversationId) {
        vm.openConversation(conversationId) { }
    }

    LaunchedEffect(messages.size, busy) {
        kotlinx.coroutines.delay(32)
        val welcomeCount = if (messages.isEmpty() && !busy) 1 else 0
        val lastIndex = welcomeCount + messages.size - 1
        val total = listState.layoutInfo.totalItemsCount
        if (total > 0 && lastIndex >= 0) {
            val target = lastIndex.coerceAtMost(total - 1).coerceAtLeast(0)
            listState.animateScrollToItem(target)
        }
    }

    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        pendingImageUri = uri
    }

    BoxWithConstraints(Modifier.fillMaxSize().imePadding()) {
        val density = LocalDensity.current
        val maxW = maxWidth
        Box(Modifier.fillMaxSize()) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.radialGradient(
                            colors = listOf(
                                Color(0xFFC5EBDE),
                                Color(0xFFFAF9F7),
                                Color(0xFFFAF9F7),
                            ),
                            center = androidx.compose.ui.geometry.Offset(
                                x = with(density) { maxW.toPx() } * 0.88f,
                                y = with(density) { 24.dp.toPx() },
                            ),
                            radius = with(density) { maxW.toPx() } * 1.25f,
                        ),
                    ),
            )
            Column(Modifier.fillMaxSize()) {
            ChatTopBar(
                onBack = { nav.popBackStack() },
                onSettings = { nav.navigate("profile") },
            )
            err?.let {
                Text(
                    it,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                )
            }
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 24.dp, bottom = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (messages.isEmpty() && !busy) {
                    item {
                        WelcomeHero(
                            onPrefillMeal = {
                                input =
                                    "I want to check a meal. Should I eat this? (I'll send a photo next.)"
                            },
                            onPrefillRestaurant = {
                                input =
                                    "Help me pick the best ~3 things to order for stable glucose. Restaurant name:"
                            },
                            onPrefillGrocery = {
                                input =
                                    "Help me rate this grocery item. Barcode or description:"
                            },
                        )
                    }
                }
                items(
                    count = messages.size,
                    key = { i ->
                        val msg = messages[i]
                        msg.id ?: "m-$i-${msg.createdAtMs}-${msg.content.hashCode()}"
                    },
                ) { i ->
                    ChatMessageBubble(
                        m = messages[i],
                        onShareCardClick = { url, landing ->
                            val msg = messages[i]
                            val score = msg.score?.let { String.format("%.1f/10", it) }
                            val verdict = msg.verdict?.takeIf { it.isNotBlank() }
                            val caption = buildString {
                                append("My Gluci food check")
                                if (verdict != null) append(" — $verdict")
                                if (score != null) append(" ($score)")
                            }
                            sharedCard = Triple(url, caption, landing)
                        },
                        shareGluciCard = { url, caption, landing ->
                            landing?.let { land ->
                                val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                cm.setPrimaryClip(ClipData.newPlainText("Gluci invite", land))
                                Toast.makeText(ctx, "Invite link copied", Toast.LENGTH_SHORT).show()
                            }
                            sharedCard = Triple(url, caption, landing)
                        },
                    )
                }
            }
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Transparent,
                                MaterialTheme.colorScheme.background.copy(alpha = 0.97f),
                                MaterialTheme.colorScheme.background,
                            ),
                        ),
                    )
                    .padding(bottom = 8.dp),
            ) {
                pendingImageUri?.let { uri ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        AsyncImage(
                            model = uri,
                            contentDescription = "Photo to send",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .size(52.dp)
                                .clip(RoundedCornerShape(10.dp)),
                        )
                        Text(
                            "Add a note (optional), then send",
                            style = MaterialTheme.typography.labelMedium,
                            color = MutedCaption,
                            modifier = Modifier
                                .weight(1f)
                                .padding(horizontal = 12.dp),
                        )
                        IconButton(onClick = { pendingImageUri = null }) {
                            Icon(Icons.Filled.Close, contentDescription = "Remove photo", tint = MutedCaption)
                        }
                    }
                }
                ChatInputBar(
                    value = input,
                    onValueChange = { input = it },
                    onSend = {
                        when {
                            pendingImageUri != null -> {
                                vm.sendImage(pendingImageUri!!, input.ifBlank { null })
                                pendingImageUri = null
                                input = ""
                            }
                            input.isNotBlank() -> {
                                vm.sendText(input.trim())
                                input = ""
                            }
                        }
                    },
                    onCameraOrGallery = { pickImage.launch("image/*") },
                    onBarcode = { nav.navigate("barcode") },
                    enabledSend = !busy && (input.isNotBlank() || pendingImageUri != null),
                    busy = busy,
                )
            }
            }
        }
        sharedCard?.let { (url, caption, landing) ->
            ShareCardSheet(
                url = url,
                captionText = caption,
                shareLandingUrl = landing,
                onDismiss = { sharedCard = null },
                onCopyInviteLink = {
                    vm.logAnalyticsEvent("share_link_copy", emptyMap())
                },
            )
        }
    }
}

@Composable
private fun ChatTopBar(
    onBack: () -> Unit,
    onSettings: () -> Unit,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding(),
        color = Color.White.copy(alpha = 0.88f),
        shadowElevation = 4.dp,
        tonalElevation = 0.dp,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .padding(horizontal = 4.dp),
        ) {
            IconButton(
                onClick = onBack,
                modifier = Modifier.align(Alignment.CenterStart),
            ) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = SageMuted)
            }
            Text(
                text = "Gluci",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                color = SageMuted,
                modifier = Modifier.align(Alignment.Center),
            )
            IconButton(
                onClick = onSettings,
                modifier = Modifier.align(Alignment.CenterEnd),
            ) {
                Icon(Icons.Outlined.Settings, contentDescription = "Settings", tint = SageMuted)
            }
        }
    }
}

@Composable
private fun WelcomeHero(
    onPrefillMeal: () -> Unit,
    onPrefillRestaurant: () -> Unit,
    onPrefillGrocery: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .shadow(12.dp, RoundedCornerShape(16.dp))
                .clip(RoundedCornerShape(16.dp))
                .background(
                    Brush.linearGradient(
                        colors = listOf(
                            PrimaryFixedMint,
                            MaterialTheme.colorScheme.primaryContainer,
                        ),
                    ),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Spa,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(32.dp),
            )
        }
        Text(
            text = "Hello, I'm Gluci",
            style = MaterialTheme.typography.displayLarge,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(top = 8.dp),
            textAlign = TextAlign.Center,
        )
        Text(
            text = "Your companion for mindful eating and serene nutrition tracking.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp, start = 24.dp, end = 24.dp),
            textAlign = TextAlign.Center,
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(top = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        ) {
            QuickPill("Check a meal", Icons.Outlined.Restaurant, onPrefillMeal)
            QuickPill("Restaurant", Icons.Outlined.Storefront, onPrefillRestaurant)
            QuickPill("Grocery / barcode", Icons.Outlined.QrCodeScanner, onPrefillGrocery)
        }
    }
}

@Composable
private fun ChatMessageBubble(
    m: UiMessage,
    onShareCardClick: (String, String?) -> Unit = { _, _ -> },
    shareGluciCard: (String, String, String?) -> Unit = { _, _, _ -> },
) {
    val isUser = m.role == "user"
    val time = GluciViewModel.formatMessageTime(m.createdAtMs)
    val userImageDisplayUrl = remember(isUser, m.imageUrl) {
        if (isUser && !m.imageUrl.isNullOrBlank()) m.imageUrl!!.reachableMediaUrl() else null
    }
    val hasFoodCurve = !isUser && !m.glucoseCurve.isNullOrEmpty()
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
    ) {
        Surface(
            shape = RoundedCornerShape(
                topStart = 16.dp,
                topEnd = 16.dp,
                bottomEnd = if (isUser) 4.dp else 16.dp,
                bottomStart = if (isUser) 16.dp else 4.dp,
            ),
            color = if (isUser) UserBubble else AiBubble,
            modifier = Modifier
                .widthIn(max = 320.dp)
                .border(
                    width = 1.dp,
                    color = Color.White.copy(alpha = 0.6f),
                    shape = RoundedCornerShape(
                        topStart = 16.dp,
                        topEnd = 16.dp,
                        bottomEnd = if (isUser) 4.dp else 16.dp,
                        bottomStart = if (isUser) 16.dp else 4.dp,
                    ),
                )
                .shadow(2.dp, RoundedCornerShape(16.dp)),
        ) {
            Column(Modifier.padding(20.dp)) {
                val showInsight = !isUser &&
                    !m.verdict.isNullOrBlank() &&
                    !m.verdict.equals("general", ignoreCase = true) &&
                    !m.intent.equals("general", ignoreCase = true) &&
                    !hasFoodCurve
                if (showInsight) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(bottom = 12.dp),
                    ) {
                        Surface(
                            shape = RoundedCornerShape(50),
                            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.1f),
                        ) {
                            Row(
                                Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Icon(
                                    Icons.Filled.CheckCircle,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(16.dp),
                                )
                                Text(
                                    m.verdict,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                            }
                        }
                    }
                }
                if (userImageDisplayUrl != null) {
                    AsyncImage(
                        model = userImageDisplayUrl,
                        contentDescription = "Your photo",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 120.dp, max = 220.dp)
                            .clip(RoundedCornerShape(12.dp)),
                    )
                }
                if (m.content.isNotBlank()) {
                    Text(
                        text = m.content,
                        style = MaterialTheme.typography.bodyLarge,
                        color = if (isUser) UserBubbleText else MaterialTheme.colorScheme.onSurface,
                        lineHeight = 24.sp,
                        modifier = Modifier.padding(top = if (isUser && !m.imageUrl.isNullOrBlank()) 10.dp else 0.dp),
                    )
                }
                if (showInsight) {
                    InsightStrip(m)
                }
                if (!isUser && !m.shareCardUrl.isNullOrBlank() && !hasFoodCurve) {
                    ShareCardPreview(
                        url = m.shareCardUrl,
                        onClick = { onShareCardClick(m.shareCardUrl!!, m.shareLandingUrl) },
                    )
                }
            }
        }
        if (hasFoodCurve) {
            FoodResultCard(
                score = (m.score ?: 0.0).toFloat(),
                verdict = m.verdict ?: "",
                tip = m.tip.orEmpty(),
                foodName = m.food?.takeIf { !it.isNullOrBlank() } ?: fallbackFoodTitle(m.content),
                foodImageUrl = m.mealImageUrl,
                curvePoints = m.glucoseCurve!!,
                shareCardUrl = m.shareCardUrl,
                onShare = {
                    val url = m.shareCardUrl ?: return@FoodResultCard
                    val caption =
                        "My glucose score for this meal: ${String.format("%.1f", m.score ?: 0.0)}/10 via @gluciapp #glucosegoddess #bloodsugar"
                    shareGluciCard(url, caption, m.shareLandingUrl)
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
            )
        } else if (!isUser && m.score != null &&
                   m.glucoseCurve.isNullOrEmpty() &&
                   m.intent != "general" &&
                   m.intent != "non_food_barcode" && m.intent != "unknown_barcode" &&
                   !m.verdict.isNullOrBlank() && !m.verdict.equals("general", ignoreCase = true) &&
                   !m.verdict.equals("subscribe", ignoreCase = true)) {
            // Safety net: score exists but no curve (e.g. partial data)
            SimpleScoreCard(
                score = m.score.toFloat(),
                verdict = m.verdict,
                tip = m.tip.orEmpty(),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 4.dp, start = if (isUser) 0.dp else 8.dp, end = if (isUser) 8.dp else 0.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
        ) {
            Text(
                text = if (isUser) "You${if (time.isNotEmpty()) " • $time" else ""}" else "Gluci${if (time.isNotEmpty()) " • $time" else ""}",
                style = MaterialTheme.typography.labelSmall,
                color = MutedCaption,
                fontSize = 10.sp,
            )
            if (isUser && m.outgoingStatus != OutgoingStatus.None) {
                Spacer(Modifier.width(4.dp))
                when (m.outgoingStatus) {
                    OutgoingStatus.Sending -> Icon(
                        Icons.Outlined.Schedule,
                        contentDescription = "Sending",
                        tint = MutedCaption,
                        modifier = Modifier.size(14.dp),
                    )
                    OutgoingStatus.Sent -> Icon(
                        Icons.Outlined.DoneAll,
                        contentDescription = "Sent",
                        tint = SageMuted,
                        modifier = Modifier.size(15.dp),
                    )
                    else -> {}
                }
            }
        }
    }
}

@Composable
private fun InsightStrip(m: UiMessage) {
    val scoreStr = m.score?.let { String.format("%.1f/10", it) } ?: "—"
    val verdictShort = m.verdict?.takeIf { it.isNotBlank() } ?: "—"
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 16.dp),
            shape = RoundedCornerShape(14.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 18.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    InsightCell(Modifier.weight(1f), "Score", scoreStr)
                    VerticalDivider(
                        modifier = Modifier.height(48.dp),
                        color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f),
                    )
                    InsightCell(Modifier.weight(1f), "Verdict", verdictShort)
                }
                if (m.confidence.equals("low", ignoreCase = true)) {
                    Text(
                        text = "Estimated — partial ingredient match",
                        style = MaterialTheme.typography.labelSmall,
                        color = MutedCaption,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 10.dp),
                    )
                }
            }
        }
}

@Composable
private fun InsightCell(modifier: Modifier = Modifier, label: String, value: String) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            label.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            value,
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.primary,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(top = 4.dp),
            maxLines = 2,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun QuickPill(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(50),
        color = Color.White.copy(alpha = 0.65f),
        border = BorderStroke(1.dp, SageMuted.copy(alpha = 0.12f)),
        shadowElevation = 1.dp,
        modifier = Modifier.clickable(onClick = onClick),
    ) {
        Row(
            Modifier.padding(horizontal = 18.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(icon, contentDescription = null, tint = SageMuted, modifier = Modifier.size(18.dp))
            Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ChatInputBar(
    value: String,
    onValueChange: (String) -> Unit,
    onSend: () -> Unit,
    onCameraOrGallery: () -> Unit,
    onBarcode: () -> Unit,
    enabledSend: Boolean,
    busy: Boolean,
) {
    var attachMenuExpanded by remember { mutableStateOf(false) }
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 6.dp),
        shape = RoundedCornerShape(16.dp),
        color = Color.White.copy(alpha = 0.92f),
        shadowElevation = 8.dp,
        border = BorderStroke(1.dp, Color.White),
    ) {
        Row(
            modifier = Modifier.padding(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box {
                IconButton(
                    onClick = { attachMenuExpanded = true },
                    enabled = !busy,
                ) {
                    Icon(Icons.Outlined.MoreVert, contentDescription = "Camera or barcode", tint = MutedCaption)
                }
                DropdownMenu(
                    expanded = attachMenuExpanded,
                    onDismissRequest = { attachMenuExpanded = false },
                ) {
                    DropdownMenuItem(
                        text = { Text("Camera / photo") },
                        onClick = {
                            attachMenuExpanded = false
                            onCameraOrGallery()
                        },
                        leadingIcon = {
                            Icon(Icons.Outlined.PhotoCamera, contentDescription = null)
                        },
                    )
                    DropdownMenuItem(
                        text = { Text("Scan barcode") },
                        onClick = {
                            attachMenuExpanded = false
                            onBarcode()
                        },
                        leadingIcon = {
                            Icon(Icons.Outlined.QrCodeScanner, contentDescription = null)
                        },
                    )
                }
            }
            OutlinedTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier
                    .weight(1f)
                    .height(56.dp),
                placeholder = { Text("Ask Gluci…", color = MutedCaption) },
                singleLine = true,
                enabled = !busy,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Color.Transparent,
                    unfocusedBorderColor = Color.Transparent,
                    disabledBorderColor = Color.Transparent,
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent,
                ),
            )
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(
                        Brush.linearGradient(
                            colors = listOf(
                                MaterialTheme.colorScheme.primary,
                                MaterialTheme.colorScheme.primaryContainer,
                            ),
                        ),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                IconButton(onClick = onSend, enabled = enabledSend) {
                    Icon(
                        Icons.Filled.ArrowUpward,
                        contentDescription = "Send",
                        tint = Color.White,
                    )
                }
            }
        }
    }
}

@Composable
private fun SimpleScoreCard(
    score: Float,
    verdict: String,
    tip: String,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = Color.White,
        shadowElevation = 2.dp,
        shape = RoundedCornerShape(12.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "${String.format("%.1f", score)}/10",
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                    color = when {
                        score >= 7f -> Color(0xFF2E7D32)
                        score >= 4.5f -> Color(0xFFE65100)
                        else -> Color(0xFFC62828)
                    },
                )
                Box(
                    modifier = Modifier
                        .background(
                            when (verdict.lowercase()) {
                                "eat" -> Color(0xFFE8F5E9)
                                "avoid" -> Color(0xFFFFEBEE)
                                else -> Color(0xFFFFF3E0)
                            },
                            RoundedCornerShape(20.dp),
                        )
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                ) {
                    Text(
                        text = verdict.uppercase(),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = when (verdict.lowercase()) {
                            "eat" -> Color(0xFF2E7D32)
                            "avoid" -> Color(0xFFC62828)
                            else -> Color(0xFFE65100)
                        },
                    )
                }
            }
            if (tip.isNotBlank()) {
                Spacer(Modifier.height(12.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFFF8F9FA), RoundedCornerShape(8.dp))
                        .padding(10.dp),
                ) {
                    Text(text = "💡 ", fontSize = 14.sp)
                    Text(
                        text = tip,
                        fontSize = 13.sp,
                        color = Color(0xFF444444),
                    )
                }
            }
        }
    }
}

private fun fallbackFoodTitle(reply: String): String {
    val line = reply.lineSequence().firstOrNull { it.isNotBlank() } ?: return "Your meal"
    return line.take(56).trim()
}

