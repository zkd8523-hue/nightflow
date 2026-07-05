package kr.nightflow.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.BridgeActivity;
import com.kakao.sdk.common.KakaoSdk;

/**
 * NightFlow MainActivity.
 *
 * WebView에서 getUserMedia()로 카메라·마이크를 사용할 수 있게 하기 위해
 * WebChromeClient.onPermissionRequest 를 override 하여 요청을 즉시 grant 한다.
 * (Android 시스템 CAMERA/RECORD_AUDIO 런타임 권한은 별도로 요청.)
 */
public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQ_CAMERA_MIC = 4128;
    private PermissionRequest pendingPermissionRequest;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        KakaoSdk.init(this, getString(R.string.kakao_app_key));

        // Capacitor Bridge 의 WebView 에 커스텀 WebChromeClient 설치.
        // Bridge 가 기본 WebChromeClient 를 세팅해두므로, 기본 동작을 유지하기 위해
        // 서브클래싱 대신 요청 처리만 담당하는 클라이언트로 교체하지 않고,
        // Bridge 의 것을 확장한 형태로 붙인다.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> handlePermissionRequest(request));
                }
            });
        }
    }

    private void handlePermissionRequest(PermissionRequest request) {
        String[] requested = request.getResources();
        boolean needsCamera = false;
        boolean needsMic = false;
        for (String r : requested) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) needsCamera = true;
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) needsMic = true;
        }

        boolean cameraGranted = !needsCamera ||
            ActivityCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED;
        boolean micGranted = !needsMic ||
            ActivityCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;

        if (cameraGranted && micGranted) {
            request.grant(requested);
            return;
        }

        // 시스템 권한 필요 — 요청 저장 후 런타임 팝업
        pendingPermissionRequest = request;
        java.util.List<String> toAsk = new java.util.ArrayList<>();
        if (needsCamera && !cameraGranted) toAsk.add(Manifest.permission.CAMERA);
        if (needsMic && !micGranted) toAsk.add(Manifest.permission.RECORD_AUDIO);
        ActivityCompat.requestPermissions(
            this,
            toAsk.toArray(new String[0]),
            PERMISSION_REQ_CAMERA_MIC
        );
    }

    @Override
    public void onRequestPermissionsResult(
        int requestCode, String[] permissions, int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != PERMISSION_REQ_CAMERA_MIC) return;
        if (pendingPermissionRequest == null) return;

        boolean allGranted = grantResults.length > 0;
        for (int r : grantResults) {
            if (r != PackageManager.PERMISSION_GRANTED) { allGranted = false; break; }
        }
        if (allGranted) {
            pendingPermissionRequest.grant(pendingPermissionRequest.getResources());
        } else {
            pendingPermissionRequest.deny();
        }
        pendingPermissionRequest = null;
    }
}
