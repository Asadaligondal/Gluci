package app.gluci.mvp.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.layout
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.gluci.mvp.data.GluciCurvePoint

private val CurvePurple = Color(0xFF5C6BC0)
private val CurveFillColor = Color(0x1A5C6BC0)

@Composable
fun GlucoseCurveChart(
    curvePoints: List<GluciCurvePoint>,
    modifier: Modifier = Modifier,
) {
    val peakPt = remember(curvePoints) { curvePoints.maxByOrNull { it.mgDl } }
    val xMax = remember(curvePoints) {
        val peakVal = curvePoints.maxOfOrNull { it.mgDl }?.toFloat() ?: 0f
        val threshold = maxOf(peakVal * 0.1f, 5f)
        val lastAbove = curvePoints.filter { it.mgDl >= threshold }.maxOfOrNull { it.minute } ?: 120
        val rounded = ((lastAbove + 29) / 30) * 30
        rounded.coerceIn(90, 180)
    }
    val peakFraction = remember(peakPt, xMax) { (peakPt?.minute?.toFloat() ?: (xMax / 2f)) / xMax.toFloat() }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(14.dp))
            .padding(horizontal = 12.dp, vertical = 12.dp),
    ) {
        Text(
            "Your Glucose Curve",
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color(0xFF333333),
        )
        Spacer(Modifier.height(8.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(160.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .width(20.dp)
                    .fillMaxHeight(),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "Glucose",
                    fontSize = 11.sp,
                    color = Color(0xFF888888),
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .layout { measurable, constraints ->
                            val placeable = measurable.measure(
                                Constraints(
                                    minWidth = constraints.minHeight,
                                    maxWidth = constraints.maxHeight,
                                    minHeight = constraints.minWidth,
                                    maxHeight = constraints.maxWidth,
                                ),
                            )
                            layout(placeable.height, placeable.width) {
                                placeable.placeRelative(
                                    x = -(placeable.width - placeable.height) / 2,
                                    y = -(placeable.height - placeable.width) / 2,
                                )
                            }
                        }
                        .rotate(-90f),
                )
            }

            Canvas(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
            ) {
                val w = size.width
                val h = size.height
                val bottomPad = 4.dp.toPx()
                val topPad = 14.dp.toPx()
                val drawH = h - bottomPad - topPad

                drawLine(
                    color = Color(0xFFBBBBBB),
                    start = Offset(0f, h - bottomPad),
                    end = Offset(w, h - bottomPad),
                    strokeWidth = 1.5.dp.toPx(),
                )
                drawLine(
                    color = Color(0xFFBBBBBB),
                    start = Offset(0f, topPad),
                    end = Offset(0f, h - bottomPad),
                    strokeWidth = 1.5.dp.toPx(),
                )

                if (curvePoints.size >= 2) {
                    val actualMax = curvePoints.maxOf { it.mgDl }.toFloat()
                    val scaleCeiling = maxOf(actualMax * 1.15f, 20f)

                    val sorted = curvePoints.filter { it.minute <= xMax }.sortedBy { it.minute }
                    val pts = sorted.map { pt ->
                        Offset(
                            x = (pt.minute.toFloat() / xMax.toFloat()) * w,
                            y = h - bottomPad - (pt.mgDl.toFloat() / scaleCeiling) * drawH,
                        )
                    }

                    val pPt = curvePoints.maxByOrNull { it.mgDl }!!
                    val peakX = (pPt.minute.toFloat() / xMax.toFloat()) * w
                    val peakY = h - bottomPad - (pPt.mgDl.toFloat() / scaleCeiling) * drawH

                    // Fill
                    drawPath(
                        Path().apply {
                            moveTo(pts.first().x, h - bottomPad)
                            lineTo(pts.first().x, pts.first().y)
                            for (i in 0 until pts.size - 1) {
                                val p0 = if (i > 0) pts[i - 1] else pts[i]
                                val p1 = pts[i]
                                val p2 = pts[i + 1]
                                val p3 = if (i < pts.size - 2) pts[i + 2] else pts[i + 1]
                                cubicTo(
                                    p1.x + (p2.x - p0.x) / 6f, p1.y + (p2.y - p0.y) / 6f,
                                    p2.x - (p3.x - p1.x) / 6f, p2.y - (p3.y - p1.y) / 6f,
                                    p2.x, p2.y,
                                )
                            }
                            lineTo(pts.last().x, h - bottomPad)
                            close()
                        },
                        color = CurveFillColor,
                    )

                    // Stroke
                    drawPath(
                        Path().apply {
                            moveTo(pts.first().x, pts.first().y)
                            for (i in 0 until pts.size - 1) {
                                val p0 = if (i > 0) pts[i - 1] else pts[i]
                                val p1 = pts[i]
                                val p2 = pts[i + 1]
                                val p3 = if (i < pts.size - 2) pts[i + 2] else pts[i + 1]
                                cubicTo(
                                    p1.x + (p2.x - p0.x) / 6f, p1.y + (p2.y - p0.y) / 6f,
                                    p2.x - (p3.x - p1.x) / 6f, p2.y - (p3.y - p1.y) / 6f,
                                    p2.x, p2.y,
                                )
                            }
                        },
                        color = CurvePurple,
                        style = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round),
                    )

                    // Dotted drop line from peak to x-axis
                    drawLine(
                        color = CurvePurple.copy(alpha = 0.45f),
                        start = Offset(peakX, peakY + 6.dp.toPx()),
                        end = Offset(peakX, h - bottomPad),
                        strokeWidth = 1.5.dp.toPx(),
                        pathEffect = PathEffect.dashPathEffect(
                            floatArrayOf(8.dp.toPx(), 5.dp.toPx()), 0f,
                        ),
                    )

                    // Peak dot
                    drawCircle(Color.White, radius = 5.dp.toPx(), center = Offset(peakX, peakY))
                    drawCircle(CurvePurple, radius = 3.dp.toPx(), center = Offset(peakX, peakY))
                }
            }
        }

        // X-axis labels — Peak tracks actual peak position
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 20.dp, top = 4.dp),
        ) {
            val totalW = maxWidth
            val peakOffset = (totalW * peakFraction - 24.dp).coerceIn(28.dp, totalW - 52.dp)

            Column(Modifier.align(Alignment.TopStart), horizontalAlignment = Alignment.Start) {
                Text("0m", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Color(0xFF666666))
                Text("Meal", fontSize = 12.sp, color = Color(0xFF999999))
            }
            Column(
                modifier = Modifier.padding(start = peakOffset),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("+${peakPt?.minute ?: 60}m", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Color(0xFF666666))
                Text("Peak", fontSize = 12.sp, color = CurvePurple, fontWeight = FontWeight.Medium)
            }
            Column(Modifier.align(Alignment.TopEnd), horizontalAlignment = Alignment.End) {
                Text("+${xMax}m", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Color(0xFF666666))
                Text("~Done", fontSize = 12.sp, color = Color(0xFF999999))
            }
        }
    }
}
