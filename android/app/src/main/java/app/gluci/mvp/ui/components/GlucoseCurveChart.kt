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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.gluci.mvp.data.GluciCurvePoint
import app.gluci.mvp.screens.reachableMediaUrl
import coil.compose.AsyncImage
import kotlin.math.min

private val ZonePink = Color(0xFFFFDDE1)
private val ZoneGreen = Color(0xFFD6F0E0)
private val ThresholdLine = Color(0xFFBDBDBD)
private val AxisGray = Color(0xFF9E9E9E)
private val LabelBorder = Color(0xFFDDDDDD)

private const val MaxMgDl = 80f
private const val ThresholdMg = 30f

private fun curveFillColorForPeak(peakMgDl: Double): Color =
    when {
        peakMgDl < 25.0 -> Color(0xFF2E7D32)
        peakMgDl < 50.0 -> Color(0xFFE65100)
        else -> Color(0xFF1A1A1A)
    }

@Composable
fun GlucoseCurveChart(
    curvePoints: List<GluciCurvePoint>,
    foodName: String,
    foodImageUrl: String? = null,
    modifier: Modifier = Modifier,
) {
    val resolvedImg = remember(foodImageUrl) { foodImageUrl?.reachableMediaUrl() }
    val title = remember(foodName) { foodName.trim().ifEmpty { "Your meal" } }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        shape = RoundedCornerShape(12.dp),
    ) {
        Column(Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp),
            ) {
                Column(
                    modifier = Modifier
                        .width(52.dp)
                        .fillMaxHeight()
                        .padding(bottom = 20.dp, top = 4.dp, end = 4.dp),
                ) {
                    Spacer(Modifier.weight(0.1f))
                    Text(
                        text = "+60",
                        fontSize = 9.sp,
                        color = AxisGray,
                        textAlign = TextAlign.End,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.weight(0.35f))
                    Text(
                        text = "spike\n+30",
                        fontSize = 9.sp,
                        color = AxisGray,
                        textAlign = TextAlign.End,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.weight(0.35f))
                    Text(
                        text = "baseline",
                        fontSize = 9.sp,
                        color = AxisGray,
                        textAlign = TextAlign.End,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.weight(0.1f))
                }

                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight(),
                ) {
                    Canvas(modifier = Modifier.fillMaxWidth().fillMaxHeight()) {
                        val w = size.width
                        val h = size.height
                        val thresholdY = h * (1f - ThresholdMg / MaxMgDl)

                        drawRect(
                            color = ZoneGreen,
                            topLeft = Offset(0f, thresholdY),
                            size = Size(w, h - thresholdY),
                        )
                        drawRect(
                            color = ZonePink,
                            topLeft = Offset.Zero,
                            size = Size(w, thresholdY),
                        )

                        val dashWidth = 8.dp.toPx()
                        val gapWidth = 4.dp.toPx()
                        var x = 0f
                        while (x < w) {
                            drawLine(
                                color = ThresholdLine,
                                start = Offset(x, thresholdY),
                                end = Offset(min(x + dashWidth, w), thresholdY),
                                strokeWidth = 1.dp.toPx(),
                            )
                            x += dashWidth + gapWidth
                        }

                        if (curvePoints.size < 2) return@Canvas

                        val mapped = curvePoints.map { pt ->
                            Offset(
                                x = (pt.minute / 120f) * w,
                                y = h - (pt.mgDl.toFloat() / MaxMgDl).coerceIn(0f, 1f) * h,
                            )
                        }

                        val peak = curvePoints.maxOf { it.mgDl }
                        val curveColor = curveFillColorForPeak(peak)

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
                        drawPath(path = fillPath, color = curveColor)

                        val strokePath = Path().apply {
                            moveTo(mapped.first().x, mapped.first().y)
                            for (i in 1 until mapped.size) {
                                val prev = mapped[i - 1]
                                val curr = mapped[i]
                                val cp1x = prev.x + (curr.x - prev.x) * 0.5f
                                val cp2x = curr.x - (curr.x - prev.x) * 0.5f
                                cubicTo(cp1x, prev.y, cp2x, curr.y, curr.x, curr.y)
                            }
                        }
                        drawPath(
                            path = strokePath,
                            color = curveColor.copy(alpha = 0.7f),
                            style = Stroke(
                                width = 2.dp.toPx(),
                                cap = StrokeCap.Round,
                                join = StrokeJoin.Round,
                            ),
                        )
                    }

                    Box(
                        modifier = Modifier
                            .padding(8.dp)
                            .align(Alignment.TopStart)
                            .background(Color.White, RoundedCornerShape(6.dp))
                            .border(1.dp, LabelBorder, RoundedCornerShape(6.dp))
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    ) {
                        Text(
                            text = title,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            color = Color(0xFF1A1A1A),
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.widthIn(max = 100.dp),
                        )
                    }
                }

                Box(
                    modifier = Modifier
                        .width(90.dp)
                        .fillMaxHeight()
                        .padding(4.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    resolvedImg?.let { url ->
                        AsyncImage(
                            model = url,
                            contentDescription = title,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .size(80.dp)
                                .clip(RoundedCornerShape(8.dp)),
                        )
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 56.dp, end = 94.dp, top = 2.dp, bottom = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("eating time", fontSize = 9.sp, color = AxisGray)
                Text("+ 2 hours", fontSize = 9.sp, color = AxisGray)
            }
        }
    }
}
