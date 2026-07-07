import { create } from "zustand";

/**
 * 전역 카메라 레이어 제어 스토어.
 *
 * 카메라(앱=네이티브 Activity / 웹=WebCameraCaptureView)를 어떤 Sheet/Dialog보다 바깥,
 * 앱 루트(layout.tsx)에 단 하나 마운트해두고 이 스토어로 연다.
 * → Radix Sheet의 조상 불투명 레이어 문제와 리렌더로 인한 카메라 재시작이 원천 제거된다.
 *
 * 사용:
 *   openCamera((file) => { ...캡처 결과 처리... })
 *   → 전역 <CameraLayer /> 가 열리고, 캡처 완료 시 onCapture 콜백 호출 후 자동 닫힘
 */
interface CameraStore {
  open: boolean;
  onCaptureRef: ((file: File) => void) | null;
  openCamera: (onCapture: (file: File) => void) => void;
  closeCamera: () => void;
}

export const useCameraStore = create<CameraStore>((set) => ({
  open: false,
  onCaptureRef: null,
  openCamera: (onCapture) => set({ open: true, onCaptureRef: onCapture }),
  closeCamera: () => set({ open: false, onCaptureRef: null }),
}));
