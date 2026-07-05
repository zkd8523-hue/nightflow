"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Flag,
  Heart,
  MapPin,
  MessageCircle,
  MoreVertical,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { ROOM_LABEL } from "@/lib/chat/areas";
import type { ChatShot } from "@/types/database";
import { ShotCommentSheet } from "./ShotCommentSheet";

interface Props {
  shots: ChatShot[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
  currentUserId?: string;
  onToggleLike?: (shotId: string) => void;
  onRequireLogin?: () => void;
}

const SWIPE_THRESHOLD = 80; // 세로 스와이프 임계값(px)
const IMAGE_AUTO_MS = 5000; // 이미지 SHOT 자동 다음 (5초)

export function ShotViewerSheet({
  shots,
  index,
  onIndexChange,
  currentUserId,
  onToggleLike,
  onRequireLogin,
}: Props) {
  const open = index !== null;
  const shot = index !== null ? shots[index] : null;
  const [commentOpen, setCommentOpen] = useState(false);

  useEffect(() => {
    if (index !== null && index >= shots.length) {
      onIndexChange(null);
    }
  }, [index, shots.length, onIndexChange]);

  // 뒤로가기로 SHOT 뷰어 닫기 (홈 이탈 방지)
  // 뷰어 열릴 때 history entry 하나 추가 → popstate 발생하면 자동으로 뷰어만 닫힘
  const pushedRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    window.history.pushState({ shotViewer: true }, "");
    pushedRef.current = true;
    function onPop() {
      pushedRef.current = false;
      onIndexChange(null);
    }
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // X 버튼 등으로 정상 종료 시 우리가 push한 dummy entry 제거
      if (pushedRef.current) {
        pushedRef.current = false;
        window.history.back();
      }
    };
  }, [open, onIndexChange]);

  function close() {
    onIndexChange(null);
  }
  function prev() {
    if (index === null) return;
    if (index > 0) onIndexChange(index - 1);
    // 첫 SHOT에서 더 못 감 — 닫지 않음
  }
  function next() {
    if (index === null) return;
    if (index < shots.length - 1) onIndexChange(index + 1);
    // 마지막 SHOT에서 더 못 감 — 닫지 않음 (사용자가 X로 명시적으로 닫게)
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && close()}>
        <SheetContent
          side="bottom"
          className="bg-black border-none p-0 h-[100dvh] max-h-[100dvh] flex flex-col"
        >
          {shot ? (
            <ShotViewerContent
              shot={shot}
              currentUserId={currentUserId}
              onPrev={prev}
              onNext={next}
              onClose={close}
              onToggleLike={onToggleLike}
              onOpenComments={() => setCommentOpen(true)}
              onRequireLogin={onRequireLogin}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <ShotCommentSheet
        open={commentOpen}
        onOpenChange={setCommentOpen}
        shotId={shot?.id ?? null}
        currentUserId={currentUserId}
        onRequireLogin={onRequireLogin}
      />
    </>
  );
}

function ShotViewerContent({
  shot,
  currentUserId,
  onPrev,
  onNext,
  onClose,
  onToggleLike,
  onOpenComments,
  onRequireLogin,
}: {
  shot: ChatShot;
  currentUserId?: string;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onToggleLike?: (shotId: string) => void;
  onOpenComments: () => void;
  onRequireLogin?: () => void;
}) {
  const router = useRouter();
  const isMine = shot.author_id === currentUserId;
  const remaining = remainingTimeText(shot.expires_at);
  const [deleting, setDeleting] = useState(false);

  // 세로 swipe 추적
  const startYRef = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  // 자동 진행 게이지 (인스타 스토리 패턴) — 이미지 5초, 동영상은 video duration
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    setProgress(0);
    if (shot.media_type === "video") {
      // video는 ontimeupdate로 별도 처리
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min((elapsed / IMAGE_AUTO_MS) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(id);
        onNext();
      }
    }, 50);
    return () => clearInterval(id);
  }, [shot.id, shot.media_type, onNext]);

  function handleVideoTimeUpdate() {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const pct = (v.currentTime / v.duration) * 100;
    setProgress(pct);
  }
  function handleVideoEnded() {
    onNext();
  }

  // 키보드 (위/아래/Esc)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowUp" || e.key === "ArrowRight") {
        e.preventDefault();
        onNext();
      } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
        e.preventDefault();
        onPrev();
      } else if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, onPrev, onClose]);

  // 마우스 휠 (throttle)
  const wheelLockRef = useRef(false);
  function handleWheel(e: React.WheelEvent) {
    if (wheelLockRef.current) return;
    if (Math.abs(e.deltaY) < 30) return;
    wheelLockRef.current = true;
    setTimeout(() => {
      wheelLockRef.current = false;
    }, 400);
    if (e.deltaY > 0) onNext();
    else onPrev();
  }

  function handlePointerDown(e: React.PointerEvent) {
    startYRef.current = e.clientY;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (startYRef.current === null) return;
    setDragY(e.clientY - startYRef.current);
  }
  function handlePointerUp(e: React.PointerEvent) {
    if (startYRef.current === null) return;
    const delta = e.clientY - startYRef.current;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    startYRef.current = null;
    setDragY(0);
    if (delta < -SWIPE_THRESHOLD) onNext();
    else if (delta > SWIPE_THRESHOLD) onPrev();
  }

  async function handleDelete() {
    if (!confirm("이 LIVE를 삭제할까요?")) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("chat_shots")
      .delete()
      .eq("id", shot.id);
    if (error) {
      toast.error("삭제 실패");
      setDeleting(false);
      return;
    }
    toast.success("삭제되었습니다");
    onClose();
  }

  async function handleReport() {
    if (!currentUserId) {
      onRequireLogin?.();
      return;
    }
    const reason = prompt("신고 사유를 적어주세요 (스팸/욕설/광고/허위위치/기타)");
    if (!reason || reason.trim().length < 2) return;
    const supabase = createClient();
    const { error } = await supabase.from("chat_shot_reports").insert({
      shot_id: shot.id,
      reporter_id: currentUserId,
      reason: "other",
      message: reason.trim(),
    });
    if (error) {
      if (error.code === "23505") toast.error("이미 신고하신 LIVE입니다");
      else if (error.code === "42P01" || error.code === "42703")
        toast.error("신고 마이그레이션 미적용 (322)");
      else toast.error("신고 처리에 실패했습니다");
      return;
    }
    toast.success("신고가 접수되었습니다");
  }

  return (
    <div
      className="relative w-full h-full overflow-hidden touch-none select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      style={{ transform: `translateY(${dragY * 0.3}px)`, transition: dragY === 0 ? "transform 0.2s" : "none" }}
    >
      {/* 상단 — 인스타 스토리식 게이지 + 작성자 + 메뉴 */}
      <div className="absolute top-0 inset-x-0 z-20 pt-2 pb-3 px-3 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
        {/* 진행 게이지 (이미지: 5초, 동영상: video duration) */}
        <div className="h-0.5 rounded-full bg-white/30 overflow-hidden mb-2.5">
          <div
            className="h-full bg-white"
            style={{ width: `${progress}%`, transition: "width 0.1s linear" }}
          />
        </div>

        {/* 작성자 + 메뉴 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative w-8 h-8 rounded-full overflow-hidden bg-neutral-800 shrink-0 ring-2 ring-amber-500">
              {shot.author?.profile_image ? (
                <Image
                  src={shot.author.profile_image}
                  alt=""
                  fill
                  sizes="32px"
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/60 text-[12px] font-black">
                  {(shot.author?.display_name ?? "익").charAt(0)}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-white text-[13px] font-black truncate drop-shadow-lg">
                {shot.author?.display_name ?? "익명"}
              </span>
              {shot.club_id ? (
                <button
                  type="button"
                  onClick={() => router.push(`/clubs/${shot.club_id}`)}
                  className="pointer-events-auto inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-500/25 text-red-200 text-[10px] font-black active:scale-95 transition"
                >
                  <Zap className="w-2.5 h-2.5 fill-red-200" />
                  LIVE
                </button>
              ) : shot.area ? (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-300 text-[10px] font-bold">
                  <MapPin className="w-2.5 h-2.5" />
                  {ROOM_LABEL[shot.area]}
                </span>
              ) : null}
              <span className="text-[10px] text-white/60 drop-shadow-lg shrink-0">
                {remaining}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="pointer-events-auto w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/10"
                  aria-label="더보기"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-[#1C1C1E] border-neutral-800 text-white"
              >
                {isMine ? (
                  <DropdownMenuItem
                    onClick={handleDelete}
                    disabled={deleting}
                    className="cursor-pointer text-red-400 focus:bg-neutral-800 focus:text-red-400"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    삭제
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={handleReport}
                    className="cursor-pointer text-amber-400 focus:bg-neutral-800 focus:text-amber-400"
                  >
                    <Flag className="w-4 h-4 mr-2" />
                    신고
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              onClick={onClose}
              className="pointer-events-auto w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/10"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 미디어 */}
      <div className="relative w-full h-full flex items-center justify-center bg-black">
        {shot.media_type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shot.media_url}
            alt=""
            className="max-w-full max-h-full object-contain"
            draggable={false}
          />
        ) : (
          <video
            ref={videoRef}
            src={shot.media_url}
            className="max-w-full max-h-full object-contain"
            autoPlay
            playsInline
            controls
            onTimeUpdate={handleVideoTimeUpdate}
            onEnded={handleVideoEnded}
          />
        )}
      </div>

      {/* 우측 액션 컬럼 (릴스 패턴) — 화면 중앙 우측, 컴팩트 */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-4 pointer-events-none">
        {/* 좋아요 */}
        <button
          type="button"
          onClick={() => {
            if (!currentUserId) {
              onRequireLogin?.();
              return;
            }
            if (isMine) {
              toast.error("본인 LIVE엔 좋아요할 수 없어요");
              return;
            }
            onToggleLike?.(shot.id);
          }}
          className="pointer-events-auto flex flex-col items-center gap-0.5 active:scale-90 transition-transform"
          aria-label={shot.liked_by_me ? "좋아요 취소" : "좋아요"}
        >
          <Heart
            className={`w-6 h-6 drop-shadow-lg ${
              shot.liked_by_me ? "fill-red-500 text-red-500" : "text-white"
            }`}
          />
          {shot.like_count > 0 && (
            <span className="text-white text-[10px] font-black drop-shadow-lg">
              {shot.like_count}
            </span>
          )}
        </button>

        {/* 댓글 */}
        <button
          type="button"
          onClick={onOpenComments}
          className="pointer-events-auto flex flex-col items-center gap-0.5 active:scale-90 transition-transform"
          aria-label="댓글"
        >
          <MessageCircle className="w-6 h-6 text-white drop-shadow-lg" />
          {shot.comment_count > 0 && (
            <span className="text-white text-[10px] font-black drop-shadow-lg">
              {shot.comment_count}
            </span>
          )}
        </button>
      </div>

      {/* 좌하단: 캡션만 */}
      {shot.caption && (
        <div className="absolute bottom-0 inset-x-0 z-10 p-4 pb-8 pr-16 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none">
          <p className="text-white text-[14px] leading-relaxed whitespace-pre-wrap drop-shadow-lg">
            {shot.caption}
          </p>
        </div>
      )}

      {/* 하단 swipe 힌트 */}
      <div className="absolute bottom-1 inset-x-0 z-10 text-center pointer-events-none">
        <span className="text-white/30 text-[10px]">위로 밀어 다음 LIVE</span>
      </div>
    </div>
  );
}

function remainingTimeText(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "만료됨";
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분 후 사라짐`;
  return `${minutes}분 후 사라짐`;
}
