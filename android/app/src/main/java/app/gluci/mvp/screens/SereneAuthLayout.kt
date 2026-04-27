package app.gluci.mvp.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** Radial serene gradient aligned with web reference (#c5ebde → #faf9f7 → #e2e2e1). */
@Composable
fun SereneAuthBackground(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    val brush = Brush.radialGradient(
        colors = listOf(
            Color(0xFFC5EBDE),
            Color(0xFFFAF9F7),
            Color(0xFFE2E2E1),
        ),
        center = Offset.Zero,
        radius = 1400f,
    )
    Box(modifier.fillMaxSize().background(brush)) { content() }
}

@Composable
fun GlassAuthCard(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(24.dp),
        color = Color.White.copy(alpha = 0.72f),
        tonalElevation = 0.dp,
        shadowElevation = 6.dp,
        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.45f)),
        content = content,
    )
}

/** Pill-shaped fields matching reference `rounded-full`. */
val AuthFieldShape = RoundedCornerShape(28.dp)
