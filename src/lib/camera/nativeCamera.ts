/**
 * 네이티브 카메라 프리뷰 래퍼 (@capacitor-community/camera-preview)
 *
 * LIVE 촬영을 네이티브 카메라 파이프라인으로 처리 — 저조도(클럽) 후처리·ISP·HDR 적용.
 * 웹 getUserMedia 대비 어두운 환경 화질이 크게 좋아진다.
 *
 * 플러그인은 dynamic import — 웹 SSR 번들에 네이티브 코드가 섞이지 않게 하고,
 * 앱(Capacitor)에서만 실제 네이티브 프리뷰가 뜨도록 플랫폼 가드로 감싼다.
 */

export interface NativeCameraStartOptions {
  /** 프리뷰를 붙일 부모 엘리먼트 id (HTML을 프리뷰 앞으로 = toBack) */
  position?: "rear" | "front";
}

/** 이 기기에서 네이티브 카메라 프리뷰를 쓸 수 있는지 (앱 = true, 웹 = false) */
export async function isNativeCameraAvailable(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** 네이티브 카메라 프리뷰 시작 (풀스크린, HTML을 앞으로) */
export async function startNativePreview(
  position: "rear" | "front" = "rear"
): Promise<void> {
  const { CameraPreview } = await import("@capgo/camera-preview");
  // force:true — 이전 세션이 남아있으면 강제 종료 후 깨끗이 시작 (중복 start 경쟁 방지)
  // width/height 생략 — capgo가 화면 전체로 자동 계산 (직접 픽셀 지정 시 중복 계산 이슈)
  await CameraPreview.start({
    position,
    parent: "cameraPreviewRoot",
    className: "camera-preview-el",
    toBack: true,
    disableAudio: false, // 영상 녹화용 오디오 유지
    // 정의에 없을 수 있는 옵션이라 캐스팅 — Android 네이티브가 force를 읽음
    ...({ force: true } as Record<string, unknown>),
  });
}

/** 프리뷰 정지 + 정리 */
export async function stopNativePreview(): Promise<void> {
  try {
    const { CameraPreview } = await import("@capgo/camera-preview");
    await CameraPreview.stop();
  } catch {
    /* 이미 정지됐거나 미시작 — 무시 */
  }
}

/** 사진 촬영 → File (JPEG) */
export async function captureNativePhoto(): Promise<File> {
  const { CameraPreview } = await import("@capgo/camera-preview");
  const { value } = await CameraPreview.capture({ quality: 90 });
  // value = base64 (no data: prefix)
  const blob = base64ToBlob(value, "image/jpeg");
  return new File([blob], `live-${stamp()}.jpg`, { type: "image/jpeg" });
}

/** 영상 녹화 시작 */
export async function startNativeVideo(
  position: "rear" | "front" = "rear"
): Promise<void> {
  const { CameraPreview } = await import("@capgo/camera-preview");
  // maxDuration은 쓰지 않음 — 네이티브 자동정지는 onStopRecordVideo 콜백으로만 파일을
  // 반환하는데, 우리 stopRecordVideo() 호출 경로와 분리돼 파일을 놓칠 수 있다.
  // 최대 길이는 NativeCameraView의 JS 타이머가 stopNativeVideo()를 호출해 제어한다.
  await CameraPreview.startRecordVideo({ position });
}

/** 영상 녹화 정지 → File (mp4). capgo는 iOS/Android 모두 videoFilePath 반환 (통일). */
export async function stopNativeVideo(): Promise<File> {
  const { CameraPreview } = await import("@capgo/camera-preview");
  const res = await CameraPreview.stopRecordVideo();
  // 네이티브 캐시 파일 경로 → convertFileSrc로 WebView에서 읽어 Blob화
  const path = res?.videoFilePath;
  if (!path) throw new Error("영상 파일 경로를 받지 못했어요");
  const { Capacitor } = await import("@capacitor/core");
  const src = Capacitor.convertFileSrc(path);
  const resp = await fetch(src);
  const blob = await resp.blob();
  return new File([blob], `live-${stamp()}.mp4`, {
    type: blob.type || "video/mp4",
  });
}

/** 전/후면 전환 */
export async function flipNativeCamera(): Promise<void> {
  const { CameraPreview } = await import("@capgo/camera-preview");
  await CameraPreview.flip();
}

// --- helpers ---

function stamp(): string {
  // Date.now()는 일반 컴포넌트 컨텍스트에서 사용 가능 (워크플로우 스크립트 아님)
  return `${Date.now()}`;
}

function base64ToBlob(base64: string, mime: string): Blob {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mime });
}
