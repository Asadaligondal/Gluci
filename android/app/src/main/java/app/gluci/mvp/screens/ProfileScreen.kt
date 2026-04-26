package app.gluci.mvp.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import app.gluci.mvp.vm.GluciViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(vm: GluciViewModel, nav: NavController) {
    var goal by remember { mutableStateOf("") }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Your goal") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding).padding(16.dp)) {
            Text(
                "Primary goal (e.g. stable glucose, more energy, weight management)",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedTextField(
                value = goal,
                onValueChange = { goal = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                minLines = 2,
            )
            Button(
                onClick = {
                    vm.setGoal(goal.trim())
                    nav.popBackStack()
                },
                modifier = Modifier.padding(top = 16.dp),
                enabled = goal.isNotBlank(),
            ) { Text("Save") }
            TextButton(
                onClick = {
                    vm.signOut {
                        nav.navigate("welcome") {
                            popUpTo("home") { inclusive = true }
                        }
                    }
                },
                modifier = Modifier.padding(top = 24.dp),
            ) { Text("Sign out") }
        }
    }
}
