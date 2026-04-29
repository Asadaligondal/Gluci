package app.gluci.mvp.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.gluci.mvp.data.WeekDailyBarDto
import app.gluci.mvp.vm.GluciViewModel
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

private fun dayShortLabel(isoDate: String): String =
    try {
        LocalDate.parse(isoDate).dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.getDefault())
    } catch (_: Exception) {
        "?"
    }

/** Maps daily average score (0–10) into [getCurveColor] range using a linear proxy peak. */
private fun barColor(averageScore: Double?, checks: Int, emptyTint: Color): Color {
    if (checks == 0 || averageScore == null) return emptyTint
    val proxyPeak = averageScore.toFloat() * 5f
    return GluciViewModel.getCurveColor(proxyPeak.coerceAtLeast(0f))
}

/**
 * Rolling 7 UTC days from [GET /v1/summary/week-daily]: bar height = avg score / 10.
 */
@Composable
fun GlucoseWeekSection(
    bars: List<WeekDailyBarDto>,
    loading: Boolean,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            "Your glucose week",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        when {
            loading -> {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(vertical = 16.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator(
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(28.dp),
                        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.65f),
                    )
                }
            }
            bars.isEmpty() -> {
                Text(
                    "No weekly data yet.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            else -> GlucoseWeekBars(bars = bars.take(7))
        }
    }
}

@Composable
private fun GlucoseWeekBars(bars: List<WeekDailyBarDto>) {
    val emptyTint = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)
    val colors = bars.map { bar ->
        barColor(bar.averageScore, bar.checks, emptyTint)
    }
    Column(Modifier.fillMaxWidth()) {
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(148.dp),
        ) {
            val pad = 8.dp.toPx()
            val gap = 6.dp.toPx()
            val chartBottom = size.height - 4.dp.toPx()
            val chartInner = (chartBottom - 10.dp.toPx()).coerceAtLeast(1f)
            val n = bars.size.coerceAtLeast(1)
            val slot = (size.width - pad * 2 - gap * (n - 1).coerceAtLeast(0)) / n.toFloat()

            bars.forEachIndexed { i, bar ->
                val left = pad + i * (slot + gap)
                val frac = when {
                    bar.checks == 0 || bar.averageScore == null -> 0.12f
                    else -> (bar.averageScore!! / 10.0).toFloat().coerceIn(0.08f, 1f)
                }
                val h = chartInner * frac
                val minBar = 6.dp.toPx()
                val barH = h.coerceAtLeast(minBar).coerceAtMost(chartInner + minBar)
                val top = chartBottom - barH
                drawRoundRect(
                    color = colors[i],
                    topLeft = Offset(left, top),
                    size = Size(slot, barH),
                    cornerRadius = CornerRadius(5.dp.toPx(), 5.dp.toPx()),
                )
            }
        }
        Row(
            Modifier
                .fillMaxWidth()
                .padding(top = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            bars.forEach { bar ->
                Text(
                    text = dayShortLabel(bar.date),
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                )
            }
        }
    }
}
