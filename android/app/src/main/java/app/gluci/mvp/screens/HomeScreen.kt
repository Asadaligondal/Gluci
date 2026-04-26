package app.gluci.mvp.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Fastfood
import androidx.compose.material.icons.filled.LocalBar
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import app.gluci.mvp.vm.GluciViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    vm: GluciViewModel,
    nav: NavController,
) {
    val convs by vm.conversations.collectAsState()
    val usage by vm.usage.collectAsState()
    val billing by vm.billing.collectAsState()
    val err by vm.error.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Gluci", style = MaterialTheme.typography.titleLarge)
                        val isActive = billing?.subscriptionStatus == "active"
                        when {
                            isActive -> Text("Pro", style = MaterialTheme.typography.labelSmall)
                            else -> usage?.let { (used, limit) ->
                                Text("Free checks $used / $limit", style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                },
                actions = {
                    val isActive = billing?.subscriptionStatus == "active"
                    if (!isActive && billing?.stripeConfigured == true) {
                        TextButton(onClick = { vm.showPaywallSheet() }) { Text("Upgrade") }
                    }
                    IconButton(
                        onClick = {
                            vm.createConversation { id ->
                                nav.navigate("chat/$id")
                            }
                        },
                    ) { Icon(Icons.Default.Add, contentDescription = "New chat") }
                    IconButton(onClick = { nav.navigate("profile") }) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 20.dp),
        ) {
            err?.let {
                Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(8.dp))
            }
            Text(
                "What are you eating next?",
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(vertical = 8.dp),
            )
            Text(
                "Start with a quick action or open a chat",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            FilledTonalButton(
                onClick = {
                    vm.newChatWithQuickHint("I want to check a meal. Should I eat this? (I'll send a photo next.)") { id ->
                        nav.navigate("chat/$id")
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp),
            ) {
                Icon(Icons.Default.Fastfood, contentDescription = null, modifier = Modifier.padding(end = 8.dp))
                Text("Check a meal")
            }
            FilledTonalButton(
                onClick = {
                    vm.newChatWithQuickHint("Help me pick the best ~3 things to order for stable glucose. Restaurant name:") { id ->
                        nav.navigate("chat/$id")
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
            ) {
                Icon(Icons.Default.LocalBar, contentDescription = null, modifier = Modifier.padding(end = 8.dp))
                Text("Restaurant")
            }
            FilledTonalButton(
                onClick = {
                    vm.newChatWithQuickHint("Help me rate this grocery item. I'll scan the barcode or describe it.") { id ->
                        nav.navigate("chat/$id")
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
            ) {
                Icon(Icons.Default.ShoppingCart, contentDescription = null, modifier = Modifier.padding(end = 8.dp))
                Text("Grocery / barcode")
            }
            Text(
                "Chats",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(top = 20.dp, bottom = 8.dp),
            )
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.weight(1f),
            ) {
                if (convs.isEmpty()) {
                    item {
                        Text(
                            "No chats yet — tap + or a quick action to start",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                items(convs, key = { it.id }) { c ->
                    Card(Modifier.fillMaxWidth().clickable { nav.navigate("chat/${c.id}") }) {
                        Text(
                            c.title,
                            modifier = Modifier.padding(16.dp),
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                }
            }
        }
    }
}
