package app.gluci.mvp.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.gluci.mvp.data.GluciCurvePoint
import app.gluci.mvp.screens.reachableMediaUrl
import coil.compose.AsyncImage
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

private val CreamBg = Color(0xFFFAF8F5)
private val PinkAccent = Color(0xFFE91E8C)
private val ZonePinkSoft = Color(0xFFFFD6E0)
private val ZoneGreenSoft = Color(0xFFD8EFDA)
private val BaselineGray = Color(0xFFCCCCCC)
private val CurveBlack = Color(0xFF111111)

private const val MaxMgDl = 80f

@Composable
fun GlucoseCurveChart(
    curvePoints: List<GluciCurvePoint>,
    foodName: String,
    foodImageUrl: String? = null,
    onShare: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val resolvedImg = remember(foodImageUrl) { foodImageUrl?.reachableMediaUrl() }
    val title = remember(foodName) { foodName.trim().ifEmpty { "Your meal" } }

    Box(modifier = modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(CreamBg, RoundedCornerShape(14.dp))
                .border(1.dp, Color.Black, RoundedCornerShape(14.dp))
                .padding(bottom = 8.dp),
        ) {
            // Food title with pink underline
            Column(
                modifier = Modifier.padding(start = 14.dp, end = 14.dp, top = 10.dp, bottom = 6.dp),
            ) {
                Text(
                    text = title,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF111111),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(3.dp))
                Box(
                    modifier = Modifier
                        .width(48.dp)
                        .height(2.dp)
                        .background(PinkAccent),
                )
            }

            // Chart row
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp),
            ) {
                // Y-axis labels
                Column(
                    modifier = Modifier
                        .width(56.dp)
                        .fillMaxHeight()
                        .padding(end = 8.dp, top = 8.dp, bottom = 8.dp),
                    verticalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        "+60",
                        fontSize = 11.sp,
                        color = Color(0xFF555555),
                        textAlign = TextAlign.End,
                        modifier = Modifier.fillMaxWidth().padding(end = 4.dp),
                    )
                    Text(
                        "spike",
                        fontSize = 11.sp,
                        color = PinkAccent,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.End,
                        modifier = Modifier.fillMaxWidth().padding(end = 4.dp),
                    )
                    Text(
                        "baseline",
                        fontSize = 11.sp,
                        color = Color(0xFF555555),
                        textAlign = TextAlign.End,
                        modifier = Modifier.fillMaxWidth().padding(end = 4.dp),
                    )
                }

                // Canvas + food image overlay
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight(),
                ) {
                    Canvas(modifier = Modifier.fillMaxSize()) {
                        val w = size.width
                        val h = size.height
                        val thresholdY = h * (1f - 30f / MaxMgDl)

                        clipRect(0f, 0f, w, h) {
                            // Zones
                            drawRect(ZoneGreenSoft, topLeft = Offset(0f, thresholdY), size = Size(w, h - thresholdY))
                            drawRect(ZonePinkSoft, topLeft = Offset.Zero, size = Size(w, thresholdY))

                            // Dashed baseline at bottom
                            val dashW = 6.dp.toPx()
                            val gapW = 4.dp.toPx()
                            var xPos = 0f
                            while (xPos < w) {
                                drawLine(
                                    color = BaselineGray,
                                    start = Offset(xPos, h - 0.5f),
                                    end = Offset(min(xPos + dashW, w), h - 0.5f),
                                    strokeWidth = 1.5.dp.toPx(),
                                )
                                xPos += dashW + gapW
                            }

                            if (curvePoints.size >= 2) {
                                val mapped = curvePoints.map { pt ->
                                    val yn = (pt.mgDl.toFloat() / MaxMgDl).coerceIn(0f, 1f)
                                    Offset(x = (pt.minute / 180f) * w, y = h - yn * h)
                                }

                                // Solid black filled curve
                                val fillPath = Path().apply {
                                    moveTo(mapped.first().x, h)
                                    lineTo(mapped.first().x, mapped.first().y)
                                    for (i in 1 until mapped.size) {
                                        val prev = mapped[i - 1]
                                        val curr = mapped[i]
                                        val cp1x = prev.x + (curr.x - prev.x) * 0.5f
                                        val cp2x = curr.x - (curr.x - prev.x) * 0.5f
                                        cubicTo(cp1x, prev.y, cp2x, curr.y, curr.x, curr.y)
                                    }
                                    lineTo(mapped.last().x, h)
                                    close()
                                }
                                drawPath(fillPath, color = CurveBlack.copy(alpha = 0.88f))

                                // Spike tick marks + peak dot
                                val peakIdx = curvePoints.indices.maxByOrNull { curvePoints[it].mgDl }
                                    ?: return@clipRect
                                val peakCenter = mapped[peakIdx.coerceIn(0, mapped.lastIndex)]
                                val tickLen = 12.dp.toPx()
                                val tickAngles = doubleArrayOf(-150.0, -120.0, -90.0, -60.0, -30.0)
                                for (deg in tickAngles) {
                                    val rad = Math.toRadians(deg)
                                    drawLine(
                                        color = Color(0xFF333333),
                                        start = peakCenter,
                                        end = Offset(
                                            peakCenter.x + (cos(rad) * tickLen).toFloat(),
                                            peakCenter.y + (sin(rad) * tickLen).toFloat(),
                                        ),
                                        strokeWidth = 1.5.dp.toPx(),
                                        cap = StrokeCap.Round,
                                    )
                                }
                                drawCircle(Color.White, radius = 5.dp.toPx(), center = peakCenter)
                                drawCircle(Color(0xFF333333), radius = 3.dp.toPx(), center = peakCenter)
                            }
                        }
                    }

                    // Food image top-right corner
                    resolvedImg?.let { url ->
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(6.dp)
                                .size(50.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(Color.White),
                        ) {
                            AsyncImage(
                                model = url,
                                contentDescription = title,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize(),
                            )
                        }
                    }
                }
            }

            // X-axis labels
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 60.dp, end = 8.dp, top = 2.dp, bottom = 2.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("eating time", fontSize = 11.sp, color = Color(0xFF555555))
                Text("→ +3 hours", fontSize = 11.sp, color = Color(0xFF555555))
            }
        }

        // Small share icon — bottom-right of chart card
        if (onShare != null) {
            IconButton(
                onClick = onShare,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(8.dp)
                    .size(36.dp)
                    .background(Color(0xFF1B5E20), CircleShape),
            ) {
                Icon(
                    imageVector = Icons.Default.Share,
                    contentDescription = "Share",
                    tint = Color.White,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}
