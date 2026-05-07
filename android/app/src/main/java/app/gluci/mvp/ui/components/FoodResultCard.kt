package app.gluci.mvp.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.gluci.mvp.data.GluciCurvePoint
import app.gluci.mvp.screens.reachableMediaUrl
import coil.compose.AsyncImage

private val Indigo = Color(0xFF5C6BC0)
private val CardBg = Color.White
// OuterBg: adjust the hex brightness to control how dark/light the card backdrop is
private val OuterBg = Color(0xFFE8EBF8)
private val VerdictCardBg = Color(0xFFF2F2F2)

private fun verdictColor(raw: String): Color {
    val v = raw.trim().lowercase()
    return when {
        v.contains("avoid") -> Color(0xFFE53935)
        v.contains("modify") -> Color(0xFFFF7043)
        else -> Color(0xFF1A1A1A)
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
    val resolvedImg = remember(foodImageUrl) { foodImageUrl?.reachableMediaUrl() }
    val name = foodName.trim().ifEmpty { "Your meal" }
    val withIdx = name.indexOf(" with ", ignoreCase = true)
    val mainName = if (withIdx > 0) name.substring(0, withIdx) else name
    val subDesc = if (withIdx > 0) name.substring(withIdx + 1) else null

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(OuterBg, RoundedCornerShape(16.dp))
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Meal section
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(CardBg, RoundedCornerShape(14.dp))
                .padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (resolvedImg != null) {
                AsyncImage(
                    model = resolvedImg,
                    contentDescription = name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(64.dp)
                        .clip(RoundedCornerShape(10.dp)),
                )
            }
            Column {
                Text("Meal", fontSize = 11.sp, color = Color(0xFF999999), fontWeight = FontWeight.Medium)
                Spacer(Modifier.height(2.dp))
                Text(mainName, fontSize = 17.sp, fontWeight = FontWeight.Bold, color = Color(0xFF1A1A1A))
                if (subDesc != null) {
                    Text(subDesc, fontSize = 13.sp, color = Color(0xFF888888))
                }
            }
        }

        // Score + Verdict as two side-by-side cards
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // Score card
            Column(
                modifier = Modifier
                    .weight(1f)
                    .background(CardBg, RoundedCornerShape(14.dp))
                    .padding(14.dp),
            ) {
                Text("Glucose Score", fontSize = 15.sp, color = Color(0xFF888888))
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        String.format("%.1f", score),
                        fontSize = 46.sp,
                        fontWeight = FontWeight.Bold,
                        color = Indigo,
                    )
                    Text(
                        "/10",
                        fontSize = 16.sp,
                        color = Color(0xFFAAAAAA),
                        modifier = Modifier.padding(start = 2.dp, bottom = 8.dp),
                    )
                }
            }
            // Verdict card
            Column(
                modifier = Modifier
                    .weight(1f)
                    .background(VerdictCardBg, RoundedCornerShape(14.dp))
                    .padding(14.dp),
            ) {
                Text("Verdict", fontSize = 15.sp, color = Color(0xFF888888))
                Spacer(Modifier.height(6.dp))
                Text(
                    verdict.trim().ifEmpty { "—" },
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    color = verdictColor(verdict),
                    lineHeight = 22.sp,
                )
            }
        }

        // Glucose Curve section
        GlucoseCurveChart(curvePoints = curvePoints)

        // Tip section
        if (tip.isNotBlank()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(CardBg, RoundedCornerShape(14.dp))
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("🥗", fontSize = 26.sp)
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Want a flatter curve?",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF1A1A1A),
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        tip,
                        fontSize = 12.sp,
                        color = Color(0xFF666666),
                        lineHeight = 16.sp,
                    )
                }
            }
        }
    }
}
