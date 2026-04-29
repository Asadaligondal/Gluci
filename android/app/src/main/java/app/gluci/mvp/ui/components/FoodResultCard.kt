package app.gluci.mvp.ui.components

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.gluci.mvp.data.GluciCurvePoint

private fun verdictBadgeColors(verdict: String): Pair<Color, Color> {
    val v = verdict.trim().lowercase()
    return when {
        v.contains("avoid") -> Color(0xFFB71C1C) to Color.White
        v.contains("modify") -> Color(0xFFE65100) to Color.White
        v.contains("eat") -> Color(0xFF2E7D32) to Color.White
        else -> Color(0xFF546E7A) to Color.White
    }
}

private fun verdictLabel(raw: String): String {
    val v = raw.trim().lowercase()
    return when {
        v.contains("avoid") -> "AVOID"
        v.contains("modify") -> "MODIFY"
        v.contains("eat") -> "EAT"
        else -> raw.uppercase().take(14)
    }
}

@Composable
fun FoodResultCard(
    score: Float,
    verdict: String,
    tip: String,
    foodName: String,
    foodImageUrl: String?,
    curvePoints: List<GluciCurvePoint>,
    shareCardUrl: String?,
    onShare: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val outline = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)
    val shape = RoundedCornerShape(18.dp)

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = shape,
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
        tonalElevation = 1.dp,
        shadowElevation = 2.dp,
    ) {
        Column(
            Modifier
                .border(1.dp, outline, shape)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = String.format("%.1f/10", score),
                    style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.primary,
                )
                val (bg, fg) = verdictBadgeColors(verdict)
                Surface(
                    shape = RoundedCornerShape(50),
                    color = bg,
                ) {
                    Text(
                        text = verdictLabel(verdict),
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                        color = fg,
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                    )
                }
            }

            GlucoseCurveChart(
                curvePoints = curvePoints,
                foodName = foodName,
                foodImageUrl = foodImageUrl,
            )

            if (tip.isNotBlank()) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = tip,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.padding(14.dp),
                    )
                }
            }

            Button(
                onClick = onShare,
                modifier = Modifier.fillMaxWidth(),
                enabled = shareCardUrl != null,
                shape = RoundedCornerShape(28.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
            ) {
                Icon(Icons.Filled.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.size(8.dp))
                Text("Share GlucoseGal card")
            }
        }
    }
}
