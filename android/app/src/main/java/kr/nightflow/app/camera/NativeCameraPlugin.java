package kr.nightflow.app.camera;

import android.app.Activity;
import android.content.Intent;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;

/**
 * 커스텀 네이티브 카메라 플러그인.
 *
 * capgo camera-preview의 toBack 투명합성이 삼성 WebView를 크래시시키는 문제를 피하기 위해
 * 별도 풀스크린 네이티브 Activity(NativeCameraActivity)로 카메라를 띄운다.
 * WebView는 Activity 뒤로 완전히 가려져 합성이 중단되므로 크래시가 원천 차단된다.
 *
 * 웹 계약:
 *   NativeCamera.capture()
 *     → { mediaType: 'photo'|'video', base64?: string, path?: string, mimeType: string }
 *   NativeCamera.readTemp({ path })  // 영상 파일을 네이티브에서 base64로 읽기 (WebView 오리진 우회)
 *     → { base64: string }
 */
@CapacitorPlugin(name = "NativeCamera")
public class NativeCameraPlugin extends Plugin {

    /** 카메라 Activity 실행 → 결과(사진 base64 / 영상 path) 반환 */
    @PluginMethod
    public void capture(PluginCall call) {
        Intent intent = new Intent(getContext(), NativeCameraActivity.class);
        startActivityForResult(call, intent, "onCaptureResult");
    }

    @ActivityCallback
    private void onCaptureResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            // 사용자가 취소(뒤로가기/X) — 에러가 아니라 취소로 처리
            call.reject("CAMERA_CANCELLED");
            return;
        }

        Intent data = result.getData();
        String mediaType = data.getStringExtra("mediaType"); // "photo" | "video"
        JSObject ret = new JSObject();

        // 사진·영상 모두 파일 경로로 반환 (base64를 Intent로 넘기면 TransactionTooLargeException).
        // 웹이 readTemp로 네이티브에서 base64를 읽어간다.
        if ("photo".equals(mediaType)) {
            ret.put("mediaType", "photo");
            ret.put("mimeType", "image/jpeg");
            ret.put("path", data.getStringExtra("path"));
            call.resolve(ret);
        } else if ("video".equals(mediaType)) {
            ret.put("mediaType", "video");
            ret.put("mimeType", "video/mp4");
            ret.put("path", data.getStringExtra("path"));
            call.resolve(ret);
        } else {
            call.reject("CAMERA_UNKNOWN_RESULT");
        }
    }

    /**
     * 영상 파일을 네이티브에서 base64로 읽어 반환.
     * convertFileSrc + fetch는 원격 오리진(nightflow.kr)에서 cross-origin/mixed-content라
     * 깨지기 쉬우므로, 파일 읽기를 네이티브에서 처리해 WebView 오리진을 우회한다.
     */
    @PluginMethod
    public void readTemp(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("NO_PATH");
            return;
        }
        File file = new File(path);
        if (!file.exists()) {
            call.reject("FILE_NOT_FOUND");
            return;
        }
        try (FileInputStream fis = new FileInputStream(file)) {
            long size = file.length();
            byte[] bytes = new byte[(int) size];
            int read = 0;
            while (read < bytes.length) {
                int r = fis.read(bytes, read, bytes.length - read);
                if (r < 0) break;
                read += r;
            }
            String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
            JSObject ret = new JSObject();
            ret.put("base64", base64);
            call.resolve(ret);
            // 임시 파일 정리
            //noinspection ResultOfMethodCallIgnored
            file.delete();
        } catch (IOException e) {
            call.reject("READ_FAILED: " + e.getMessage());
        }
    }
}
