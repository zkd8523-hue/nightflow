"use client";

import { CameraCaptureView } from "./CameraCaptureView";
import { useCameraStore } from "@/stores/useCameraStore";

/**
 * 전역 카메라 레이어 — 앱 루트(layout.tsx)에 단 하나 마운트.
 * 어떤 Sheet/Dialog보다 바깥이라 Radix 조상 불투명 레이어의 영향을 받지 않는다.
 * useCameraStore.openCamera(onCapture) 로 열린다.
 */
export function CameraLayer() {
  const open = useCameraStore((s) => s.open);
  const onCaptureRef = useCameraStore((s) => s.onCaptureRef);
  const closeCamera = useCameraStore((s) => s.closeCamera);

  return (
    <CameraCaptureView
      open={open}
      onClose={closeCamera}
      onCapture={(file) => {
        onCaptureRef?.(file);
        closeCamera();
      }}
    />
  );
}
