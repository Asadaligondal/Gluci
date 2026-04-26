package app.gluci.mvp.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import app.gluci.mvp.vm.GluciViewModel
import app.gluci.mvp.vm.UiMessage

@OptIn(ExperimentalMaterial3Api::class)
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

    LaunchedEffect(conversationId) {
        vm.openConversation(conversationId) { }
    }

    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let { vm.sendImage(it, input.ifBlank { null }) }
        input = ""
    }

    Scaffold(
        modifier = Modifier.imePadding(),
        topBar = {
            TopAppBar(
                title = { Text("Chat") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { pickImage.launch("image/*") }) {
                        Icon(Icons.Default.Image, contentDescription = "Photo")
                    }
                    IconButton(onClick = { nav.navigate("barcode") }) {
                        Icon(Icons.Default.QrCodeScanner, contentDescription = "Scan barcode")
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            err?.let {
                Text(
                    it,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(12.dp, 8.dp, 12.dp, 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (messages.isEmpty() && !busy) {
                    item {
                        Text(
                            "Send a message, a food photo, or a restaurant question. Gluci keeps things practical and non‑judgy.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                items(
                    count = messages.size,
                    key = { i -> "m-$i-${messages[i].content.hashCode()}" },
                ) { i ->
                    Bubble(messages[i])
                }
                if (busy) {
                    item { CircularProgressIndicator(Modifier.padding(8.dp)) }
                }
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp),
            ) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    modifier = Modifier
                        .weight(1f),
                    placeholder = { Text("Message…") },
                    minLines = 1,
                    maxLines = 6,
                )
                if (!busy) {
                    TextButton(
                        onClick = {
                            vm.sendText(input)
                            input = ""
                        },
                        enabled = input.isNotBlank(),
                    ) { Text("Send") }
                }
            }
        }
    }
}

@Composable
private fun Bubble(m: UiMessage) {
    val isUser = m.role == "user"
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        Surface(
            shape = RoundedCornerShape(
                20.dp,
                20.dp,
                if (isUser) 4.dp else 20.dp,
                if (isUser) 20.dp else 4.dp,
            ),
            color = if (isUser) MaterialTheme.colorScheme.primaryContainer
            else MaterialTheme.colorScheme.surfaceVariant,
            modifier = Modifier.widthIn(max = 320.dp),
        ) {
            Text(
                m.content,
                modifier = Modifier.padding(12.dp, 10.dp, 12.dp, 10.dp),
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Start,
            )
        }
    }
}
