package app.gluci.mvp.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
private val OuterBg = Color(0xFFEDF0FC)

private val VerdictInnerBg = Color(0xFFF2F4FC)

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
    onClick: (() -> Unit)? = null,
) {
    val resolvedImg = remember(foodImageUrl) { foodImageUrl?.reachableMediaUrl() }
    val name = foodName.trim().ifEmpty { "Your meal" }
    val withIdx = name.indexOf(" with ", ignoreCase = true)
    val mainName = if (withIdx > 0) name.substring(0, withIdx) else name
    val subDesc = if (withIdx > 0) name.substring(withIdx + 1) else null

    val outerModifier = if (onClick != null) {
        modifier
            .fillMaxWidth()
            .background(OuterBg, RoundedCornerShape(16.dp))
            .clickable { onClick() }
            .padding(10.dp)
    } else {
        modifier
            .fillMaxWidth()
            .background(OuterBg, RoundedCornerShape(16.dp))
            .padding(10.dp)
    }

    Column(
        modifier = outerModifier,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Meal section
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(CardBg, RoundedCornerShape(14.dp))
                .padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (resolvedImg != null) {
                AsyncImage(
                    model = resolvedImg,
                    contentDescription = name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(88.dp)
                        .clip(RoundedCornerShape(14.dp)),
                )
            }
            Column {
                Text("Meal", fontSize = 12.sp, color = Color(0xFF999999), fontWeight = FontWeight.Medium)
                Spacer(Modifier.height(4.dp))
                Text(mainName, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color(0xFF1A1A1A))
                if (subDesc != null) {
                    Spacer(Modifier.height(2.dp))
                    Text(subDesc, fontSize = 14.sp, color = Color(0xFF888888))
                }
            }
        }

        // Score + Verdict — one outer card, nested inner card for verdict
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(CardBg, RoundedCornerShape(14.dp))
                .padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Score (left)
            Column(modifier = Modifier.weight(1f)) {
                Text("Glucose Score", fontSize = 13.sp, color = Color(0xFF888888), fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        String.format("%.1f", score),
                        fontSize = 50.sp,
                        fontWeight = FontWeight.Bold,
                        color = Indigo,
                    )
                    Text(
                        "/10",
                        fontSize = 17.sp,
                        color = Color(0xFFAAAAAA),
                        modifier = Modifier.padding(start = 2.dp, bottom = 10.dp),
                    )
                }
            }
            // Verdict inner card (right)
            Column(
                modifier = Modifier
                    .weight(1f)
                    .background(VerdictInnerBg, RoundedCornerShape(12.dp))
                    .padding(12.dp),
            ) {
                Text("Verdict", fontSize = 13.sp, color = Color(0xFF888888), fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(6.dp))
                Text(
                    verdict.trim().ifEmpty { "—" },
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF1A1A1A),
                    lineHeight = 26.sp,
                )
            }
        }

        // Glucose Curve
        GlucoseCurveChart(curvePoints = curvePoints)

        // Tip section
        if (tip.isNotBlank()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(CardBg, RoundedCornerShape(14.dp))
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("🥗", fontSize = 28.sp)
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Want a flatter curve?",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF1A1A1A),
                    )
                    Spacer(Modifier.height(3.dp))
                    Text(
                        tip,
                        fontSize = 13.sp,
                        color = Color(0xFF555555),
                        lineHeight = 18.sp,
                    )
                }
            }
        }
    }
}
