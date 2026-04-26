package app.gluci.mvp.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import app.gluci.mvp.vm.GluciViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(vm: GluciViewModel, nav: NavController) {
    var goal by remember { mutableStateOf("") }
    val billing by vm.billing.collectAsState()
    val busy by vm.busy.collectAsState()
    val err by vm.error.collectAsState()
    val ctx = LocalContext.current

    LaunchedEffect(Unit) { vm.refreshBilling() }

    val isActive = billing?.subscriptionStatus == "active"

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Card(Modifier.fillMaxWidth()) {
                Column(
                    Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("Subscription", style = MaterialTheme.typography.titleMedium)
                    val b = billing
                    if (b == null) {
                        Text("Loading…", style = MaterialTheme.typography.bodyMedium)
                    } else {
                        Text(
                            "Status: ${b.subscriptionStatus}",
                            style = MaterialTheme.typography.bodyLarge,
                        )
                        Text(
                            "Free checks: ${b.freeChecksUsed} / ${b.freeLimit}",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        b.currentPeriodEnd?.let {
                            Text(
                                "Renews: $it" + if (b.cancelAtPeriodEnd == true) " · cancels at period end" else "",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.labelMedium,
                            )
                        }
                        if (!b.stripeConfigured) {
                            Text(
                                "Stripe is not configured on the server yet.",
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.labelMedium,
                            )
                        }
                    }
                    if (!isActive) {
                        Button(
                            onClick = {
                                vm.startCheckout { url ->
                                    ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                                }
                            },
                            enabled = !busy && (billing?.stripeConfigured == true),
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("Upgrade") }
                    } else {
                        OutlinedButton(
                            onClick = {
                                vm.openBillingPortal { url ->
                                    ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                                }
                            },
                            enabled = !busy,
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("Manage subscription") }
                    }
                    TextButton(
                        onClick = { vm.refreshBilling() },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Refresh status") }
                }
            }

            HorizontalDivider()

            Text("Your goal", style = MaterialTheme.typography.titleMedium)
            Text(
                "Primary goal (e.g. stable glucose, more energy, weight management)",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
            )
            OutlinedTextField(
                value = goal,
                onValueChange = { goal = it },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
            )
            Button(
                onClick = {
                    vm.setGoal(goal.trim())
                    nav.popBackStack()
                },
                enabled = goal.isNotBlank(),
            ) { Text("Save") }

            err?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            HorizontalDivider()

            TextButton(
                onClick = {
                    vm.signOut {
                        nav.navigate("welcome") {
                            popUpTo("home") { inclusive = true }
                        }
                    }
                },
            ) { Text("Sign out") }
        }
    }
}
