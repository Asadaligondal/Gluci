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
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Storefront
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
import app.gluci.mvp.vm.GluciViewModel

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
                            "Pick a shortcut or jump into a thread below.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                }
                item {
                    HomeQuickRow(
                        icon = Icons.Outlined.Restaurant,
                        label = "Check a meal",
                        onClick = {
                            vm.newChatWithQuickHint(
                                "I want to check a meal. Should I eat this? (I'll send a photo next.)",
                            ) { id -> nav.navigate("chat/$id") }
                        },
                    )
                }
                item {
                    HomeQuickRow(
                        icon = Icons.Outlined.Storefront,
                        label = "Restaurant",
                        onClick = {
                            vm.newChatWithQuickHint(
                                "Help me pick the best ~3 things to order for stable glucose. Restaurant name:",
                            ) { id -> nav.navigate("chat/$id") }
                        },
                    )
                }
                item {
                    HomeQuickRow(
                        icon = Icons.Outlined.QrCodeScanner,
                        label = "Grocery / barcode",
                        onClick = {
                            vm.newChatWithQuickHint(
                                "Help me rate this grocery item. I'll scan the barcode or describe it.",
                            ) { id -> nav.navigate("chat/$id") }
                        },
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
                        )
                    }
                } else {
                    item {
                        Text(
                            "No threads yet — tap + or a shortcut to start.",
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
private fun HomeQuickRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
) {
    val outline = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
    val cardFill = Color(0xFFF8F9F8)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 58.dp)
            .clip(ShortcutCardShape)
            .background(cardFill)
            .border(width = 1.dp, color = outline, shape = ShortcutCardShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = HomeSageMuted,
            modifier = Modifier.size(24.dp),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge.copy(background = Color.Unspecified),
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun HomeChatRow(
    title: String,
    onClick: () -> Unit,
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
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
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
}
