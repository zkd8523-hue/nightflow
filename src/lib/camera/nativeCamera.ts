/**
 * 커스텀 네이티브 카메라 브릿지 (Capacitor 로컬 플러그인 "NativeCamera").
 *
 * capgo camera-preview의 toBack 투명합성이 삼성 WebView를 크래시시키는 문제를 피하기 위해
 * 별도 풀스크린 네이티브 Activity로 카메라를 띄운다. 웹은 촬영을 "호출하고 파일을 받는다".
 *
 * 플러그인은 registerPlugin으로 브릿지 등록 (직접 import 금지 규칙 준수).
 */

import { registerPlugin, Capacitor } from "@capacitor/core";

interface CaptureResult {
  mediaType: "photo" | "video";
  mimeType: string;
  path?: string; // 앱 캐시 파일 경로 (사진/영상 공통) — readTemp로 base64 읽음
}

interface NativeCameraPlugin {
  capture(): Promise<CaptureResult>;
  readTemp(options: { path: string }): Promise<{ base64: string }>;
}

const NativeCamera = registerPlugin<NativeCameraPlugin>("NativeCamera");

/** 앱(네이티브 플러그인 사용 가능)인지 */
export function isNativeCameraAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("NativeCamera");
}

/** base64 → Blob */
function base64ToBlob(base64: string, mime: string): Blob {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mime });
}

function stamp(): string {
  return `${Date.now()}`;
}

/**
 * 네이티브 카메라 실행 → 촬영 결과를 File로 반환.
 * 사용자가 취소하면 null.
 *
 * - 사진: base64 직접 반환 → File(jpg)
 * - 영상: 파일 경로 반환 → readTemp로 네이티브가 base64 읽어 반환 (WebView 오리진 우회)
 */
export async function captureNative(): Promise<File | null> {
  let res: CaptureResult;
  try {
    res = await NativeCamera.capture();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("CAMERA_CANCELLED")) return null;
    throw e;
  }

  // 사진·영상 모두 파일 경로 → readTemp로 네이티브가 base64 읽어 반환
  // (base64 직접 Intent 전달은 TransactionTooLargeException, WebView 오리진도 우회)
  if (res.path) {
    const { base64 } = await NativeCamera.readTemp({ path: res.path });
    if (res.mediaType === "photo") {
      const blob = base64ToBlob(base64, res.mimeType || "image/jpeg");
      return new File([blob], `live-${stamp()}.jpg`, { type: "image/jpeg" });
    }
    if (res.mediaType === "video") {
      const blob = base64ToBlob(base64, res.mimeType || "video/mp4");
      return new File([blob], `live-${stamp()}.mp4`, { type: "video/mp4" });
    }
  }

  return null;
}
