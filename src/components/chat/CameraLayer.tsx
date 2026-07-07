"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { WebCameraCaptureView } from "./CameraCaptureView";
import { useCameraStore } from "@/stores/useCameraStore";
import { isNativeCameraAvailable, captureNative } from "@/lib/camera/nativeCamera";

/**
 * 전역 카메라 레이어 — 앱 루트(layout.tsx)에 단 하나 마운트.
 *
 * 앱(네이티브 플러그인 사용 가능): 별도 풀스크린 네이티브 Activity를 띄운다(React 뷰 없음).
 *   → WebView가 Activity 뒤로 완전히 가려져 투명합성 크래시가 원천 차단됨.
 * 웹: 기존 getUserMedia 기반 WebCameraCaptureView.
 */
export function CameraLayer() {
  const open = useCameraStore((s) => s.open);
  const onCaptureRef = useCameraStore((s) => s.onCaptureRef);
  const closeCamera = useCameraStore((s) => s.closeCamera);
  const launchingRef = useRef(false);

  // 앱: open이 true가 되면 네이티브 카메라 Activity 실행 (한 번만)
  useEffect(() => {
    if (!open) {
      launchingRef.current = false;
      return;
    }
    if (!isNativeCameraAvailable()) return; // 웹은 아래 JSX로 처리
    if (launchingRef.current) return;
    launchingRef.current = true;

    (async () => {
      try {
        const file = await captureNative();
        if (file) onCaptureRef?.(file);
      } catch (e) {
        console.error("[CameraLayer] native capture error", e);
        const msg = e instanceof Error ? e.message : "";
        toast.error(`카메라 오류: ${msg || "알 수 없음"}`);
      } finally {
        launchingRef.current = false;
        closeCamera();
      }
    })();
  }, [open, onCaptureRef, closeCamera]);

  // 웹에서만 React 카메라 뷰 렌더 (앱은 네이티브 Activity라 렌더 불필요)
  if (isNativeCameraAvailable()) return null;

  return (
    <WebCameraCaptureView
      open={open}
      onClose={closeCamera}
      onCapture={(file) => {
        onCaptureRef?.(file);
        closeCamera();
      }}
    />
  );
}
