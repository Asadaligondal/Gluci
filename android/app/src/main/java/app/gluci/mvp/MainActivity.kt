package app.gluci.mvp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import app.gluci.mvp.screens.BarcodeScreen
import app.gluci.mvp.screens.ChatScreen
import app.gluci.mvp.screens.HomeScreen
import app.gluci.mvp.screens.ProfileScreen
import app.gluci.mvp.screens.SignInScreen
import app.gluci.mvp.screens.SignUpScreen
import app.gluci.mvp.screens.WelcomeScreen
import app.gluci.mvp.ui.theme.GluciTheme
import app.gluci.mvp.vm.GluciViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val nav = rememberNavController()
            val vm: GluciViewModel = viewModel()
            GluciTheme {
                NavHost(navController = nav, startDestination = "splash") {
                    composable("splash") {
                        LaunchedEffect(Unit) {
                            if (vm.getTokenOnce() != null) {
                                nav.navigate("home") {
                                    popUpTo("splash") { inclusive = true }
                                }
                                vm.onSessionStart()
                            } else {
                                nav.navigate("welcome") {
                                    popUpTo("splash") { inclusive = true }
                                }
                            }
                        }
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                    }
                    composable("welcome") { WelcomeScreen(nav) }
                    composable("signup") { SignUpScreen(vm, nav) }
                    composable("signin") { SignInScreen(vm, nav) }
                    composable("home") { HomeScreen(vm, nav) }
                    composable(
                        "chat/{convId}",
                        arguments = listOf(navArgument("convId") { type = NavType.StringType }),
                    ) { entry ->
                        val id = entry.arguments?.getString("convId") ?: return@composable
                        ChatScreen(vm, nav, id)
                    }
                    composable("profile") { ProfileScreen(vm, nav) }
                    composable("barcode") { BarcodeScreen(vm, nav) }
                }
            }
        }
    }
}
