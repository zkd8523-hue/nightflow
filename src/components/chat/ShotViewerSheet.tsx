"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  Flag,
  Heart,
  MapPin,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { ROOM_LABEL } from "@/lib/chat/areas";
import type { ChatShot } from "@/types/database";

interface Props {
  shots: ChatShot[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
  currentUserId?: string;
  /** 좋아요 토글 — useChatShots가 옵티미스틱 처리 */
  onToggleLike?: (shotId: string) => void;
}

/**
 * 인스타 스토리식 SHOT 뷰어
 * - 좌우 탭/버튼으로 이전/다음 이동
 * - 9시간 남은 시간 표시
 */
export function ShotViewerSheet({
  shots,
  index,
  onIndexChange,
  currentUserId,
  onToggleLike,
}: Props) {
  const open = index !== null;
  const shot = index !== null ? shots[index] : null;

  // shots 길이가 변해서 현재 index가 사라진 경우 닫기
  useEffect(() => {
    if (index !== null && index >= shots.length) {
      onIndexChange(null);
    }
  }, [index, shots.length, onIndexChange]);

  function close() {
    onIndexChange(null);
  }

  function prev() {
    if (index === null) return;
    if (index > 0) onIndexChange(index - 1);
  }

  function next() {
    if (index === null) return;
    if (index < shots.length - 1) onIndexChange(index + 1);
    else close();
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && close()}>
      <SheetContent
        side="bottom"
        className="bg-black border-none p-0 h-[100dvh] max-h-[100dvh] flex flex-col"
      >
        {shot ? (
          <ShotViewerContent
            shot={shot}
            index={index!}
            total={shots.length}
            currentUserId={currentUserId}
            onPrev={prev}
            onNext={next}
            onClose={close}
            onToggleLike={onToggleLike}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ShotViewerContent({
  shot,
  index,
  total,
  currentUserId,
  onPrev,
  onNext,
  onClose,
  onToggleLike,
}: {
  shot: ChatShot;
  index: number;
  total: number;
  currentUserId?: string;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onToggleLike?: (shotId: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const isMine = shot.author_id === currentUserId;
  const remaining = remainingTimeText(shot.expires_at);

  async function handleDelete() {
    if (!confirm("이 SHOT을 삭제할까요?")) return;
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
      toast.error("로그인 후 신고할 수 있어요");
      return;
    }
    const reasonInput = prompt(
      "신고 사유를 적어주세요 (스팸/욕설/광고/허위위치/기타 등)"
    );
    if (!reasonInput || reasonInput.trim().length < 2) return;
    const supabase = createClient();
    const { error } = await supabase.from("chat_shot_reports").insert({
      shot_id: shot.id,
      reporter_id: currentUserId,
      reason: "other",
      message: reasonInput.trim(),
    });
    if (error) {
      console.error("[ShotViewerSheet] report error", error);
      if (error.code === "23505") {
        toast.error("이미 신고하신 SHOT입니다");
      } else if (error.code === "42P01" || error.code === "42703") {
        toast.error("신고 마이그레이션 미적용 (322)");
      } else {
        toast.error("신고 처리에 실패했습니다");
      }
      return;
    }
    toast.success("신고가 접수되었습니다");
  }

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* 상단 인디케이터 */}
      <div className="absolute top-0 inset-x-0 z-10 px-3 pt-2 pb-3 bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex gap-1 mb-2">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden"
            >
              <div
                className="h-full bg-white"
                style={{ width: i === index ? "100%" : i < index ? "100%" : "0%" }}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
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
                <div className="w-full h-full flex items-center justify-center text-white/50 text-[12px] font-black">
                  {(shot.author?.display_name ?? "익").charAt(0)}
                </div>
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-white text-[13px] font-bold truncate">
                  {shot.author?.display_name ?? "익명"}
                </span>
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-300 text-[9px] font-bold">
                  <MapPin className="w-2.5 h-2.5" />
                  {ROOM_LABEL[shot.area]}
                </span>
              </div>
              <span className="text-[10px] text-white/60">{remaining}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isMine ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/10"
                aria-label="삭제"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleReport}
                className="w-9 h-9 rounded-full flex items-center justify-center text-amber-300 hover:bg-white/10"
                aria-label="신고"
              >
                <Flag className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/10"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 미디어 */}
      <div className="relative flex-1 flex items-center justify-center">
        {shot.media_type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shot.media_url}
            alt=""
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <video
            src={shot.media_url}
            className="max-w-full max-h-full object-contain"
            autoPlay
            controls
            playsInline
          />
        )}

        {/* 좌우 탭 영역 */}
        <button
          type="button"
          onClick={onPrev}
          disabled={index === 0}
          className="absolute left-0 top-0 bottom-0 w-1/3 flex items-center justify-start pl-2 text-white/0 hover:text-white/40 disabled:cursor-default"
          aria-label="이전"
        >
          {index > 0 && <ChevronLeft className="w-6 h-6" />}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="absolute right-0 top-0 bottom-0 w-1/3 flex items-center justify-end pr-2 text-white/0 hover:text-white/40"
          aria-label="다음"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* 캡션 + 좋아요 (하단 오버레이) */}
      <div className="absolute bottom-0 inset-x-0 p-4 pb-8 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-end justify-between gap-3 pointer-events-none">
        <div className="flex-1 min-w-0">
          {shot.caption && (
            <p className="text-white text-[14px] leading-relaxed whitespace-pre-wrap">
              {shot.caption}
            </p>
          )}
        </div>
        {!isMine && onToggleLike && currentUserId && (
          <button
            type="button"
            onClick={() => onToggleLike(shot.id)}
            className="pointer-events-auto shrink-0 flex flex-col items-center gap-0.5 active:scale-90 transition-transform"
            aria-label={shot.liked_by_me ? "좋아요 취소" : "좋아요"}
          >
            <Heart
              className={`w-8 h-8 transition-colors ${
                shot.liked_by_me
                  ? "fill-red-500 text-red-500"
                  : "text-white drop-shadow-lg"
              }`}
            />
            {shot.like_count > 0 && (
              <span className="text-white text-[11px] font-black drop-shadow-lg">
                {shot.like_count}
              </span>
            )}
          </button>
        )}
        {isMine && shot.like_count > 0 && (
          <div className="pointer-events-none shrink-0 flex flex-col items-center gap-0.5">
            <Heart className="w-7 h-7 fill-red-500 text-red-500" />
            <span className="text-white text-[11px] font-black drop-shadow-lg">
              {shot.like_count}
            </span>
          </div>
        )}
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
