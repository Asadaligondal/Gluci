package app.gluci.mvp.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
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
import kotlin.math.min

private val ZonePink = Color(0xFFFFCDD2)
private val ZoneGreen = Color(0xFFC8E6C9)
private val SeparatorGray = Color(0xFFDDDDDD)

private const val MaxMgDl = 80f

@Composable
fun GlucoseCurveChart(
    curvePoints: List<GluciCurvePoint>,
    foodName: String,
    foodImageUrl: String? = null,
    modifier: Modifier = Modifier,
) {
    val resolvedImg = remember(foodImageUrl) { foodImageUrl?.reachableMediaUrl() }
    val title = remember(foodName) { foodName.trim().ifEmpty { "Your meal" } }

    val peak = curvePoints.maxOfOrNull { it.mgDl.toFloat() } ?: 0f
    val curveColor = when {
        peak < 20f -> Color(0xFF2E7D32)
        peak < 50f -> Color(0xFFE65100)
        else -> Color(0xFFC62828)
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
        shape = RoundedCornerShape(14.dp),
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp),
            ) {
                // Y-axis labels
                Box(
                    modifier = Modifier
                        .width(56.dp)
                        .fillMaxHeight(),
                ) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.CenterEnd)
                            .width(1.dp)
                            .fillMaxHeight()
                            .background(SeparatorGray),
                    )
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(end = 8.dp, top = 8.dp, bottom = 8.dp),
                        verticalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            "+60",
                            fontSize = 12.sp,
                            color = Color(0xFF555555),
                            textAlign = TextAlign.End,
                            modifier = Modifier.fillMaxWidth().padding(end = 4.dp),
                        )
                        Text(
                            "spike\n+30",
                            fontSize = 12.sp,
                            color = Color(0xFF555555),
                            textAlign = TextAlign.End,
                            lineHeight = 14.sp,
                            modifier = Modifier.fillMaxWidth().padding(end = 4.dp),
                        )
                        Text(
                            "baseline",
                            fontSize = 12.sp,
                            color = Color(0xFF555555),
                            textAlign = TextAlign.End,
                            modifier = Modifier.fillMaxWidth().padding(end = 4.dp),
                        )
                    }
                }

                // Chart canvas
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

                            val dashW = 8.dp.toPx()
                            val gapW = 4.dp.toPx()
                            var xPos = 0f
                            while (xPos < w) {
                                drawLine(
                                    color = Color(0xFFE57373),
                                    start = Offset(xPos, thresholdY),
                                    end = Offset(min(xPos + dashW, w), thresholdY),
                                    strokeWidth = 1.5.dp.toPx(),
                                )
                                xPos += dashW + gapW
                            }

                            if (curvePoints.size >= 2) {
                                val mapped = curvePoints.map { pt ->
                                    val yn = (pt.mgDl.toFloat() / MaxMgDl).coerceIn(0f, 1f)
                                    Offset(
                                        x = (pt.minute / 180f) * w,
                                        y = h - yn * h,
                                    )
                                }

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
                                drawPath(path = fillPath, color = curveColor.copy(alpha = 0.92f))

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
                                    color = curveColor.copy(alpha = 0.95f),
                                    style = Stroke(
                                        width = 2.5.dp.toPx(),
                                        cap = StrokeCap.Round,
                                        join = StrokeJoin.Round,
                                    ),
                                )

                                val peakIdx = curvePoints.indices.maxByOrNull { curvePoints[it].mgDl }
                                    ?: return@clipRect
                                val peakCenter = mapped[peakIdx.coerceIn(0, mapped.lastIndex)]
                                drawCircle(color = Color.White, radius = 6.dp.toPx(), center = peakCenter)
                                drawCircle(color = curveColor, radius = 4.dp.toPx(), center = peakCenter)
                            }
                        }
                    }
                }

                // Food image thumbnail
                Box(
                    modifier = Modifier
                        .width(80.dp)
                        .fillMaxHeight()
                        .padding(6.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    resolvedImg?.let { url ->
                        Card(
                            shape = RoundedCornerShape(10.dp),
                            elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
                            border = BorderStroke(2.dp, Color.White),
                        ) {
                            AsyncImage(
                                model = url,
                                contentDescription = title,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.size(64.dp),
                            )
                        }
                    }
                }
            }

            // Food name — below chart, not overlapping
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 68.dp, end = 92.dp, top = 2.dp),
            ) {
                Text(
                    text = title,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color(0xFF333333),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            // X-axis labels
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 60.dp, end = 84.dp, top = 2.dp, bottom = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("eating time", fontSize = 11.sp, color = Color(0xFF555555))
                Text("+ 3 hours", fontSize = 11.sp, color = Color(0xFF555555))
            }
        }
    }
}
