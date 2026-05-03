package app.gluci.mvp.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Science
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.gluci.mvp.data.GluciCurvePoint

private fun verdictTone(raw: String): Triple<String, Color, Color> {
    val v = raw.trim().lowercase()
    return when {
        v.contains("avoid") -> Triple("AVOID", Color(0xFFFFEBEE), Color(0xFFC62828))
        v.contains("modify") -> Triple("MODIFY", Color(0xFFFFF3E0), Color(0xFFE65100))
        v.contains("eat") -> Triple("EAT", Color(0xFFE8F5E9), Color(0xFF2E7D32))
        else -> Triple(raw.uppercase().take(14), Color(0xFFF5F5F5), Color(0xFF424242))
    }
}

private fun scoreColorForVerdict(raw: String): Color {
    val v = raw.trim().lowercase()
    return when {
        v.contains("avoid") -> Color(0xFFC62828)
        v.contains("modify") -> Color(0xFFE65100)
        v.contains("eat") -> Color(0xFF2E7D32)
        else -> Color(0xFF546E7A)
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
    ragAdjusted: Boolean? = null,
) {
    val (badgeLabel, badgeBg, badgeFg) = verdictTone(verdict)
    val scoreMainColor = scoreColorForVerdict(verdict)

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // Score + verdict badge row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    text = String.format("%.1f", score),
                    fontSize = 36.sp,
                    fontWeight = FontWeight.Bold,
                    color = scoreMainColor,
                )
                Text(
                    text = "/10",
                    fontSize = 18.sp,
                    color = Color(0xFF888888),
                    modifier = Modifier.padding(start = 2.dp, bottom = 4.dp),
                )
            }
            Box(
                modifier = Modifier
                    .background(badgeBg, RoundedCornerShape(20.dp))
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            ) {
                Text(
                    text = badgeLabel,
                    color = badgeFg,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    maxLines = 1,
                )
            }
        }

        if (ragAdjusted == true) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(horizontal = 4.dp),
            ) {
                Icon(
                    Icons.Default.Science,
                    contentDescription = null,
                    modifier = Modifier.size(10.dp),
                    tint = Color(0xFF9C27B0),
                )
                Spacer(Modifier.width(3.dp))
                Text(
                    "Science-backed",
                    fontSize = 9.sp,
                    color = Color(0xFF9C27B0),
                )
            }
        }

        GlucoseCurveChart(
            curvePoints = curvePoints,
            foodName = foodName,
            foodImageUrl = foodImageUrl,
            onShare = onShare,
        )

        if (tip.isNotBlank()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFFFFBF0), RoundedCornerShape(10.dp))
                    .border(1.dp, Color(0xFFDDCCAA), RoundedCornerShape(10.dp))
                    .padding(12.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Text(
                    text = "💡",
                    fontSize = 16.sp,
                    modifier = Modifier.padding(end = 8.dp, top = 1.dp),
                )
                Text(
                    text = tip,
                    fontSize = 13.sp,
                    color = Color(0xFF444444),
                    lineHeight = 18.sp,
                )
            }
        }

    }
}
