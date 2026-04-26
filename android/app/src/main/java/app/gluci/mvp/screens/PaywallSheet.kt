package app.gluci.mvp.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.gluci.mvp.vm.GluciViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaywallSheet(vm: GluciViewModel) {
    val show by vm.showPaywall.collectAsState()
    val url by vm.paywallUrl.collectAsState()
    val billing by vm.billing.collectAsState()
    val busy by vm.busy.collectAsState()
    val ctx = LocalContext.current

    if (!show) return

    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = { vm.dismissPaywall() },
        sheetState = sheetState,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Upgrade Gluci", style = MaterialTheme.typography.headlineSmall)
            Text(
                "You've used your free food decisions. Subscribe to unlock unlimited meal, " +
                    "restaurant, and grocery checks, plus saved history and share cards.",
                style = MaterialTheme.typography.bodyMedium,
            )
            billing?.let {
                Text(
                    "Status: ${it.subscriptionStatus} · Free used ${it.freeChecksUsed}/${it.freeLimit}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Button(
                onClick = {
                    val u = url
                    if (u != null) {
                        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u)))
                    } else {
                        vm.startCheckout { newUrl ->
                            ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(newUrl)))
                        }
                    }
                },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (url != null) "Continue to checkout" else "Subscribe") }
            TextButton(
                onClick = {
                    vm.refreshBilling()
                    vm.dismissPaywall()
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("I've already paid · refresh status") }
            TextButton(
                onClick = { vm.dismissPaywall() },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Not now") }
        }
    }
}
