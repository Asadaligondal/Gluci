package app.gluci.mvp.screens

import android.Manifest
import android.os.Handler
import android.os.Looper
import android.util.Size
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.navigation.NavController
import app.gluci.mvp.vm.GluciViewModel
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BarcodeScreen(vm: GluciViewModel, nav: NavController) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val main = remember { Handler(Looper.getMainLooper()) }
    val done = remember { AtomicBoolean(false) }

    var permissionOk by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED,
        )
    }
    val request = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        permissionOk = granted
    }

    if (!permissionOk) {
        AlertDialog(
            onDismissRequest = { nav.popBackStack() },
            confirmButton = {
                TextButton(onClick = { request.launch(Manifest.permission.CAMERA) }) {
                    Text("Allow camera")
                }
            },
            title = { Text("Camera needed") },
            text = { Text("Gluci uses the camera to scan grocery barcodes.") },
        )
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Scan barcode") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { _ ->
        Box(Modifier.fillMaxSize()) {
            AndroidView(
                factory = { ctx ->
                    val previewView = PreviewView(ctx)
                    val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                    cameraProviderFuture.addListener({
                        val cameraProvider = cameraProviderFuture.get()
                        val preview = Preview.Builder().build().also {
                            it.surfaceProvider = previewView.surfaceProvider
                        }
                        val scanner = BarcodeScanning.getClient()
                        val analysis = ImageAnalysis.Builder()
                            .setTargetResolution(Size(1280, 720))
                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                            .build()
                        analysis.setAnalyzer(Executors.newSingleThreadExecutor()) { imageProxy ->
                            val mediaImage = imageProxy.image
                            if (mediaImage == null) {
                                imageProxy.close()
                                return@setAnalyzer
                            }
                            val image = InputImage.fromMediaImage(
                                mediaImage,
                                imageProxy.imageInfo.rotationDegrees,
                            )
                            scanner.process(image)
                                .addOnSuccessListener { codes ->
                                    val raw = codes.firstOrNull()?.rawValue
                                    if (raw != null && done.compareAndSet(false, true)) {
                                        main.post {
                                            vm.sendBarcode(raw, null)
                                            nav.popBackStack()
                                        }
                                    }
                                }
                                .addOnCompleteListener { imageProxy.close() }
                        }
                        try {
                            cameraProvider.unbindAll()
                            cameraProvider.bindToLifecycle(
                                lifecycleOwner,
                                CameraSelector.DEFAULT_BACK_CAMERA,
                                preview,
                                analysis,
                            )
                        } catch (_: Exception) { /* ignore */ }
                    }, ContextCompat.getMainExecutor(ctx))
                    previewView
                },
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}
