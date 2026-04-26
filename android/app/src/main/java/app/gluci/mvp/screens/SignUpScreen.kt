package app.gluci.mvp.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import app.gluci.mvp.vm.GluciViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SignUpScreen(
    vm: GluciViewModel,
    nav: NavController,
) {
    var email by remember { mutableStateOf("") }
    var pass by remember { mutableStateOf("") }
    val busy by vm.busy.collectAsState()
    val err by vm.error.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Create account") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding).padding(20.dp)) {
            err?.let {
                Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(bottom = 8.dp))
            }
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Email") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = pass,
                onValueChange = { pass = it },
                label = { Text("Password (8+ characters)") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
            )
            if (busy) {
                CircularProgressIndicator(Modifier.padding(top = 16.dp))
            } else {
                Button(
                    onClick = {
                        vm.signUp(email, pass) {
                            nav.navigate("home") {
                                popUpTo("welcome") { inclusive = true }
                            }
                        }
                    },
                    enabled = email.isNotBlank() && pass.length >= 8,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 20.dp),
                ) { Text("Sign up") }
            }
        }
    }
}
