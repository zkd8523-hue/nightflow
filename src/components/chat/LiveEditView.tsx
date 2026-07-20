"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Zap, RotateCcw, Type, ImagePlus, BarChart3, Trash2 } from "lucide-react";
import type { TextOverlay, ShotPoll } from "@/types/database";
import { LiveTextEditor } from "./LiveTextEditor";
import { LivePollEditor } from "./LivePollEditor";

/** 게시 전 이미지 오버레이 초안 (File 보관 → 부모가 업로드) */
export interface ImageOverlayDraft {
  id: string;
  file: File;
  previewUrl: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  rotation: number;
}

interface Props {
  open: boolean;
  file: File;
  previewUrl: string;
  /** 클럽 지정 시 표시 */
  clubName?: string | null;
  uploading?: boolean;
  onClose: () => void;
  onRetake: () => void;
  onPost: (
    caption: string,
    textOverlays: TextOverlay[],
    imageOverlays: ImageOverlayDraft[],
    poll: ShotPoll | null
  ) => void;
}

let overlayIdSeq = 0;
function nextOverlayId() {
  overlayIdSeq += 1;
  return `ov_${overlayIdSeq}_${performance.now().toFixed(0)}`;
}

type OverlayKind = "text" | "image" | "poll";
interface Gesture {
  kind: OverlayKind;
  id: string;
  mode: "move" | "resize"; // resize = 이미지 모서리 핸들(데스크톱)
  pointers: Map<number, { x: number; y: number }>;
  baseX: number;
  baseY: number;
  baseScale: number; // text=fontScale / image=widthPct / poll=scale
  anchorX: number;
  anchorY: number;
  baseDist: number; // 핀치 시작 두 손가락 거리
}

const clampPct = (v: number) => Math.max(0, Math.min(100, v));
function scaleClamp(kind: OverlayKind, v: number) {
  if (kind === "text") return Math.max(0.4, Math.min(6, v));
  if (kind === "image") return Math.max(10, Math.min(95, v));
  return Math.max(0.5, Math.min(3, v)); // poll
}

/**
 * 촬영 결과 풀스크린 편집 (인스타 스토리식).
 * - 텍스트 오버레이 (Aa): 추가/드래그/색·크기 편집
 * - 이미지 오버레이 (ImagePlus): 삽입/드래그/리사이즈(모서리 핸들)/삭제
 * - 설문 (BarChart): 질문+옵션, 드래그 배치. 뷰어에서 투표.
 */
export function LiveEditView({
  open,
  file,
  previewUrl,
  clubName,
  uploading = false,
  onClose,
  onRetake,
  onPost,
}: Props) {
  const [caption, setCaption] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);

  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [imageOverlays, setImageOverlays] = useState<ImageOverlayDraft[]>([]);
  const [poll, setPoll] = useState<ShotPoll | null>(null);

  const [editingText, setEditingText] = useState<TextOverlay | null>(null);
  const [editingPoll, setEditingPoll] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  const gestureRef = useRef<Gesture | null>(null);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const isImage = file.type.startsWith("image/");

  // ── 텍스트 ──
  function addText() {
    setEditingText({ id: nextOverlayId(), text: "", xPct: 50, yPct: 40, color: "#ffffff", fontScale: 1 });
  }
  function commitText(ov: TextOverlay) {
    setTextOverlays((prev) =>
      prev.some((o) => o.id === ov.id) ? prev.map((o) => (o.id === ov.id ? ov : o)) : [...prev, ov]
    );
    setEditingText(null);
  }
  function removeText(id: string) {
    setTextOverlays((prev) => prev.filter((o) => o.id !== id));
    setEditingText(null);
  }

  // ── 이미지 ──
  function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const id = nextOverlayId();
    setImageOverlays((prev) => [
      ...prev,
      { id, file: f, previewUrl: URL.createObjectURL(f), xPct: 50, yPct: 45, widthPct: 40, rotation: 0 },
    ]);
    setSelectedImageId(id);
  }
  function removeImage(id: string) {
    setImageOverlays((prev) => {
      const t = prev.find((o) => o.id === id);
      if (t) URL.revokeObjectURL(t.previewUrl);
      return prev.filter((o) => o.id !== id);
    });
    setSelectedImageId(null);
  }

  // ── 설문 ──
  function commitPoll(p: ShotPoll) {
    setPoll({ ...p, xPct: p.xPct ?? 50, yPct: p.yPct ?? 70 });
    setEditingPoll(false);
  }

  // ── 오버레이 제스처 (드래그 + 두 손가락 핀치 확대/축소) ──
  // 현재 오버레이의 위치/스케일을 최신 state에서 읽는다 (핸들러는 매 렌더 재생성).
  function overlayGeom(kind: OverlayKind, id: string): { x: number; y: number; scale: number } | null {
    if (kind === "text") {
      const o = textOverlays.find((o) => o.id === id);
      return o ? { x: o.xPct, y: o.yPct, scale: o.fontScale } : null;
    }
    if (kind === "image") {
      const o = imageOverlays.find((o) => o.id === id);
      return o ? { x: o.xPct, y: o.yPct, scale: o.widthPct } : null;
    }
    if (poll && poll.id === id) return { x: poll.xPct ?? 50, y: poll.yPct ?? 70, scale: poll.scale ?? 1 };
    return null;
  }
  function applyGeom(kind: OverlayKind, id: string, x: number, y: number, scale?: number) {
    if (kind === "text") {
      setTextOverlays((prev) =>
        prev.map((o) => (o.id === id ? { ...o, xPct: x, yPct: y, ...(scale != null ? { fontScale: scale } : {}) } : o))
      );
    } else if (kind === "image") {
      setImageOverlays((prev) =>
        prev.map((o) => (o.id === id ? { ...o, xPct: x, yPct: y, ...(scale != null ? { widthPct: scale } : {}) } : o))
      );
    } else {
      setPoll((prev) => (prev && prev.id === id ? { ...prev, xPct: x, yPct: y, ...(scale != null ? { scale } : {}) } : prev));
    }
  }
  // 현재 상태 + 활성 포인터로 base를 다시 잡는다 (포인터 수 변할 때마다).
  function rebaseline(g: Gesture) {
    const geom = overlayGeom(g.kind, g.id);
    if (geom) {
      g.baseX = geom.x;
      g.baseY = geom.y;
      g.baseScale = geom.scale;
    }
    const pts = [...g.pointers.values()];
    if (pts.length >= 2) {
      g.anchorX = (pts[0].x + pts[1].x) / 2;
      g.anchorY = (pts[0].y + pts[1].y) / 2;
      g.baseDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
    } else if (pts.length === 1) {
      g.anchorX = pts[0].x;
      g.anchorY = pts[0].y;
      g.baseDist = 0;
    }
  }
  function onOverlayPointerDown(e: React.PointerEvent, kind: OverlayKind, id: string) {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (!gestureRef.current || gestureRef.current.id !== id || gestureRef.current.mode === "resize") {
      gestureRef.current = {
        kind, id, mode: "move", pointers: new Map(),
        baseX: 0, baseY: 0, baseScale: 1, anchorX: 0, anchorY: 0, baseDist: 0,
      };
    }
    gestureRef.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    rebaseline(gestureRef.current);
  }
  // 이미지 모서리 리사이즈 핸들 (데스크톱 — 손가락 하나로 크기)
  function onResizeDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const geom = overlayGeom("image", id);
    if (!geom) return;
    gestureRef.current = {
      kind: "image", id, mode: "resize", pointers: new Map([[e.pointerId, { x: e.clientX, y: e.clientY }]]),
      baseX: geom.x, baseY: geom.y, baseScale: geom.scale, anchorX: e.clientX, anchorY: e.clientY, baseDist: 0,
    };
  }
  function onOverlayPointerMove(e: React.PointerEvent) {
    const g = gestureRef.current;
    const stage = stageRef.current;
    if (!g || !stage || !g.pointers.has(e.pointerId)) return;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = stage.getBoundingClientRect();

    // 리사이즈 핸들: 가로 이동량으로 너비 (양쪽 대칭 *2)
    if (g.mode === "resize") {
      const dwPct = ((e.clientX - g.anchorX) / rect.width) * 100 * 2;
      applyGeom("image", g.id, g.baseX, g.baseY, scaleClamp("image", g.baseScale + dwPct));
      return;
    }

    const pts = [...g.pointers.values()];
    if (pts.length >= 2) {
      // 핀치: 거리 비율로 스케일, 중심 이동으로 위치
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      const ratio = g.baseDist > 0 ? dist / g.baseDist : 1;
      const nx = clampPct(g.baseX + ((cx - g.anchorX) / rect.width) * 100);
      const ny = clampPct(g.baseY + ((cy - g.anchorY) / rect.height) * 100);
      applyGeom(g.kind, g.id, nx, ny, scaleClamp(g.kind, g.baseScale * ratio));
    } else {
      // 드래그 (한 손가락)
      const p = pts[0];
      const nx = clampPct(g.baseX + ((p.x - g.anchorX) / rect.width) * 100);
      const ny = clampPct(g.baseY + ((p.y - g.anchorY) / rect.height) * 100);
      applyGeom(g.kind, g.id, nx, ny);
    }
  }
  function onOverlayPointerUp(e: React.PointerEvent) {
    const g = gestureRef.current;
    if (!g) return;
    g.pointers.delete(e.pointerId);
    if (g.pointers.size === 0) {
      gestureRef.current = null;
    } else {
      rebaseline(g); // 남은 손가락 기준으로 재조정 (2→1 전환 시 점프 방지)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] bg-black flex flex-col">
      {/* 미디어 + 오버레이 스테이지 */}
      <div
        ref={stageRef}
        className="absolute inset-0"
        onPointerMove={onOverlayPointerMove}
        onPointerUp={onOverlayPointerUp}
        onPointerCancel={onOverlayPointerUp}
        onClick={() => setSelectedImageId(null)}
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="미리보기" className="w-full h-full object-contain" />
        ) : (
          <video src={previewUrl} className="w-full h-full object-contain" autoPlay loop muted playsInline />
        )}

        {/* 이미지 오버레이 */}
        {imageOverlays.map((ov) => {
          const selected = selectedImageId === ov.id;
          return (
            <div
              key={ov.id}
              onPointerDown={(e) => onOverlayPointerDown(e, "image", ov.id)}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedImageId(ov.id);
              }}
              className="absolute touch-none select-none cursor-move"
              style={{
                left: `${ov.xPct}%`,
                top: `${ov.yPct}%`,
                width: `${ov.widthPct}%`,
                transform: `translate(-50%, -50%) rotate(${ov.rotation}deg)`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ov.previewUrl}
                alt=""
                draggable={false}
                className={`w-full h-auto rounded-lg ${selected ? "ring-2 ring-white" : ""}`}
              />
              {selected && (
                <>
                  {/* 삭제 (좌상단) */}
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImage(ov.id);
                    }}
                    className="absolute -top-3 -left-3 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center text-white"
                    aria-label="이미지 삭제"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  {/* 리사이즈 핸들 (우하단) */}
                  <div
                    onPointerDown={(e) => onResizeDown(e, ov.id)}
                    className="absolute -bottom-3 -right-3 w-7 h-7 rounded-full bg-white flex items-center justify-center touch-none cursor-nwse-resize"
                    aria-label="크기 조절"
                  >
                    <div className="w-3 h-3 border-r-2 border-b-2 border-black" />
                  </div>
                </>
              )}
            </div>
          );
        })}

        {/* 텍스트 오버레이 */}
        {textOverlays.map((ov) => (
          <div
            key={ov.id}
            onPointerDown={(e) => onOverlayPointerDown(e, "text", ov.id)}
            onClick={(e) => {
              e.stopPropagation();
              setEditingText(ov);
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 cursor-move select-none touch-none px-2 text-center font-black leading-tight whitespace-pre"
            style={{
              left: `${ov.xPct}%`,
              top: `${ov.yPct}%`,
              color: ov.color,
              fontSize: `${28 * ov.fontScale}px`,
              transform: `translate(-50%, -50%) rotate(${ov.rotation ?? 0}deg)`,
              textShadow: ov.color === "#000000" ? "0 1px 4px rgba(255,255,255,0.4)" : "0 1px 6px rgba(0,0,0,0.5)",
            }}
          >
            {ov.text}
          </div>
        ))}

        {/* 설문 오버레이 (미리보기, 드래그) */}
        {poll && (
          <div
            onPointerDown={(e) => onOverlayPointerDown(e, "poll", poll.id)}
            onClick={(e) => {
              e.stopPropagation();
              setEditingPoll(true);
            }}
            className="absolute cursor-move select-none touch-none w-[74%] max-w-[320px]"
            style={{
              left: `${poll.xPct ?? 50}%`,
              top: `${poll.yPct ?? 70}%`,
              transform: `translate(-50%, -50%) scale(${poll.scale ?? 1})`,
            }}
          >
            <PollStickerPreview poll={poll} />
          </div>
        )}
      </div>

      {/* 상단: 닫기 + 클럽 배지 + 우측 도구 */}
      <div className="relative z-10 flex items-start justify-between p-4 pt-6 pointer-events-none">
        <button
          type="button"
          onClick={onClose}
          className="pointer-events-auto w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white active:scale-90 transition-transform"
          aria-label="닫기"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 상단 우측엔 클럽 배지만 — 도구는 아래 우측 중앙으로 내림 */}
        <div className="flex flex-col items-end gap-2 pointer-events-auto">
          {clubName && (
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-500/90 text-white text-[12px] font-black">
              <Zap className="w-3 h-3 fill-white" />
              📍 {clubName}
            </span>
          )}
        </div>
      </div>

      {/* 편집 도구 (텍스트/이미지/설문) — 화면 우측 중앙 */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex flex-col items-end gap-2 pointer-events-auto">
        <ToolButton label="텍스트 추가" onClick={addText}>
          <Type className="w-5 h-5" />
        </ToolButton>
        {/* 이미지 추가 — label+input 직결 (WebView의 programmatic click 차단 우회) */}
        <label
          className="w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white active:scale-90 transition-transform cursor-pointer"
          aria-label="이미지 추가"
        >
          <ImagePlus className="w-5 h-5" />
          <input type="file" accept="image/*" className="sr-only" onChange={pickImage} />
        </label>
        <ToolButton label="설문 추가" onClick={() => setEditingPoll(true)}>
          <BarChart3 className="w-5 h-5" />
        </ToolButton>
      </div>


      {/* 하단: 캡션 + 액션 */}
      <div className="relative z-10 mt-auto bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-16 pb-6 px-4 space-y-3">
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          type="text"
          placeholder=""
          maxLength={200}
          enterKeyHint="done"
          className="w-full bg-white/10 backdrop-blur border border-white/20 rounded-full px-4 py-3 text-white text-[15px] placeholder:text-white/50 focus:outline-none focus:border-white/40"
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              // 편집 중이던 텍스트가 확정 안 됐으면 여기서 flush해 유실 방지
              const overlays =
                editingText && editingText.text.trim()
                  ? textOverlays.some((o) => o.id === editingText.id)
                    ? textOverlays.map((o) => (o.id === editingText.id ? editingText : o))
                    : [...textOverlays, editingText]
                  : textOverlays;
              onPost(caption, overlays, imageOverlays, poll);
            }}
            disabled={uploading}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-full bg-white text-black text-[15px] font-black active:scale-95 transition-transform disabled:opacity-70"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                올리는 중...
              </>
            ) : (
              <>게시하기</>
            )}
          </button>
          <button
            type="button"
            onClick={onRetake}
            disabled={uploading}
            className="flex items-center justify-center gap-1.5 px-5 py-3 rounded-full bg-white/15 backdrop-blur text-white text-[14px] font-bold active:scale-95 transition-transform disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            다시 촬영
          </button>
        </div>
      </div>

      {editingText && (
        <LiveTextEditor
          initial={editingText}
          onDone={commitText}
          onCancel={() => setEditingText(null)}
          onDelete={() => removeText(editingText.id)}
        />
      )}
      {editingPoll && (
        <LivePollEditor
          initial={poll}
          onDone={commitPoll}
          onCancel={() => setEditingPoll(false)}
          onDelete={() => {
            setPoll(null);
            setEditingPoll(false);
          }}
        />
      )}
    </div>,
    document.body
  );
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white active:scale-90 transition-transform"
      aria-label={label}
    >
      {children}
    </button>
  );
}

/** 편집 화면용 설문 미리보기 스티커 (투표 불가, 표시만) */
function PollStickerPreview({ poll }: { poll: ShotPoll }) {
  return (
    <div className="rounded-2xl bg-black/55 backdrop-blur border border-white/15 p-3 space-y-2 pointer-events-none">
      <div className="text-white text-[14px] font-black text-center leading-tight break-words">
        {poll.question || "질문"}
      </div>
      <div className="space-y-1.5">
        {poll.options.map((o) => (
          <div key={o.id} className="rounded-full bg-white/15 text-white text-[13px] font-bold text-center py-2 px-3 truncate">
            {o.text || "선택지"}
          </div>
        ))}
      </div>
    </div>
  );
}
