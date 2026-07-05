package app.gluci.mvp.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import app.gluci.mvp.data.BillingStatusResponse
import app.gluci.mvp.data.DailySummaryDto
import app.gluci.mvp.data.WeekDailyBarDto
import app.gluci.mvp.data.WeeklySummaryDto
import app.gluci.mvp.ui.components.GlucoseWeekSection
import app.gluci.mvp.vm.GluciViewModel
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val HomeSageMuted = Color(0xFF769A8F)
private val HomeForestGreen = Color(0xFF2D5A4B)
private val ShortcutCardShape = RoundedCornerShape(16.dp)
private val ChatCardShape = RoundedCornerShape(14.dp)
private val StatCardShape = RoundedCornerShape(14.dp)

private fun computeStreak(bars: List<WeekDailyBarDto>): Int {
    val sorted = bars.sortedByDescending { it.date }
    var streak = 0
    for (bar in sorted) {
        if (bar.checks > 0) streak++ else break
    }
    return streak
}

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
    val weekDailyBars by vm.weekDailyBars.collectAsState()

    LaunchedEffect(Unit) {
        vm.logAnalyticsEvent("app_open", emptyMap())
    }

    val createChat: () -> Unit = {
        vm.createConversation { id -> nav.navigate("chat/$id") }
    }

    SereneAuthBackground {
        Column(Modifier.fillMaxSize()) {
            HomeTopBar(
                usage = usage,
                billing = billing,
                onUpgrade = { vm.showPaywallSheet() },
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
                    top = 20.dp,
                    bottom = 28.dp,
                ),
                verticalArrangement = Arrangement.spacedBy(14.dp),
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

                // Primary action buttons
                item {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Button(
                            onClick = createChat,
                            modifier = Modifier.weight(1.35f),
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = HomeForestGreen,
                                contentColor = Color.White,
                            ),
                        ) {
                            Text(
                                "Snap a meal",
                                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                                modifier = Modifier.padding(vertical = 6.dp),
                            )
                        }
                        OutlinedButton(
                            onClick = createChat,
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(14.dp),
                            border = BorderStroke(1.dp, HomeForestGreen.copy(alpha = 0.38f)),
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = HomeForestGreen,
                            ),
                        ) {
                            Text(
                                "Ask Gluci",
                                style = MaterialTheme.typography.labelLarge,
                                modifier = Modifier.padding(vertical = 6.dp),
                            )
                        }
                    }
                }

                // Stats tiles
                item {
                    val streak = computeStreak(weekDailyBars)
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        StatTile(
                            modifier = Modifier.weight(1f),
                            value = if (summariesLoading) "—" else "${daily?.checks ?: 0}",
                            label = "checks",
                        )
                        StatTile(
                            modifier = Modifier.weight(1f),
                            value = if (summariesLoading) "—" else daily?.averageScore?.let { "%.1f".format(it) } ?: "—",
                            label = "avg",
                            highlight = true,
                        )
                        StatTile(
                            modifier = Modifier.weight(1f),
                            value = "${streak}d",
                            label = "streak",
                        )
                    }
                }

                // Glucose week chart
                item {
                    GlucoseWeekSection(
                        bars = weekDailyBars,
                        loading = summariesLoading,
                    )
                }

                // Daily + weekly summaries
                item {
                    HomeSummariesSection(
                        loading = summariesLoading,
                        daily = daily,
                        weekly = weekly,
                    )
                }

                // Recent conversations
                if (convs.isNotEmpty()) {
                    item {
                        Text(
                            "Recent",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 6.dp, bottom = 2.dp),
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
                            "No threads yet — tap Snap a meal to start.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 8.dp),
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
    onSettings: () -> Unit,
) {
    val isActive = billing?.subscriptionStatus == "active"
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding(),
        color = Color.White.copy(alpha = 0.92f),
        shadowElevation = 1.dp,
        tonalElevation = 0.dp,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    "Today",
                    style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onBackground,
                )
                if (!isActive) {
                    usage?.let { (used, limit) ->
                        Text(
                            "$used / $limit free checks",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                if (isActive) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(HomeForestGreen.copy(alpha = 0.12f))
                            .padding(horizontal = 10.dp, vertical = 5.dp),
                    ) {
                        Text(
                            "Pro",
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                            color = HomeForestGreen,
                        )
                    }
                    Spacer(Modifier.width(4.dp))
                } else if (billing?.stripeConfigured == true) {
                    TextButton(
                        onClick = onUpgrade,
                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                    ) {
                        Text(
                            "Upgrade",
                            style = MaterialTheme.typography.labelLarge,
                            color = HomeForestGreen,
                        )
                    }
                }
                IconButton(
                    onClick = onSettings,
                    modifier = Modifier.size(40.dp),
                ) {
                    Icon(
                        Icons.Outlined.Settings,
                        contentDescription = "Settings",
                        tint = HomeSageMuted,
                        modifier = Modifier.size(22.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun StatTile(
    modifier: Modifier = Modifier,
    value: String,
    label: String,
    highlight: Boolean = false,
) {
    val outline = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)
    Column(
        modifier = modifier
            .clip(StatCardShape)
            .background(Color(0xFFFDFDFC))
            .border(1.dp, outline, StatCardShape)
            .padding(horizontal = 10.dp, vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = value,
            style = MaterialTheme.typography.headlineSmall.copy(
                fontWeight = FontWeight.Bold,
                fontSize = 26.sp,
            ),
            color = if (highlight) HomeForestGreen else MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )
    }
}

@Composable
private fun HomeChatRow(
    title: String,
    onClick: () -> Unit,
    onDelete: () -> Unit,
) {
    val outline = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 50.dp)
            .clip(ChatCardShape)
            .background(Color(0xFFFDFDFC))
            .border(1.dp, outline, ChatCardShape)
            .padding(horizontal = 4.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .clip(ChatCardShape)
                .clickable(onClick = onClick)
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }
        IconButton(
            onClick = onDelete,
            modifier = Modifier.size(40.dp),
        ) {
            Icon(
                Icons.Outlined.Delete,
                contentDescription = "Delete chat",
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                modifier = Modifier.size(18.dp),
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
    val outline = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(ShortcutCardShape)
            .background(Color(0xFFFDFDFC))
            .border(1.dp, outline, ShortcutCardShape)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = HomeSageMuted,
            modifier = Modifier.size(20.dp),
        )
        Column(Modifier.weight(1f)) {
            Text(
                title,
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                color = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(5.dp))
            Text(
                body,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
