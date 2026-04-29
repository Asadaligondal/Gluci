package app.gluci.mvp.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.gluci.mvp.data.GluciCurvePoint

private fun Path.smoothCurveThrough(points: List<Offset>) {
    if (points.size < 2) return
    reset()
    moveTo(points.first().x, points.first().y)
    if (points.size == 2) {
        lineTo(points[1].x, points[1].y)
        return
    }
    for (i in 0 until points.lastIndex) {
        val p0 = points.getOrElse(i - 1) { points[i] }
        val p1 = points[i]
        val p2 = points[i + 1]
        val p3 = points.getOrElse(i + 2) { p2 }
        val c1 = Offset(
            p1.x + (p2.x - p0.x) / 6f,
            p1.y + (p2.y - p0.y) / 6f,
        )
        val c2 = Offset(
            p2.x - (p3.x - p1.x) / 6f,
            p2.y - (p3.y - p1.y) / 6f,
        )
        cubicTo(c1.x, c1.y, c2.x, c2.y, p2.x, p2.y)
    }
}

@Composable
fun GlucoseCurveChart(
    curvePoints: List<GluciCurvePoint>,
    modifier: Modifier = Modifier,
    peakColor: Color = Color(0xFFF44336),
) {
    val ticks = listOf(0, 30, 60, 90, 120)
    Column(modifier.fillMaxWidth()) {
        Canvas(modifier = Modifier.fillMaxWidth().height(160.dp)) {
            val padL = 8.dp.toPx()
            val padR = 8.dp.toPx()
            val padT = 12.dp.toPx()
            val padB = 8.dp.toPx()
            val innerW = size.width - padL - padR
            val innerH = size.height - padT - padB
            val rawMax = curvePoints.maxOf { it.mgDl }.coerceAtLeast(1.0).toFloat()
            val yMax = rawMax + 10f

            fun pointAt(pm: Int, mg: Double): Offset {
                val x = padL + (pm / 120f) * innerW
                val capped = mg.coerceIn(0.0, yMax.toDouble()).toFloat()
                val y = padT + innerH - (capped / yMax) * innerH
                return Offset(x, y)
            }

            val pts = curvePoints.map { pointAt(it.minute, it.mgDl) }

            drawLine(
                color = peakColor.copy(alpha = 0.35f),
                start = Offset(padL, padT + innerH),
                end = Offset(padL + innerW, padT + innerH),
                strokeWidth = 1.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 8f)),
            )

            val strokePath = Path().apply { smoothCurveThrough(pts) }
            val fillPath = Path().apply {
                if (pts.isNotEmpty()) {
                    smoothCurveThrough(pts)
                    lineTo(pts.last().x, padT + innerH)
                    lineTo(pts.first().x, padT + innerH)
                    close()
                }
            }

            clipRect(
                left = padL,
                top = padT,
                right = size.width - padR,
                bottom = padT + innerH,
            ) {
                drawPath(path = fillPath, color = peakColor.copy(alpha = 0.2f))
                drawPath(
                    path = strokePath,
                    color = peakColor,
                    style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round),
                )
            }

            val peakIdx = curvePoints.indices.maxByOrNull { curvePoints[it].mgDl } ?: -1
            if (peakIdx >= 0 && peakIdx < pts.size) {
                val pk = pts[peakIdx]
                drawCircle(color = peakColor, radius = 5.dp.toPx(), center = pk)
                drawCircle(color = Color.White, radius = 2.dp.toPx(), center = pk)
            }
        }
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            ticks.forEach { m ->
                Text(
                    text = "${m}m",
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.85f),
                )
            }
        }
    }
}
