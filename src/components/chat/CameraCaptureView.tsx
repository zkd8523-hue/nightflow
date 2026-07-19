"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

const LONG_PRESS_MS = 250;
const MAX_RECORDING_MS = 12_000; // LIVE 최대 12초 (웹 fallback)

/**
 * 웹(비앱) getUserMedia 기반 카메라 캡처 — 앱은 네이티브 Activity(CameraLayer)를 쓴다.
 * - 탭 → 사진 / 꾹 → 영상 (max 12초)
 * - 전/후면 전환
 */
export function WebCameraCaptureView({ open, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordedMimeRef = useRef<string>("video/webm");
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const recordingMaxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const isLongPressRef = useRef(false);

  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0); // 재시도 버튼 → start() 재실행
  // 획득한 스트림을 상태로 들고 있다가, video가 확실히 마운트된 뒤 별도 effect에서 부착.
  // (getUserMedia async 타이밍에 videoRef가 늦게 준비돼 첫 스트림이 안 붙던 문제 → 전/후면 전환해야 동작하던 버그 해결)
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const [videoReady, setVideoReady] = useState(false); // loadedmetadata 후 캡처 가능

  // 카메라 뷰가 열린 동안 롱프레스 컨텍스트 메뉴/텍스트 선택/이미지 저장 팝업 억제.
  // 안드로이드 WebView·Chrome은 pointer 이벤트보다 먼저 롱프레스 기본 동작을 발동하므로,
  // document 레벨에서 contextmenu / selectstart 를 막아야 캡처 버튼 롱프레스가 정상 동작한다.
  useEffect(() => {
    if (!open) return;
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", prevent);
    document.addEventListener("selectstart", prevent);
    return () => {
      document.removeEventListener("contextmenu", prevent);
      document.removeEventListener("selectstart", prevent);
    };
  }, [open]);

  // 카메라 시작/정리
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function start() {
      try {
        // 기존 stream 정리
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        if (
          typeof window !== "undefined" &&
          !window.isSecureContext
        ) {
          throw new Error(
            "HTTPS 환경에서만 카메라를 사용할 수 있어요"
          );
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("이 브라우저는 카메라 캡처를 지원하지 않아요");
        }
        // 고해상도 요청 (ideal 1920x1080) — 미지원 기기는 자동으로 가능한 최대치로 다운.
        const videoConstraints: MediaTrackConstraints = {
          facingMode: { ideal: facing }, // soft: 후면 없는 기기(데스크톱/시뮬)도 available 카메라로
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        };
        // getUserMedia: audio 우선(동영상 녹음용) → 실패 시 video-only.
        // 또 facingMode(후면) 미지원 기기(데스크톱/단일 카메라/시뮬레이터)면
        // facing 제약을 빼고 available 카메라로 재시도 → 전/후면 토글 없이도 스트림 확보.
        const tryGet = async (v: MediaTrackConstraints) => {
          try {
            return await navigator.mediaDevices.getUserMedia({ video: v, audio: true });
          } catch {
            return await navigator.mediaDevices.getUserMedia({ video: v, audio: false });
          }
        };
        let stream: MediaStream;
        try {
          stream = await tryGet(videoConstraints);
        } catch (facingErr) {
          console.warn("[CameraCaptureView] facingMode fail, retry without facing", facingErr);
          const { facingMode: _omit, ...noFacing } = videoConstraints;
          void _omit;
          stream = await tryGet(noFacing);
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        // 부착은 별도 effect에서 (video 마운트 보장). 여기선 상태만 세팅.
        setVideoReady(false);
        setActiveStream(stream);
        setError(null);
      } catch (e) {
        console.error("[CameraCaptureView] getUserMedia error", e);
        const msg =
          e instanceof Error ? e.message : "카메라를 사용할 수 없어요";
        setError(msg);
      }
    }

    start();

    return () => {
      cancelled = true;
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (recordingMaxTimerRef.current)
        clearTimeout(recordingMaxTimerRef.current);
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          /* noop */
        }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setActiveStream(null);
    };
  }, [open, facing, retryTick]);

  // 스트림 → video 부착 (video 마운트 보장 후 실행). 첫 스트림이 안 붙던 문제 해결.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activeStream) return;
    if (v.srcObject !== activeStream) {
      v.srcObject = activeStream;
    }
    v.play().catch(() => {});
  }, [activeStream]);

  function takePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      toast.error("카메라가 아직 준비 안 됐어요");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // 전면 카메라는 좌우 반전된 게 자연스러우니 캡처 시에도 반전 적용
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error("사진 캡처 실패");
          return;
        }
        const file = new File([blob], `shot-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        onCapture(file);
      },
      "image/jpeg",
      0.9
    );
  }

  function pickMimeType(): string {
    const candidates = [
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=h264,opus",
      "video/webm",
    ];
    for (const m of candidates) {
      if (
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported(m)
      ) {
        return m;
      }
    }
    return "";
  }

  function startRecording() {
    if (!streamRef.current) {
      toast.error("카메라 스트림이 준비 안 됐어요");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      toast.error("이 브라우저는 동영상 녹화를 지원하지 않아요 (MediaRecorder)");
      return;
    }
    const mime = pickMimeType();
    recordedMimeRef.current = mime || "video/webm";
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(
        streamRef.current,
        mime ? { mimeType: mime } : undefined
      );
    } catch (e) {
      // mimeType 지정에서 실패한 경우 → 기본 옵션으로 재시도
      console.warn(
        "[CameraCaptureView] MediaRecorder with mime fail, retry default",
        e
      );
      try {
        rec = new MediaRecorder(streamRef.current);
        recordedMimeRef.current = "video/webm";
      } catch (e2) {
        console.error("[CameraCaptureView] MediaRecorder default fail", e2);
        toast.error(
          `녹화 시작 실패: ${
            e2 instanceof Error ? e2.message : "알 수 없는 오류"
          }`
        );
        return;
      }
    }
    try {
      recordedChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = recordedMimeRef.current;
        const ext = type.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(recordedChunksRef.current, { type });
        if (blob.size === 0) {
          toast.error("녹화된 영상이 너무 짧아요");
          return;
        }
        const file = new File([blob], `shot-${Date.now()}.${ext}`, { type });
        onCapture(file);
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
      setElapsedMs(0);
      const startedAt = Date.now();
      recordingTimerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAt);
      }, 100);
      recordingMaxTimerRef.current = setTimeout(() => {
        stopRecording();
      }, MAX_RECORDING_MS);
    } catch (e) {
      console.error("[CameraCaptureView] startRecording error", e);
      toast.error(
        `녹화 시작 실패: ${e instanceof Error ? e.message : "알 수 없는 오류"}`
      );
    }
  }

  function stopRecording() {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        /* noop */
      }
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (recordingMaxTimerRef.current) {
      clearTimeout(recordingMaxTimerRef.current);
      recordingMaxTimerRef.current = null;
    }
    setRecording(false);
    setElapsedMs(0);
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (error) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* 일부 브라우저는 지원 안 함 */
    }
    isLongPressRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      startRecording();
    }, LONG_PRESS_MS);
  }

  function handlePointerUp(e?: React.PointerEvent) {
    e?.stopPropagation();
    if (e) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    }
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (isLongPressRef.current) {
      stopRecording();
    } else {
      takePhoto();
    }
    isLongPressRef.current = false;
  }

  function handlePointerCancel(e?: React.PointerEvent) {
    handlePointerUp(e);
  }

  if (!open) return null;
  // SSR 가드 + portal 대상이 아직 없을 때
  if (typeof document === "undefined") return null;

  const progressPct = Math.min((elapsedMs / MAX_RECORDING_MS) * 100, 100);
  // SVG circle 둘레: 2 * π * 46 ≈ 289
  const circumference = 289;
  const dashArray = `${(progressPct / 100) * circumference} ${circumference}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black flex flex-col select-none"
      style={{
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      {/* 비디오 프리뷰 */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => setVideoReady(true)}
          onCanPlay={() => setVideoReady(true)}
          className={`w-full h-full object-cover ${
            facing === "user" ? "-scale-x-100" : ""
          }`}
        />

        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6 bg-black/80">
            <div className="text-center max-w-xs">
              <p className="text-white text-[14px] font-bold">{error}</p>
              <p className="text-neutral-400 text-[12px] mt-2">
                카메라 권한을 허용해주세요.
              </p>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setRetryTick((t) => t + 1);
                }}
                className="mt-4 px-5 py-2.5 rounded-full bg-white text-black text-[13px] font-black active:scale-95 transition-transform"
              >
                다시 시도
              </button>
            </div>
          </div>
        )}

        {/* 상단 컨트롤 */}
        <div className="absolute top-0 inset-x-0 p-4 flex items-center justify-between pointer-events-none">
          <button
            type="button"
            onClick={onClose}
            className="pointer-events-auto w-10 h-10 rounded-full bg-black/50 backdrop-blur flex items-center justify-center text-white active:scale-90 transition-transform"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
          {recording && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500 text-white text-[12px] font-black tabular-nums">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              REC {(elapsedMs / 1000).toFixed(1)}s / 12s
            </div>
          )}
          <button
            type="button"
            onClick={() =>
              setFacing((f) => (f === "environment" ? "user" : "environment"))
            }
            disabled={recording || !!error}
            className="pointer-events-auto w-10 h-10 rounded-full bg-black/50 backdrop-blur flex items-center justify-center text-white disabled:opacity-30 active:scale-90 transition-transform"
            aria-label="카메라 전환"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>

        {/* 하단 안내 */}
        {!error && (
          <div className="absolute bottom-32 inset-x-0 text-center pointer-events-none">
            <p className="text-white/90 text-[12px] font-bold drop-shadow-lg">
              {recording
                ? "손을 떼면 녹화가 정지됩니다"
                : "탭=사진 · 꾹 누르면 동영상 (최대 12초)"}
            </p>
          </div>
        )}
      </div>

      {/* 캡처 버튼 */}
      {!error && (
        <div className="absolute bottom-0 inset-x-0 pb-8 flex items-center justify-center">
          <button
            type="button"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            onTouchStart={(e) => e.preventDefault()}
            className="relative w-20 h-20 rounded-full flex items-center justify-center"
            style={{
              touchAction: "none",
              WebkitTouchCallout: "none",
              WebkitUserSelect: "none",
              userSelect: "none",
              WebkitTapHighlightColor: "transparent",
            }}
            aria-label="탭하면 사진, 길게 누르면 동영상"
          >
            {/* 외곽 흰 링 — pointer-events-none으로 부모 button이 이벤트 직접 받게 */}
            <div className="absolute inset-0 rounded-full border-4 border-white pointer-events-none" />
            {/* 진행 링 (녹화 중) */}
            {recording && (
              <svg
                className="absolute inset-0 -rotate-90 w-full h-full pointer-events-none"
                viewBox="0 0 100 100"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="5"
                  strokeDasharray={dashArray}
                  strokeLinecap="round"
                />
              </svg>
            )}
            {/* 내부 캡처 인디케이터 — 준비 전엔 흐리게(탭은 되지만 곧 준비됨을 안내) */}
            <div
              className={`rounded-full bg-red-500 transition-all duration-150 pointer-events-none ${
                recording ? "w-7 h-7 rounded-md" : "w-14 h-14"
              } ${videoReady || recording ? "" : "opacity-40"}`}
            />
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
