package app.gluci.mvp.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import app.gluci.mvp.data.BillingStatusResponse
import app.gluci.mvp.data.DailySummaryDto
import app.gluci.mvp.data.WeeklySummaryDto
import app.gluci.mvp.vm.GluciViewModel
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val HomeSageMuted = Color(0xFF769A8F)
private val ShortcutCardShape = RoundedCornerShape(16.dp)
private val ChatCardShape = RoundedCornerShape(16.dp)

@Composable
fun HomeScreen(
    vm: GluciViewModel,
    nav: NavController,
) {
    val convs by vm.conversations.collectAsState()
    val usage by vm.usage.collectAsState()
    val billing by vm.billing.collectAsState()
    val err by vm.error.collectAsState()
    val daily by vm.dailySummary.collectAsState()
    val weekly by vm.weeklySummary.collectAsState()
    val summariesLoading by vm.summariesLoading.collectAsState()

    SereneAuthBackground {
        Column(Modifier.fillMaxSize()) {
            HomeTopBar(
                usage = usage,
                billing = billing,
                onUpgrade = { vm.showPaywallSheet() },
                onNewChat = {
                    vm.createConversation { id ->
                        nav.navigate("chat/$id")
                    }
                },
                onSettings = { nav.navigate("profile") },
            )
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .navigationBarsPadding(),
                contentPadding = PaddingValues(
                    start = 20.dp,
                    end = 20.dp,
                    top = 16.dp,
                    bottom = 28.dp,
                ),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                err?.let { e ->
                    item {
                        Text(
                            e,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(bottom = 4.dp),
                        )
                    }
                }
                item {
                    Column(Modifier.fillMaxWidth().padding(bottom = 4.dp)) {
                        Text(
                            "What are you eating next?",
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold),
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Text(
                            "Start a new chat or open one below — meal, restaurant, and grocery in any thread.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                }
                item {
                    HomeSummariesSection(
                        loading = summariesLoading,
                        daily = daily,
                        weekly = weekly,
                    )
                }
                if (convs.isNotEmpty()) {
                    item {
                        Text(
                            "Recent chats",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 10.dp, bottom = 2.dp),
                        )
                    }
                    items(convs, key = { it.id }) { c ->
                        HomeChatRow(
                            title = c.title,
                            onClick = { nav.navigate("chat/${c.id}") },
                            onDelete = { vm.deleteConversation(c.id) },
                        )
                    }
                } else {
                    item {
                        Text(
                            "No threads yet — tap + to start.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 16.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeTopBar(
    usage: Pair<Int, Int>?,
    billing: BillingStatusResponse?,
    onUpgrade: () -> Unit,
    onNewChat: () -> Unit,
    onSettings: () -> Unit,
) {
    val isActive = billing?.subscriptionStatus == "active"
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding(),
        color = Color.White.copy(alpha = 0.88f),
        shadowElevation = 2.dp,
        tonalElevation = 0.dp,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(
                Modifier
                    .weight(1f)
                    .padding(end = 8.dp),
            ) {
                Text(
                    "Gluci",
                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                    color = HomeSageMuted,
                )
                when {
                    isActive -> Text(
                        "Pro",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    else -> usage?.let { (used, limit) ->
                        Text(
                            "Free checks $used / $limit",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.End,
            ) {
                if (!isActive && billing?.stripeConfigured == true) {
                    TextButton(onClick = onUpgrade) {
                        Text(
                            "Upgrade",
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
                IconButton(
                    onClick = onNewChat,
                    modifier = Modifier.size(48.dp),
                ) {
                    Icon(
                        Icons.Outlined.Add,
                        contentDescription = "New chat",
                        tint = HomeSageMuted,
                        modifier = Modifier.size(26.dp),
                    )
                }
                IconButton(
                    onClick = onSettings,
                    modifier = Modifier.size(48.dp),
                ) {
                    Icon(
                        Icons.Outlined.Settings,
                        contentDescription = "Settings",
                        tint = HomeSageMuted,
                        modifier = Modifier.size(24.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun HomeChatRow(
    title: String,
    onClick: () -> Unit,
    onDelete: () -> Unit,
) {
    val outline = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)
    val cardFill = Color(0xFFFDFDFC)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 54.dp)
            .clip(ChatCardShape)
            .background(cardFill)
            .border(width = 1.dp, color = outline, shape = ChatCardShape)
            .padding(horizontal = 4.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .clip(ChatCardShape)
                .clickable(onClick = onClick)
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge.copy(background = Color.Unspecified),
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "›",
                style = MaterialTheme.typography.titleMedium.copy(
                    fontWeight = FontWeight.Medium,
                    background = Color.Unspecified,
                ),
                color = HomeSageMuted.copy(alpha = 0.5f),
                modifier = Modifier.padding(start = 10.dp),
            )
        }
        IconButton(onClick = onDelete) {
            Icon(
                Icons.Outlined.Delete,
                contentDescription = "Delete chat",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun formatSummaryRange(isoStart: String, isoEnd: String): String {
    val fmt = DateTimeFormatter.ofPattern("MMM d", Locale.getDefault())
    return try {
        val a = Instant.parse(isoStart).atZone(ZoneId.systemDefault()).format(fmt)
        val b = Instant.parse(isoEnd).atZone(ZoneId.systemDefault()).format(fmt)
        "$a – $b"
    } catch (_: Exception) {
        ""
    }
}

@Composable
private fun HomeSummariesSection(
    loading: Boolean,
    daily: DailySummaryDto?,
    weekly: WeeklySummaryDto?,
) {
    Column(
        Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            "Your summaries",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (loading) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.Center,
            ) {
                CircularProgressIndicator(
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(28.dp),
                    color = HomeSageMuted,
                )
            }
        } else {
            SummaryCard(
                icon = Icons.Outlined.CalendarMonth,
                title = "Today",
                body = if (daily != null) {
                    buildString {
                        append("${daily.checks} checks · avg ${daily.averageScore}/10\n")
                        if (daily.bestVerdict != null) {
                            append("Best: ${daily.bestVerdict}")
                            if (daily.bestScore != null) append(" (${daily.bestScore})")
                            append("\n")
                        }
                        append("Focus: ${daily.improvementArea}\n")
                        append("Tomorrow: ${daily.suggestionTomorrow}")
                    }
                } else {
                    "No Gluci checks yet today. Send a meal photo, restaurant question, or grocery barcode to see your daily summary."
                },
            )
            SummaryCard(
                icon = Icons.Outlined.DateRange,
                title = "Last 7 days",
                body = if (weekly != null) {
                    val range = formatSummaryRange(weekly.periodStart, weekly.periodEnd)
                    buildString {
                        if (range.isNotBlank()) append("$range\n")
                        append("${weekly.checks} checks · avg ${weekly.averageScore}/10\n")
                        append("${weekly.commonPattern}\n")
                        append("Swap tip: ${weekly.bestSwapHint}\n")
                        append("Trend: ${weekly.mostImprovedArea}\n")
                        append(weekly.focusNextWeek)
                    }
                } else {
                    "No checks recorded in the last 7 days. Your rolling week will appear here after your first scored decision."
                },
            )
        }
    }
}

@Composable
private fun SummaryCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    body: String,
) {
    val outline = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)
    val cardFill = Color(0xFFF8F9F8)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(ShortcutCardShape)
            .background(cardFill)
            .border(width = 1.dp, color = outline, shape = ShortcutCardShape)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = HomeSageMuted,
            modifier = Modifier.size(22.dp),
        )
        Column(Modifier.weight(1f)) {
            Text(
                title,
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                color = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                body,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
