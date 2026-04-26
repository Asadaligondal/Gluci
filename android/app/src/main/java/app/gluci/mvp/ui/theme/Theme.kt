package app.gluci.mvp.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Pink = Color(0xFFE94560)
private val Navy = Color(0xFF1A1A2E)

private val LightColors = lightColorScheme(
    primary = Pink,
    onPrimary = Color.White,
    secondary = Navy,
    background = Color(0xFFF8F9FA),
    surface = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = Pink,
    onPrimary = Color.White,
    secondary = Color(0xFFA8DADC),
    background = Navy,
    surface = Color(0xFF16213E),
)

@Composable
fun GluciTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColors,
        content = content,
    )
}
