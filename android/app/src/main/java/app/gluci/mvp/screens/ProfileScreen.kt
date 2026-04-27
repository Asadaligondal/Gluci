package app.gluci.mvp.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ExitToApp
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import app.gluci.mvp.vm.GluciViewModel

private val SageGradientStart = Color(0xFF42655B)
private val SageGradientMid = Color(0xFF5A756C)
private val SageGradientEnd = Color(0xFF769A8F)

private val SettingsCardShape = RoundedCornerShape(20.dp)
private val SettingsCardFill = Color(0xFFF8F9F8)
private val GoalFieldShape = RoundedCornerShape(14.dp)

/** Flat frosted card — avoids stacked translucent surfaces that read as “inner white boxes”. */
@Composable
private fun SettingsCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(SettingsCardShape)
            .background(SettingsCardFill)
            .border(
                width = 1.dp,
                color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.42f),
                shape = SettingsCardShape,
            )
            .padding(horizontal = 20.dp, vertical = 20.dp),
        content = content,
    )
}

@Composable
private fun SettingsSectionHeader(
    icon: ImageVector,
    title: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 4.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(22.dp),
        )
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun SubscriptionHeroCard(
    isActive: Boolean,
    billingLoaded: Boolean,
    freeUsed: Int,
    freeLimit: Int,
    renewsText: String?,
    cancelAtPeriodEnd: Boolean?,
    busy: Boolean,
    onUpgrade: () -> Unit,
    onManage: () -> Unit,
) {
    val gradient = Brush.linearGradient(
        colors = listOf(SageGradientStart, SageGradientMid, SageGradientEnd),
    )
    val heroShape = RoundedCornerShape(20.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(heroShape)
            .background(gradient)
            .padding(horizontal = 20.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color.White.copy(alpha = 0.16f))
                    .border(BorderStroke(1.dp, Color.White.copy(alpha = 0.35f)), RoundedCornerShape(8.dp))
                    .padding(horizontal = 10.dp, vertical = 6.dp),
            ) {
                Text(
                    "CURRENT PLAN",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.White,
                )
            }
            Icon(
                imageVector = Icons.Filled.CheckCircle,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.95f),
                modifier = Modifier.size(26.dp),
            )
        }
        Text(
            text = if (isActive) "Gluci Pro" else "Gluci Free",
            style = MaterialTheme.typography.headlineSmall.copy(
                fontWeight = FontWeight.Bold,
                color = Color.White,
            ),
        )
        Text(
            text = if (isActive) {
                "Advanced guidance and higher usage limits on your plan."
            } else {
                "Free checks: $freeUsed / $freeLimit · upgrade anytime for unlimited scanning and insights."
            },
            style = MaterialTheme.typography.bodyMedium,
            color = Color.White.copy(alpha = 0.92f),
        )
        renewsText?.takeIf { isActive }?.let { end ->
            Text(
                text = buildString {
                    append("Renews on $end")
                    if (cancelAtPeriodEnd == true) append(" · cancels at period end")
                },
                style = MaterialTheme.typography.labelMedium,
                color = Color.White.copy(alpha = 0.78f),
            )
        }
        if (!billingLoaded) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = Color.White,
                )
                Text(
                    "Loading plan…",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.85f),
                )
            }
        }
        Spacer(Modifier.height(4.dp))
        if (!isActive) {
            Button(
                onClick = onUpgrade,
                enabled = !busy && billingLoaded,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(999.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color.White,
                    contentColor = SageGradientStart,
                    disabledContainerColor = Color.White.copy(alpha = 0.65f),
                    disabledContentColor = SageGradientStart.copy(alpha = 0.55f),
                ),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp),
            ) {
                Text(
                    "Upgrade",
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                    modifier = Modifier.padding(vertical = 8.dp),
                )
            }
        } else {
            Button(
                onClick = onManage,
                enabled = !busy && billingLoaded,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(999.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color.White,
                    contentColor = SageGradientStart,
                    disabledContainerColor = Color.White.copy(alpha = 0.65f),
                    disabledContentColor = SageGradientStart.copy(alpha = 0.55f),
                ),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp),
            ) {
                Text(
                    "Manage subscription",
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                    modifier = Modifier.padding(vertical = 8.dp),
                )
            }
        }
    }
}

@Composable
fun ProfileScreen(vm: GluciViewModel, nav: NavController) {
    var goal by remember { mutableStateOf("") }
    var goalSeededFromServer by remember { mutableStateOf(false) }
    val billing by vm.billing.collectAsState()
    val profile by vm.profile.collectAsState()
    val busy by vm.busy.collectAsState()
    val err by vm.error.collectAsState()
    val ctx = LocalContext.current

    LaunchedEffect(Unit) {
        vm.refreshBilling()
        vm.refreshProfile()
    }
    LaunchedEffect(profile) {
        if (!goalSeededFromServer && profile != null) {
            goal = profile?.goal.orEmpty()
            goalSeededFromServer = true
        }
    }

    val isActive = billing?.subscriptionStatus == "active"
    val openCheckoutUrl: (String) -> Unit = { url ->
        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }

    SereneAuthBackground {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .statusBarsPadding()
                .navigationBarsPadding(),
        ) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = Color.White.copy(alpha = 0.92f),
                shadowElevation = 1.dp,
                tonalElevation = 0.dp,
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 52.dp)
                        .padding(horizontal = 4.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(
                        onClick = { nav.popBackStack() },
                        modifier = Modifier.size(48.dp),
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                    Box(
                        Modifier.weight(1f),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            "Settings",
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold),
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    Box(
                        modifier = Modifier.size(48.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Surface(
                            modifier = Modifier.size(36.dp),
                            shape = CircleShape,
                            color = Color(0xFFF0F3F1),
                            tonalElevation = 0.dp,
                            shadowElevation = 0.dp,
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Outlined.AccountCircle,
                                    contentDescription = "Account",
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(22.dp),
                                )
                            }
                        }
                    }
                }
            }

            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp)
                    .padding(top = 12.dp, bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                SettingsSectionHeader(Icons.Outlined.Person, "Profile", Modifier.padding(top = 4.dp))

                SettingsCard {
                    Text(
                        "PRIMARY GOAL",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "What you want Gluci to optimize for",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(14.dp))
                    OutlinedTextField(
                        value = goal,
                        onValueChange = { v -> goal = v },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 3,
                        placeholder = {
                            Text(
                                "e.g. stable glucose, more energy…",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
                            )
                        },
                        shape = GoalFieldShape,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = Color.Transparent,
                            unfocusedContainerColor = Color.Transparent,
                            disabledContainerColor = Color.Transparent,
                            focusedBorderColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.85f),
                            unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.65f),
                            disabledBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
                        ),
                    )
                    Spacer(Modifier.height(18.dp))
                    Button(
                        onClick = {
                            vm.setGoal(goal.trim())
                            nav.popBackStack()
                        },
                        enabled = goal.isNotBlank(),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(999.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.primary,
                            contentColor = MaterialTheme.colorScheme.onPrimary,
                            disabledContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.32f),
                            disabledContentColor = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.72f),
                        ),
                        elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp),
                    ) {
                        Text(
                            "Save goal",
                            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                            modifier = Modifier.padding(vertical = 8.dp),
                        )
                    }
                }

                SettingsSectionHeader(Icons.Outlined.AutoAwesome, "Subscription")

                val b = billing
                SubscriptionHeroCard(
                    isActive = isActive,
                    billingLoaded = b != null,
                    freeUsed = b?.freeChecksUsed ?: 0,
                    freeLimit = b?.freeLimit ?: 0,
                    renewsText = b?.currentPeriodEnd,
                    cancelAtPeriodEnd = b?.cancelAtPeriodEnd,
                    busy = busy,
                    onUpgrade = { vm.startCheckout(openCheckoutUrl) },
                    onManage = { vm.openBillingPortal(openCheckoutUrl) },
                )

                SettingsSectionHeader(Icons.Outlined.CreditCard, "Billing")

                SettingsCard {
                    if (b == null) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            CircularProgressIndicator(
                                Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.primary,
                            )
                            Text(
                                "Loading billing…",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    } else {
                        Text(
                            if (isActive) "Stripe · subscription active" else "No active subscription",
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            if (b.stripeConfigured) {
                                "Payments and invoices run in your Stripe customer portal."
                            } else {
                                "Billing is not fully configured on the server yet."
                            },
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        if (isActive && b.stripeConfigured) {
                            Spacer(Modifier.height(12.dp))
                            TextButton(
                                onClick = { vm.openBillingPortal(openCheckoutUrl) },
                                enabled = !busy,
                                contentPadding = PaddingValues(0.dp),
                                colors = ButtonDefaults.textButtonColors(
                                    contentColor = MaterialTheme.colorScheme.primary,
                                ),
                            ) {
                                Text(
                                    "Open billing portal",
                                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                                )
                            }
                        }
                        Spacer(Modifier.height(10.dp))
                        HorizontalDivider(
                            color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f),
                            thickness = 1.dp,
                        )
                        Spacer(Modifier.height(10.dp))
                        Text(
                            "Invoice history and payment methods are available after you open the portal.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (busy && b != null) {
                        Spacer(Modifier.height(10.dp))
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.primary,
                            )
                            Text(
                                "Contacting Stripe…",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                    TextButton(
                        onClick = { vm.refreshBilling() },
                        enabled = !busy,
                        modifier = Modifier.fillMaxWidth(),
                        contentPadding = PaddingValues(vertical = 4.dp),
                        colors = ButtonDefaults.textButtonColors(
                            contentColor = MaterialTheme.colorScheme.primary,
                        ),
                    ) {
                        Text(
                            "Refresh from server",
                            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Medium),
                        )
                    }
                }

                Spacer(Modifier.height(6.dp))

                SettingsCard {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .clickable {
                                vm.signOut {
                                    nav.navigate("welcome") {
                                        popUpTo("home") { inclusive = true }
                                    }
                                }
                            }
                            .padding(vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Outlined.ExitToApp,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(24.dp),
                        )
                        Text(
                            "Sign out",
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Medium),
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }

                err?.let {
                    Text(
                        it,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 12.dp),
                    )
                }
            }
        }
    }
}
