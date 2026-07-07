"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import {
  startNativePreview,
  stopNativePreview,
  captureNativePhoto,
  startNativeVideo,
  stopNativeVideo,
  flipNativeCamera,
} from "@/lib/camera/nativeCamera";

interface Props {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

const LONG_PRESS_MS = 250;
const MAX_RECORDING_MS = 12_000; // LIVE 최대 12초

/**
 * 네이티브 카메라 프리뷰 캡처 (앱 전용, @capacitor-community/camera-preview)
 * - 탭 → 사진 / 꾹 누름 → 영상 (max 12초)
 * - 네이티브 파이프라인이라 저조도(클럽) 후처리·ISP·HDR 적용 → 웹 대비 화질 우수
 * - toBack:true 로 네이티브 프리뷰가 WebView 뒤에 렌더되므로, 이 오버레이 배경은 투명해야 함
 */
export function NativeCameraView({ open, onClose, onCapture }: Props) {
  const [position, setPosition] = useState<"rear" | "front">("rear");
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordMaxRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);
  const recordingRef = useRef(false);

  // 프리뷰 시작/정리
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setReady(false);

    // toBack:true 는 네이티브 프리뷰를 WebView 뒤에 둔다.
    // WebView(html/body)와 상위 배경이 불투명하면 카메라가 가려져 검은 화면이 되므로
    // 카메라가 열린 동안 html/body 배경을 투명으로 강제하고, 닫힐 때 복원한다.
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBg = html.style.background;
    const prevBodyBg = body.style.background;
    html.style.background = "transparent";
    body.style.background = "transparent";
    html.classList.add("native-camera-open");

    (async () => {
      try {
        await startNativePreview(position);
        if (!cancelled) setReady(true);
      } catch (e) {
        console.error("[NativeCameraView] start error", e);
        toast.error("카메라를 시작할 수 없어요");
        onClose();
      }
    })();
    return () => {
      cancelled = true;
      clearTimers();
      stopNativePreview();
      // 배경 복원
      html.style.background = prevHtmlBg;
      body.style.background = prevBodyBg;
      html.classList.remove("native-camera-open");
    };
    // position 바뀌면 flip으로 처리하므로 open에만 의존
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function clearTimers() {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    if (recordTickRef.current) clearInterval(recordTickRef.current);
    if (recordMaxRef.current) clearTimeout(recordMaxRef.current);
    longPressTimerRef.current = null;
    recordTickRef.current = null;
    recordMaxRef.current = null;
  }

  async function handleFlip() {
    try {
      await flipNativeCamera();
      setPosition((p) => (p === "rear" ? "front" : "rear"));
    } catch (e) {
      console.warn("[NativeCameraView] flip error", e);
    }
  }

  async function doPhoto() {
    if (busy) return;
    setBusy(true);
    try {
      const file = await captureNativePhoto();
      onCapture(file);
    } catch (e) {
      console.error("[NativeCameraView] photo error", e);
      toast.error("사진 촬영 실패");
    } finally {
      setBusy(false);
    }
  }

  async function beginVideo() {
    if (recordingRef.current) return;
    try {
      await startNativeVideo(position);
      recordingRef.current = true;
      setRecording(true);
      setElapsedMs(0);
      const startedAt = performance.now();
      recordTickRef.current = setInterval(() => {
        setElapsedMs(performance.now() - startedAt);
      }, 100);
      recordMaxRef.current = setTimeout(() => {
        endVideo();
      }, MAX_RECORDING_MS);
    } catch (e) {
      console.error("[NativeCameraView] start video error", e);
      toast.error("영상 녹화를 시작할 수 없어요");
      recordingRef.current = false;
      setRecording(false);
    }
  }

  async function endVideo() {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    clearTimers();
    setRecording(false);
    setBusy(true);
    try {
      const file = await stopNativeVideo();
      onCapture(file);
    } catch (e) {
      console.error("[NativeCameraView] stop video error", e);
      toast.error("영상 저장 실패");
    } finally {
      setBusy(false);
    }
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (!ready || busy) return;
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    isLongPressRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      beginVideo();
    }, LONG_PRESS_MS);
  }

  function handlePointerUp(e?: React.PointerEvent) {
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
    if (isLongPressRef.current || recordingRef.current) {
      endVideo();
    } else {
      doPhoto();
    }
    isLongPressRef.current = false;
  }

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const progressPct = Math.min((elapsedMs / MAX_RECORDING_MS) * 100, 100);
  const circumference = 289;
  const dashArray = `${(progressPct / 100) * circumference} ${circumference}`;

  return createPortal(
    // 배경 투명 — 네이티브 프리뷰(toBack)가 뒤에 보임
    <div
      id="cameraPreviewRoot"
      className="fixed inset-0 z-[100] flex flex-col select-none"
      style={{
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTouchCallout: "none",
        background: "transparent",
      }}
    >
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
          onClick={handleFlip}
          disabled={recording}
          className="pointer-events-auto w-10 h-10 rounded-full bg-black/50 backdrop-blur flex items-center justify-center text-white disabled:opacity-30 active:scale-90 transition-transform"
          aria-label="카메라 전환"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
      </div>

      {/* 디버그 배지 (진단용 — 확인 후 제거) */}
      <div className="absolute top-16 inset-x-0 text-center pointer-events-none">
        <span className="inline-block px-2 py-1 rounded bg-black/70 text-green-400 text-[11px] font-mono">
          NATIVE · ready={String(ready)} · rec={String(recording)}
        </span>
      </div>

      {/* 안내 */}
      <div className="absolute bottom-32 inset-x-0 text-center pointer-events-none">
        <p className="text-white/90 text-[12px] font-bold drop-shadow-lg">
          {!ready
            ? "카메라 준비 중…"
            : recording
              ? "손을 떼면 녹화가 정지됩니다"
              : "탭=사진 · 꾹 누르면 동영상 (최대 12초)"}
        </p>
      </div>

      {/* 캡처 버튼 */}
      <div className="absolute bottom-0 inset-x-0 pb-8 flex items-center justify-center">
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
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
          <div className="absolute inset-0 rounded-full border-4 border-white pointer-events-none" />
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
          <div
            className={`rounded-full bg-red-500 transition-all duration-150 pointer-events-none ${
              recording ? "w-7 h-7 rounded-md" : "w-14 h-14"
            }`}
          />
        </button>
      </div>
    </div>,
    document.body
  );
}
