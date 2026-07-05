package app.gluci.mvp.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import app.gluci.mvp.vm.GluciViewModel

private val StepGreen = Color(0xFF2D5A4B)
private val StepGreenLight = Color(0xFFE8F0EE)

private data class OnboardingStep(
    val question: String,
    val options: List<String>,
    val skippable: Boolean = false,
)

private val STEPS = listOf(
    OnboardingStep(
        question = "What brings you to Gluci?",
        options = listOf("Steady energy, no crashes", "Fewer cravings", "Lose weight gently", "Manage blood sugar"),
    ),
    OnboardingStep(
        question = "Any dietary style?",
        options = listOf("No restrictions", "Plant-based", "Low-carb / keto", "Halal"),
    ),
    OnboardingStep(
        question = "Any foods to avoid?",
        options = listOf("None", "Gluten", "Dairy", "Nuts"),
        skippable = true,
    ),
    OnboardingStep(
        question = "How active is a normal day?",
        options = listOf("Mostly sitting", "On my feet a fair bit", "Active — I train"),
        skippable = true,
    ),
)

private data class OnboardingAnswers(
    val goal: String = "",
    val dietStyle: String = "",
    val allergies: String = "",
    val activity: String = "",
)

@Composable
fun OnboardingScreen(
    vm: GluciViewModel,
    nav: NavController,
) {
    var currentStep by remember { mutableStateOf(0) }
    var answers by remember { mutableStateOf(OnboardingAnswers()) }
    val busy by vm.busy.collectAsState()

    BackHandler(enabled = currentStep > 0) {
        currentStep--
    }

    val step = STEPS[currentStep]
    val currentSel = when (currentStep) {
        0 -> answers.goal
        1 -> answers.dietStyle
        2 -> answers.allergies
        else -> answers.activity
    }

    fun selectOption(option: String) {
        answers = when (currentStep) {
            0 -> answers.copy(goal = option)
            1 -> answers.copy(dietStyle = option)
            2 -> answers.copy(allergies = option)
            else -> answers.copy(activity = option)
        }
    }

    fun advance() {
        if (currentStep < STEPS.size - 1) {
            currentStep++
        } else {
            vm.completeAppOnboarding(
                goal = answers.goal,
                dietStyle = answers.dietStyle,
                allergies = answers.allergies,
                activity = answers.activity,
            ) {
                nav.navigate("home") {
                    popUpTo("onboarding") { inclusive = true }
                }
                vm.onSessionStart()
            }
        }
    }

    SereneAuthBackground {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp),
        ) {
            Spacer(Modifier.height(20.dp))

            // Progress bar + step counter
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(StepGreen.copy(alpha = 0.15f)),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxHeight()
                            .fillMaxWidth((currentStep + 1f) / STEPS.size)
                            .clip(RoundedCornerShape(2.dp))
                            .background(StepGreen),
                    )
                }
                Text(
                    "${currentStep + 1} of ${STEPS.size}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.height(36.dp))

            // Question
            Text(
                step.question,
                style = MaterialTheme.typography.headlineMedium.copy(fontStyle = FontStyle.Italic),
                color = MaterialTheme.colorScheme.onBackground,
                lineHeight = 36.sp,
            )

            Spacer(Modifier.height(28.dp))

            // Options
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                step.options.forEach { option ->
                    val selected = currentSel == option
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .clickable { selectOption(option) },
                        shape = RoundedCornerShape(14.dp),
                        color = if (selected) StepGreenLight else Color.White,
                        border = BorderStroke(
                            width = if (selected) 2.dp else 1.dp,
                            color = if (selected) StepGreen else Color(0xFFDDDDDD),
                        ),
                    ) {
                        Text(
                            text = option,
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 18.dp),
                            style = MaterialTheme.typography.bodyLarge.copy(
                                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                            ),
                            color = if (selected) StepGreen else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }

            Spacer(Modifier.weight(1f))

            // Skip link
            if (step.skippable) {
                TextButton(
                    onClick = {
                        selectOption("")
                        advance()
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        "Skip — I'm not sure",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.height(4.dp))
            }

            // Continue / Start my plan
            val isLast = currentStep == STEPS.size - 1
            val canContinue = currentSel.isNotEmpty() || step.skippable
            Button(
                onClick = { advance() },
                enabled = canContinue && !busy,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(999.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = StepGreen,
                    contentColor = Color.White,
                    disabledContainerColor = StepGreen.copy(alpha = 0.35f),
                    disabledContentColor = Color.White.copy(alpha = 0.7f),
                ),
            ) {
                if (busy && isLast) {
                    CircularProgressIndicator(
                        modifier = Modifier.padding(vertical = 4.dp),
                        strokeWidth = 2.dp,
                        color = Color.White,
                    )
                } else {
                    Text(
                        if (isLast) "Start my plan" else "Continue",
                        style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                        modifier = Modifier.padding(vertical = 8.dp),
                    )
                }
            }

            Spacer(Modifier.height(20.dp))
        }
    }
}
