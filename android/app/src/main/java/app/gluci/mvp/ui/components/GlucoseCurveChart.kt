package app.gluci.mvp.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.gluci.mvp.data.GluciCurvePoint
import app.gluci.mvp.screens.reachableMediaUrl
import coil.compose.AsyncImage

private val ZonePink = Color(0xFFFFEBEE)
private val ZoneGreen = Color(0xFFE8F5E9)
private val ThresholdDashColor = Color(0xFFBDBDBD)
private val AxisGray = Color(0xFF9E9E9E)

private fun curveStrokeColorForPeak(peak: Float): Color {
    return when {
        peak < 30f -> Color(0xFF4CAF50)
        peak <= 60f -> Color(0xFFFF6F00)
        else -> Color(0xFF1A1A1A)
    }
}

private fun buildOrganicCurvePath(points: List<Offset>): Path =
    Path().apply {
        if (points.size < 2) return@apply
        moveTo(points.first().x, points.first().y)
        for (i in 1 until points.size) {
            val prev = points[i - 1]
            val curr = points[i]
            val cp1x = prev.x + (curr.x - prev.x) * 0.5f
            val cp1y = prev.y
            val cp2x = curr.x - (curr.x - prev.x) * 0.5f
            val cp2y = curr.y
            cubicTo(cp1x, cp1y, cp2x, cp2y, curr.x, curr.y)
        }
    }

/**
 * Instagram-inspired glucose curve: pink spike zone over green safe zone, organic cubic curve,
 * optional circular meal photo and inline food title.
 */
@Composable
fun GlucoseCurveChart(
    curvePoints: List<GluciCurvePoint>,
    foodName: String,
    foodImageUrl: String? = null,
    modifier: Modifier = Modifier,
) {
    val resolvedImg = remember(foodImageUrl) { foodImageUrl?.reachableMediaUrl() }
    val peakMg = remember(curvePoints) {
        curvePoints.maxOfOrNull { it.mgDl }?.toFloat()?.takeIf { it > 0f } ?: 1f
    }
    val curveStroke = remember(curvePoints) { curveStrokeColorForPeak(peakMg) }

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
    ) {
        Column(Modifier.padding(16.dp)) {
            val chartPlotHeight = 180.dp
            val labelColumnWidth = 72.dp
            val imageSlot = if (resolvedImg != null) 80.dp else 0.dp
            val rawPeakVal = curvePoints.maxOfOrNull { it.mgDl }?.toFloat()?.takeIf { it > 0f } ?: 1f
            val maxMgScale = kotlin.math.max(rawPeakVal, 60f)

            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier
                        .width(labelColumnWidth)
                        .height(chartPlotHeight),
                ) {
                    Text(
                        text = "+60",
                        fontSize = 10.sp,
                        color = AxisGray,
                        modifier = Modifier.align(Alignment.TopStart),
                    )
                    Text(
                        text = "spike +30",
                        fontSize = 10.sp,
                        color = AxisGray,
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .offset(y = chartPlotHeight * (1f - 30f / maxMgScale)),
                    )
                    Text(
                        text = "baseline",
                        fontSize = 10.sp,
                        color = AxisGray,
                        modifier = Modifier.align(Alignment.BottomStart),
                    )
                }

                Box(
                    Modifier
                        .weight(1f)
                        .height(chartPlotHeight),
                ) {
                    Canvas(
                        Modifier
                            .fillMaxWidth()
                            .fillMaxHeight()
                            .padding(end = imageSlot),
                    ) {
                        val plotW = size.width
                        val plotH = size.height
                        val rawPeak = curvePoints.maxOfOrNull { it.mgDl }?.toFloat()?.takeIf { it > 0f } ?: 1f
                        val maxMg = kotlin.math.max(rawPeak, 60f)

                        fun mgToY(mg: Double): Float =
                            plotH - ((mg / maxMg.toDouble()).coerceIn(0.0, 1.0).toFloat() * plotH)

                        val thresholdY = mgToY(30.0)
                        drawRect(color = ZonePink, topLeft = Offset.Zero, size = Size(plotW, thresholdY.coerceAtLeast(0f)))
                        drawRect(
                            color = ZoneGreen,
                            topLeft = Offset(0f, thresholdY.coerceAtMost(plotH)),
                            size = Size(plotW, (plotH - thresholdY).coerceAtLeast(0f)),
                        )

                        val dashEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 4.dp.toPx()))
                        drawLine(
                            color = ThresholdDashColor,
                            start = Offset(0f, thresholdY.coerceIn(0f, plotH)),
                            end = Offset(plotW, thresholdY.coerceIn(0f, plotH)),
                            strokeWidth = 1.dp.toPx(),
                            pathEffect = dashEffect,
                        )

                        val pts = curvePoints.map { p ->
                            val x = (p.minute / 120f) * plotW
                            val y = mgToY(p.mgDl).coerceIn(0f, plotH)
                            Offset(x, y)
                        }

                        if (pts.size >= 2) {
                            val strokePath = buildOrganicCurvePath(pts)
                            val fillPath = buildOrganicCurvePath(pts).also { fp ->
                                fp.lineTo(pts.last().x, plotH)
                                fp.lineTo(pts.first().x, plotH)
                                fp.close()
                            }
                            drawPath(path = fillPath, color = curveStroke.copy(alpha = 0.25f))
                            drawPath(
                                path = strokePath,
                                color = curveStroke,
                                style = Stroke(width = 5.dp.toPx(), cap = StrokeCap.Round),
                            )
                            val peakIdx = curvePoints.indices.maxByOrNull { curvePoints[it].mgDl } ?: -1
                            if (peakIdx >= 0 && peakIdx < pts.size) {
                                drawCircle(color = curveStroke, radius = 5.dp.toPx(), center = pts[peakIdx])
                            }
                        }
                    }

                    val title = foodName.trim().ifEmpty { "Your meal" }
                    Surface(
                        modifier = Modifier
                            .padding(start = 16.dp, top = 16.dp)
                            .shadow(
                                elevation = 2.dp,
                                shape = RoundedCornerShape(8.dp),
                                spotColor = Color.Black.copy(alpha = 0.22f),
                            ),
                        shape = RoundedCornerShape(8.dp),
                        color = Color.White,
                        tonalElevation = 0.dp,
                        shadowElevation = 0.dp,
                    ) {
                        Text(
                            text = title,
                            color = Color(0xFF1A1A1A),
                            fontSize = 13.sp,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                            maxLines = 2,
                        )
                    }

                    resolvedImg?.let { url ->
                        AsyncImage(
                            model = url,
                            contentDescription = "Meal photo",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .align(Alignment.CenterEnd)
                                .size(72.dp)
                                .clip(CircleShape)
                                .border(2.dp, Color.White, CircleShape)
                                .shadow(4.dp, CircleShape),
                        )
                    }
                }
            }

            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(start = labelColumnWidth, top = 6.dp),
            ) {
                Text(
                    text = "eating time",
                    fontSize = 10.sp,
                    color = AxisGray,
                    modifier = Modifier.weight(1f),
                    textAlign = TextAlign.Start,
                )
                Text(
                    text = "+ 2 hours",
                    fontSize = 10.sp,
                    color = AxisGray,
                    modifier = Modifier.weight(1f),
                    textAlign = TextAlign.End,
                )
            }
        }
    }
}
