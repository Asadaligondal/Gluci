package app.gluci.mvp.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController

@Composable
fun WelcomeScreen(nav: NavController) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Gluci", style = MaterialTheme.typography.displaySmall)
        Text(
            "Before you eat, ask Gluci. Food choices that match your goals — chat-first, low shame.",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(vertical = 16.dp),
        )
        Button(
            onClick = { nav.navigate("signup") },
            modifier = Modifier.padding(top = 8.dp),
        ) { Text("Create account") }
        Button(
            onClick = { nav.navigate("signin") },
            modifier = Modifier.padding(top = 8.dp),
        ) { Text("Sign in") }
    }
}
