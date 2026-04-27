package app.gluci.mvp.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// Serene nutrition palette (aligned with web mock: primary / sage / warm surface)
private val Primary = Color(0xFF42655B)
private val PrimaryContainer = Color(0xFF769A8F)
private val OnPrimaryContainer = Color(0xFF0D3129)
private val Surface = Color(0xFFFAF9F7)
private val SurfaceVariant = Color(0xFFE2E2E1)
private val OnSurface = Color(0xFF1A1C1B)
private val OnSurfaceVariant = Color(0xFF414846)
private val OutlineVariant = Color(0xFFC1C8C4)
private val Secondary = Color(0xFF486178)

private val GluciTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 32.sp,
        lineHeight = 38.sp,
        letterSpacing = (-0.02).sp,
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 24.sp,
        lineHeight = 31.sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 21.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 12.sp,
        lineHeight = 12.sp,
        letterSpacing = 0.6.sp,
    ),
)

private val LightColors = lightColorScheme(
    primary = Primary,
    onPrimary = Color.White,
    primaryContainer = PrimaryContainer,
    onPrimaryContainer = OnPrimaryContainer,
    secondary = Secondary,
    onSecondary = Color.White,
    tertiary = Color(0xFF5D5E63),
    background = Surface,
    onBackground = OnSurface,
    surface = Color.White,
    onSurface = OnSurface,
    surfaceVariant = SurfaceVariant,
    onSurfaceVariant = OnSurfaceVariant,
    outline = Color(0xFF717975),
    outlineVariant = OutlineVariant,
)

@Composable
fun GluciTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColors,
        typography = GluciTypography,
        content = content,
    )
}
