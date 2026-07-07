package kr.nightflow.app.camera;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Range;
import android.view.View;
import android.widget.ImageButton;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.OptIn;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.camera2.interop.Camera2Interop;
import androidx.camera.camera2.interop.ExperimentalCamera2Interop;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.video.FileOutputOptions;
import androidx.camera.video.Quality;
import androidx.camera.video.QualitySelector;
import androidx.camera.video.Recorder;
import androidx.camera.video.Recording;
import androidx.camera.video.VideoCapture;
import androidx.camera.video.VideoRecordEvent;
import androidx.camera.view.PreviewView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.common.util.concurrent.ListenableFuture;

import android.hardware.camera2.CameraMetadata;
import android.hardware.camera2.CaptureRequest;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import kr.nightflow.app.R;

/**
 * 풀스크린 네이티브 카메라 (LIVE 촬영).
 *
 * - CameraX Preview(PERFORMANCE=SurfaceView) + ImageCapture + VideoCapture 단일 바인딩
 *   → SurfaceView 하드웨어 오버레이라 WebView 투명합성 크래시 없음
 * - 탭=사진 / 꾹=영상(최대 12초)
 * - 저조도(클럽): Camera2Interop로 AE FPS 하한을 낮춰 노출을 길게 + 노출보정 최대
 * - 결과: 사진 base64 / 영상 파일 path 를 Intent extra로 반환
 */
public class NativeCameraActivity extends AppCompatActivity {

    private static final int REQ_PERM = 9910;
    private static final long MAX_VIDEO_MS = 12_000;

    private PreviewView previewView;
    private ShutterButton shutter;
    private TextView recIndicator;

    private ProcessCameraProvider cameraProvider;
    private ImageCapture imageCapture;
    private VideoCapture<Recorder> videoCapture;
    private Camera camera;
    private Recording activeRecording;

    private CameraSelector cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA;
    private final ExecutorService cameraExecutor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private long recStartMs = 0;
    private final Runnable recTick = new Runnable() {
        @Override
        public void run() {
            long elapsed = System.currentTimeMillis() - recStartMs;
            float p = Math.min(1f, elapsed / (float) MAX_VIDEO_MS);
            shutter.setProgress(p);
            recIndicator.setText(String.format("● REC %.1fs / 12s", elapsed / 1000f));
            if (elapsed >= MAX_VIDEO_MS) {
                stopRecording();
            } else {
                mainHandler.postDelayed(this, 100);
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_native_camera);

        previewView = findViewById(R.id.previewView);
        shutter = findViewById(R.id.shutter);
        recIndicator = findViewById(R.id.recIndicator);
        ImageButton btnClose = findViewById(R.id.btnClose);
        ImageButton btnFlip = findViewById(R.id.btnFlip);

        // SurfaceView 기반 PERFORMANCE 모드 — 하드웨어 오버레이, WebView 합성 크래시 회피
        previewView.setImplementationMode(PreviewView.ImplementationMode.PERFORMANCE);

        btnClose.setOnClickListener(v -> {
            setResult(RESULT_CANCELED);
            finish();
        });
        btnFlip.setOnClickListener(v -> flipCamera());

        shutter.setListener(new ShutterButton.Listener() {
            @Override public void onPhoto() { takePhoto(); }
            @Override public void onVideoStart() { startRecording(); }
            @Override public void onVideoStop() { stopRecording(); }
        });

        if (hasPermissions()) {
            startCamera();
        } else {
            ActivityCompat.requestPermissions(this,
                new String[]{Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO},
                REQ_PERM);
        }
    }

    private boolean hasPermissions() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED
            && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_PERM) {
            if (hasPermissions()) {
                startCamera();
            } else {
                setResult(RESULT_CANCELED);
                finish();
            }
        }
    }

    @OptIn(markerClass = ExperimentalCamera2Interop.class)
    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            try {
                cameraProvider = future.get();
                bindUseCases();
            } catch (Exception e) {
                setResult(RESULT_CANCELED);
                finish();
            }
        }, ContextCompat.getMainExecutor(this));
    }

    @OptIn(markerClass = ExperimentalCamera2Interop.class)
    private void bindUseCases() {
        cameraProvider.unbindAll();

        // Preview — 저조도 AE 튜닝
        Preview.Builder previewBuilder = new Preview.Builder();
        Camera2Interop.Extender<Preview> ext = new Camera2Interop.Extender<>(previewBuilder);
        ext.setCaptureRequestOption(CaptureRequest.CONTROL_AE_MODE,
            CameraMetadata.CONTROL_AE_MODE_ON);
        // 어두우면 AE가 셔터를 길게 열도록 하한을 7fps까지 허용 (클럽 정지샷 기준)
        ext.setCaptureRequestOption(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE,
            new Range<>(7, 30));
        Preview preview = previewBuilder.build();
        preview.setSurfaceProvider(previewView.getSurfaceProvider());

        // 사진
        imageCapture = new ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
            .build();

        // 영상 — FHD 우선, 없으면 HD/SD 폴백
        Recorder recorder = new Recorder.Builder()
            .setQualitySelector(QualitySelector.fromOrderedList(
                Arrays.asList(Quality.FHD, Quality.HD, Quality.SD)))
            .build();
        videoCapture = VideoCapture.withOutput(recorder);

        try {
            camera = cameraProvider.bindToLifecycle(
                this, cameraSelector, preview, imageCapture, videoCapture);
            // 노출 보정을 지원 범위 상단 근처로 밀어 밝게 (저조도 보정)
            if (camera.getCameraInfo().getExposureState().isExposureCompensationSupported()) {
                Range<Integer> range = camera.getCameraInfo().getExposureState()
                    .getExposureCompensationRange();
                int target = Math.round(range.getUpper() * 0.6f);
                camera.getCameraControl().setExposureCompensationIndex(target);
            }
        } catch (Exception e) {
            setResult(RESULT_CANCELED);
            finish();
        }
    }

    private void flipCamera() {
        cameraSelector = (cameraSelector == CameraSelector.DEFAULT_BACK_CAMERA)
            ? CameraSelector.DEFAULT_FRONT_CAMERA
            : CameraSelector.DEFAULT_BACK_CAMERA;
        bindUseCases();
    }

    private void takePhoto() {
        if (imageCapture == null) return;
        imageCapture.takePicture(cameraExecutor, new ImageCapture.OnImageCapturedCallback() {
            @Override
            public void onCaptureSuccess(@NonNull androidx.camera.core.ImageProxy image) {
                try {
                    java.nio.ByteBuffer buffer = image.getPlanes()[0].getBuffer();
                    byte[] jpegBytes = new byte[buffer.remaining()];
                    buffer.get(jpegBytes);
                    int rotation = image.getImageInfo().getRotationDegrees();
                    boolean front = cameraSelector == CameraSelector.DEFAULT_FRONT_CAMERA;
                    byte[] finalJpeg = applyOrientation(jpegBytes, rotation, front);
                    String base64 = Base64.encodeToString(finalJpeg, Base64.NO_WRAP);
                    image.close();
                    mainHandler.post(() -> returnPhoto(base64));
                } catch (Exception e) {
                    image.close();
                    mainHandler.post(() -> { setResult(RESULT_CANCELED); finish(); });
                }
            }

            @Override
            public void onError(@NonNull ImageCaptureException exception) {
                mainHandler.post(() -> { setResult(RESULT_CANCELED); finish(); });
            }
        });
    }

    /** JPEG를 회전 정보에 맞게 실제 회전 + 전면 좌우반전 후 재인코딩 */
    private byte[] applyOrientation(byte[] jpeg, int rotationDegrees, boolean front) {
        if (rotationDegrees == 0 && !front) return jpeg;
        Bitmap bmp = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.length);
        if (bmp == null) return jpeg;
        Matrix m = new Matrix();
        if (rotationDegrees != 0) m.postRotate(rotationDegrees);
        if (front) m.postScale(-1, 1);
        Bitmap rotated = Bitmap.createBitmap(bmp, 0, 0, bmp.getWidth(), bmp.getHeight(), m, true);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        rotated.compress(Bitmap.CompressFormat.JPEG, 90, out);
        if (rotated != bmp) rotated.recycle();
        bmp.recycle();
        return out.toByteArray();
    }

    private void returnPhoto(String base64) {
        Intent data = new Intent();
        data.putExtra("mediaType", "photo");
        data.putExtra("base64", base64);
        setResult(RESULT_OK, data);
        finish();
    }

    private void startRecording() {
        if (videoCapture == null || activeRecording != null) return;
        File outFile = new File(getCacheDir(), "live_" + System.currentTimeMillis() + ".mp4");
        FileOutputOptions options = new FileOutputOptions.Builder(outFile).build();

        boolean audioGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED;

        androidx.camera.video.PendingRecording pending =
            videoCapture.getOutput().prepareRecording(this, options);
        if (audioGranted) {
            pending = pending.withAudioEnabled();
        }

        recIndicator.setVisibility(View.VISIBLE);
        recStartMs = System.currentTimeMillis();
        mainHandler.post(recTick);

        activeRecording = pending.start(ContextCompat.getMainExecutor(this), event -> {
            if (event instanceof VideoRecordEvent.Finalize) {
                VideoRecordEvent.Finalize fin = (VideoRecordEvent.Finalize) event;
                mainHandler.removeCallbacks(recTick);
                recIndicator.setVisibility(View.GONE);
                shutter.resetRecording();
                if (!fin.hasError()) {
                    returnVideo(outFile.getAbsolutePath());
                } else {
                    //noinspection ResultOfMethodCallIgnored
                    outFile.delete();
                    setResult(RESULT_CANCELED);
                    finish();
                }
            }
        });
    }

    private void stopRecording() {
        if (activeRecording != null) {
            activeRecording.stop();
            activeRecording = null;
        }
    }

    private void returnVideo(String path) {
        Intent data = new Intent();
        data.putExtra("mediaType", "video");
        data.putExtra("path", path);
        setResult(RESULT_OK, data);
        finish();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        mainHandler.removeCallbacksAndMessages(null);
        if (activeRecording != null) {
            activeRecording.stop();
            activeRecording = null;
        }
        cameraExecutor.shutdown();
        if (cameraProvider != null) {
            cameraProvider.unbindAll();
        }
    }
}
