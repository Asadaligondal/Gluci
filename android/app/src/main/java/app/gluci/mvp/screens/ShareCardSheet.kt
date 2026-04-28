package app.gluci.mvp.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import app.gluci.mvp.data.ApiModule
import coil.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.Request
import java.io.File

/**
 * Small clickable preview rendered inside an assistant bubble whenever the
 * backend attached a share-card PNG. Tapping it opens [ShareCardSheet].
 */
@Composable
fun ShareCardPreview(
    url: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val resolved = remember(url) { url.reachableMediaUrl() }
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 16.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(Color.White.copy(alpha = 0.6f))
            .clickable(onClick = onClick)
            .padding(8.dp),
    ) {
        AsyncImage(
            model = resolved,
            contentDescription = "Gluci share card preview",
            contentScale = ContentScale.Crop,
            alignment = Alignment.TopCenter,
            modifier = Modifier
                .fillMaxWidth()
                .height(160.dp)
                .clip(RoundedCornerShape(10.dp)),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(
                Icons.Filled.Share,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(end = 4.dp),
            )
            Text(
                "Tap to view & share",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareCardSheet(
    url: String,
    captionText: String,
    shareLandingUrl: String? = null,
    onDismiss: () -> Unit,
    onCopyInviteLink: () -> Unit = {},
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val resolvedUrl = remember(url) { url.reachableMediaUrl() }
    var sharing by remember { mutableStateOf(false) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                "Share your Gluci card",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(bottom = 12.dp),
            )
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(9f / 16f)
                    .clip(RoundedCornerShape(18.dp))
                    .background(Color.Black.copy(alpha = 0.05f)),
                contentAlignment = Alignment.Center,
            ) {
                AsyncImage(
                    model = resolvedUrl,
                    contentDescription = "Gluci share card",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(9f / 16f)
                        .clip(RoundedCornerShape(18.dp)),
                )
            }
            Spacer(Modifier.height(16.dp))
            shareLandingUrl?.let { landing ->
                OutlinedButton(
                    onClick = {
                        val cm =
                            ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        cm.setPrimaryClip(ClipData.newPlainText("Gluci invite", landing))
                        Toast.makeText(ctx, "Invite link copied", Toast.LENGTH_SHORT).show()
                        onCopyInviteLink()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(28.dp),
                ) {
                    Text("Copy invite link")
                }
                Spacer(Modifier.height(12.dp))
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedButton(
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(28.dp),
                ) {
                    Text("Close")
                }
                Button(
                    onClick = {
                        if (sharing) return@Button
                        sharing = true
                        scope.launch {
                            val ok = shareCardImage(ctx, resolvedUrl, captionText)
                            sharing = false
                            if (!ok) {
                                Toast.makeText(
                                    ctx,
                                    "Couldn't prepare the card for sharing.",
                                    Toast.LENGTH_SHORT,
                                ).show()
                            }
                        }
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(28.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                    ),
                ) {
                    Icon(
                        Icons.Filled.Share,
                        contentDescription = null,
                        modifier = Modifier
                            .padding(end = 6.dp)
                            .width(18.dp),
                    )
                    Text(if (sharing) "Preparing…" else "Share")
                }
            }
        }
    }

    LaunchedEffect(Unit) { sheetState.show() }
}

/**
 * Downloads the share-card PNG into the app's cache, exposes it via [FileProvider],
 * and fires Android's share chooser. Works with Instagram, Facebook, WhatsApp, etc.
 */
private suspend fun shareCardImage(
    ctx: Context,
    url: String,
    captionText: String,
): Boolean {
    val cardsDir = File(ctx.cacheDir, "cards").apply { mkdirs() }
    val raw = url.substringAfterLast('/').substringBefore('?').ifBlank {
        "gluci-card-${System.currentTimeMillis()}.png"
    }
    val safeName = raw.replace(Regex("[^a-zA-Z0-9._-]"), "_").take(100)
        .ifBlank { "gluci-card-${System.currentTimeMillis()}.png" }
    val file = File(cardsDir, safeName)
    return try {
        if (!file.exists() || file.length() == 0L) {
            withContext(Dispatchers.IO) {
                val client = ApiModule.coilOkHttpClient()
                val req = Request.Builder().url(url).build()
                client.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) error("HTTP ${resp.code}")
                    val body = resp.body ?: error("empty body")
                    body.byteStream().use { input ->
                        file.outputStream().use { output -> input.copyTo(output) }
                    }
                }
            }
        }
        if (file.length() == 0L) return false
        val uri: Uri = FileProvider.getUriForFile(
            ctx,
            "${ctx.packageName}.fileprovider",
            file,
        )
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "image/png"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_TEXT, captionText)
            clipData = ClipData.newUri(ctx.contentResolver, "Gluci card", uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val chooser = Intent.createChooser(send, "Share Gluci card").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        ctx.startActivity(chooser)
        true
    } catch (_: Exception) {
        false
    }
}
