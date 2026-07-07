package kr.nightflow.app.camera;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.Handler;
import android.os.Looper;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.View;

import androidx.annotation.Nullable;

/**
 * 인스타식 셔터 버튼.
 * - 짧은 탭 → onPhoto
 * - 길게 누름(250ms+) → onVideoStart, 손 떼면 onVideoStop
 * - 녹화 중 빨간 진행 링 표시 (progress 0~1)
 *
 * NativeCameraView.tsx의 handlePointerDown/Up 로직을 그대로 네이티브로 이식.
 */
public class ShutterButton extends View {

    public interface Listener {
        void onPhoto();
        void onVideoStart();
        void onVideoStop();
    }

    private static final long LONG_PRESS_MS = 250;

    private final Paint ringPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint innerPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint progressPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF progressRect = new RectF();

    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean isLongPress = false;
    private boolean recording = false;
    private float progress = 0f; // 0~1
    private Listener listener;

    private final Runnable longPressRunnable = () -> {
        isLongPress = true;
        recording = true;
        if (listener != null) listener.onVideoStart();
        invalidate();
    };

    public ShutterButton(Context context, @Nullable AttributeSet attrs) {
        super(context, attrs);
        ringPaint.setStyle(Paint.Style.STROKE);
        ringPaint.setColor(Color.WHITE);
        ringPaint.setStrokeWidth(dp(4));

        innerPaint.setStyle(Paint.Style.FILL);
        innerPaint.setColor(Color.parseColor("#EF4444"));

        progressPaint.setStyle(Paint.Style.STROKE);
        progressPaint.setColor(Color.parseColor("#EF4444"));
        progressPaint.setStrokeWidth(dp(5));
        progressPaint.setStrokeCap(Paint.Cap.ROUND);
    }

    public void setListener(Listener l) {
        this.listener = l;
    }

    /** 녹화 진행률 갱신 (0~1) */
    public void setProgress(float p) {
        this.progress = Math.max(0f, Math.min(1f, p));
        invalidate();
    }

    /** 외부에서 녹화 종료 처리 (max 시간 도달 등) */
    public void resetRecording() {
        recording = false;
        progress = 0f;
        isLongPress = false;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float cx = getWidth() / 2f;
        float cy = getHeight() / 2f;
        float outerR = Math.min(cx, cy) - dp(4);

        // 외곽 흰 링
        canvas.drawCircle(cx, cy, outerR, ringPaint);

        // 내부 (녹화 중이면 작은 사각, 아니면 큰 원)
        if (recording) {
            float half = dp(14);
            canvas.drawRoundRect(cx - half, cy - half, cx + half, cy + half, dp(6), dp(6), innerPaint);
            // 진행 링
            float inset = dp(2);
            progressRect.set(cx - outerR + inset, cy - outerR + inset, cx + outerR - inset, cy + outerR - inset);
            canvas.drawArc(progressRect, -90f, progress * 360f, false, progressPaint);
        } else {
            canvas.drawCircle(cx, cy, outerR - dp(6), innerPaint);
        }
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                isLongPress = false;
                handler.removeCallbacks(longPressRunnable);
                handler.postDelayed(longPressRunnable, LONG_PRESS_MS);
                return true;

            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                handler.removeCallbacks(longPressRunnable);
                if (isLongPress || recording) {
                    recording = false;
                    if (listener != null) listener.onVideoStop();
                } else {
                    if (listener != null) listener.onPhoto();
                }
                isLongPress = false;
                invalidate();
                return true;
        }
        return super.onTouchEvent(event);
    }

    private float dp(float v) {
        return v * getResources().getDisplayMetrics().density;
    }
}
