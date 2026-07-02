"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Check, ChevronRight, ImagePlus, Loader2, MapPin, X, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { uploadChatMedia } from "@/lib/utils/uploadChatMedia";
import { ROOM_LABEL, type VerifiableArea } from "@/lib/chat/areas";
import { fetchNearestClubs, type NearestClub } from "@/lib/clubs/nearestClubs";
import type { ChatShot } from "@/types/database";
import { CameraCaptureView } from "./CameraCaptureView";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 인증된 area — 없으면(null) 일반 SHOT만, 있으면 지역/LIVE 옵션 열림 */
  area?: VerifiableArea | null;
  /** 로그인한 유저 (null이면 게시 자체 불가, 로그인 유도) */
  userId: string;
  userProfile?: {
    display_name: string | null;
    profile_image: string | null;
  };
  /** 업로드 성공 후 옵티미스틱 prepend 트리거 */
  onPosted?: (shot: ChatShot) => void;
  /** 클럽 사전 지정 — 클럽 페이지의 빈 CTA에서 진입 시 자동 픽 (LIVE 모드로 시작) */
  presetClub?: { id: string; name: string } | null;
  /** 지역 인증 유도 콜백 (미인증 상태에서 LIVE 선택 시) */
  onRequestAreaVerify?: () => void;
}

const MAX_CAPTION = 200;

/**
 * SHOT 캡처/업로드 시트 (Migration 404 이후)
 *   - 일반 SHOT: area/club 없이 누구나 게시
 *   - 지역 SHOT: area 인증자만
 *   - LIVE: area 인증자 + 클럽 지정
 */
export function ShotCaptureSheet({
  open,
  onOpenChange,
  area,
  userId,
  userProfile,
  onPosted,
  presetClub = null,
  onRequestAreaVerify,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  // 모드: general (기본) / live (클럽 지정)
  const [mode, setMode] = useState<"general" | "live">(presetClub ? "live" : "general");
  const [selectedClub, setSelectedClub] = useState<{ id: string; name: string } | null>(presetClub);
  const [clubSheetOpen, setClubSheetOpen] = useState(false);
  const [nearestClubs, setNearestClubs] = useState<NearestClub[] | null>(null);
  const [clubsLoading, setClubsLoading] = useState(false);

  const isVerified = !!area;

  // 초기화
  useEffect(() => {
    if (!open) return;
    setMode(presetClub ? "live" : "general");
    setSelectedClub(presetClub);
  }, [open, presetClub]);

  // LIVE 모드로 전환 시 GPS로 클럽 로드
  useEffect(() => {
    if (!open || mode !== "live" || !area) return;
    if (presetClub) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setClubsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const clubs = await fetchNearestClubs(
          area,
          pos.coords.latitude,
          pos.coords.longitude,
          5,
          1.5
        );
        setNearestClubs(clubs);
        setClubsLoading(false);
      },
      (err) => {
        console.warn("[ShotCaptureSheet] geo error", err);
        setNearestClubs([]);
        setClubsLoading(false);
      },
      { timeout: 8000 }
    );
  }, [open, mode, area, presetClub]);

  function canUseLiveCamera(): boolean {
    if (typeof window === "undefined") return false;
    if (!window.isSecureContext) return false;
    return !!navigator.mediaDevices?.getUserMedia;
  }

  function resetState() {
    setFile(null);
    setPreviewUrl(null);
    setCaption("");
    setUploading(false);
    setMode(presetClub ? "live" : "general");
    setSelectedClub(presetClub);
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    e.target.value = "";
  }

  function handleModeSelect(next: "general" | "live") {
    if (next === "live" && !isVerified) {
      toast.error("지역 인증 후 LIVE를 올릴 수 있어요");
      onRequestAreaVerify?.();
      return;
    }
    setMode(next);
    if (next === "live" && !selectedClub && !presetClub) {
      setClubSheetOpen(true);
    }
  }

  async function handlePost() {
    if (!file || uploading) return;
    if (mode === "live" && !selectedClub) {
      toast.error("클럽을 선택해주세요");
      setClubSheetOpen(true);
      return;
    }
    setUploading(true);

    const media = await uploadChatMedia(file, userId);
    if (!media) {
      setUploading(false);
      return;
    }

    // 게시 페이로드 결정:
    //   general → area/club 둘 다 null
    //   live    → area + club_id 필수
    const payload: Record<string, unknown> = {
      author_id: userId,
      media_type: media.type,
      media_url: media.url,
      width: media.width ?? null,
      height: media.height ?? null,
      duration: media.duration ?? null,
      caption: caption.trim() || null,
      area: mode === "live" ? area : null,
      club_id: mode === "live" ? selectedClub?.id ?? null : null,
    };

    const supabase = createClient();
    const { data, error } = await supabase
      .from("chat_shots")
      .insert(payload)
      .select(
        `id, area, author_id, club_id, media_type, media_url, width, height, duration, caption, created_at, expires_at`
      )
      .single();

    if (error || !data) {
      console.error("[ShotCaptureSheet] insert error", error);
      const msg = error?.message ?? "";
      if (msg.includes("LIVE_DAILY_LIMIT")) {
        toast.error("하루에 LIVE 7개까지 올릴 수 있어요");
      } else if (msg.includes("LIVE_AREA_MISMATCH")) {
        toast.error("인증된 지역과 클럽 지역이 달라요");
      } else if (msg.includes("LIVE_INVALID_CLUB")) {
        toast.error("선택한 클럽을 찾을 수 없어요");
      } else if (
        error?.code === "42501" ||
        msg.includes("row-level security")
      ) {
        toast.error(
          mode === "live"
            ? "지역 인증이 만료되었어요. 다시 인증해주세요"
            : "로그인이 필요해요"
        );
      } else if (error?.code === "42P01" || error?.code === "42703") {
        toast.error("DB 마이그레이션 미적용 (341/404)");
      } else {
        toast.error(`업로드 실패: ${msg || "알 수 없는 오류"}`);
      }
      setUploading(false);
      return;
    }

    const label =
      mode === "live" && selectedClub
        ? `${selectedClub.name} LIVE 올렸어요`
        : "SHOT 올렸어요";
    toast.success(`${label} (9시간 후 사라져요)`);
    // 초상권 검토 안내 (인스타 스타일 짧은 리마인더)
    setTimeout(() => {
      toast.message(
        "⚠️ 본인 외 다른 사람 얼굴이 식별 가능하게 찍혔다면 직접 삭제해주세요"
      );
    }, 1200);

    onPosted?.({
      ...data,
      area: (data.area ?? null) as VerifiableArea | null,
      club_id: data.club_id ?? null,
      media_type: data.media_type as "image" | "video",
      like_count: 0,
      comment_count: 0,
      author: userProfile
        ? {
            id: userId,
            display_name: userProfile.display_name,
            profile_image: userProfile.profile_image,
          }
        : undefined,
    });
    resetState();
    onOpenChange(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) resetState();
        onOpenChange(v);
      }}
    >
      <SheetContent
        side="bottom"
        className="bg-[#0B0A11] border-neutral-800 rounded-t-3xl p-0 pb-6 max-h-[90vh] flex flex-col"
      >
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-neutral-800 shrink-0">
          <SheetTitle className="text-white text-[16px] text-left flex items-center gap-2">
            🥃 SHOT 올리기
            <span className="text-[11px] font-normal text-neutral-500">
              · 9시간 후 사라져요
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* 모드 선택 (일반 vs LIVE) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleModeSelect("general")}
              className={`p-3 rounded-2xl border-2 text-left transition-colors ${
                mode === "general"
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-neutral-800 bg-[#1C1C1E]"
              }`}
            >
              <div className="text-[12px] font-black text-white">일반 SHOT</div>
              <div className="text-[10px] text-neutral-500 mt-0.5">
                누구나 · 태그 없이
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleModeSelect("live")}
              className={`p-3 rounded-2xl border-2 text-left transition-colors ${
                mode === "live"
                  ? "border-red-500 bg-red-500/10"
                  : isVerified
                    ? "border-neutral-800 bg-[#1C1C1E]"
                    : "border-neutral-900 bg-neutral-900/40 opacity-60"
              }`}
            >
              <div className="text-[12px] font-black text-white flex items-center gap-1">
                <Zap className="w-3 h-3 fill-red-400 text-red-400" />
                LIVE
              </div>
              <div className="text-[10px] text-neutral-500 mt-0.5">
                {isVerified ? "클럽 지정 · 하루 7개" : "지역 인증 필요"}
              </div>
            </button>
          </div>

          {/* LIVE 클럽 선택 CTA */}
          {mode === "live" && (
            <button
              type="button"
              onClick={() => setClubSheetOpen(true)}
              disabled={!!presetClub}
              className="w-full flex items-center gap-2 p-3 rounded-2xl bg-[#1C1C1E] border border-neutral-800 text-left disabled:opacity-80"
            >
              <MapPin className="w-4 h-4 text-red-400 shrink-0" />
              <div className="flex-1 min-w-0">
                {selectedClub ? (
                  <>
                    <div className="text-[13px] font-black text-white truncate">
                      {selectedClub.name}
                    </div>
                    <div className="text-[10px] text-neutral-500">
                      {presetClub ? "이 클럽에 게시" : "탭해서 변경"}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[13px] font-black text-white">
                      클럽 선택하기
                    </div>
                    <div className="text-[10px] text-neutral-500">
                      GPS로 주변 클럽 추천
                    </div>
                  </>
                )}
              </div>
              {!presetClub && (
                <ChevronRight className="w-4 h-4 text-neutral-600" />
              )}
            </button>
          )}

          {/* 미리보기 또는 파일 선택 */}
          {previewUrl && file ? (
            <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-neutral-950">
              {file.type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="미리보기"
                  className="w-full h-full object-cover"
                />
              ) : (
                <video
                  src={previewUrl}
                  className="w-full h-full object-cover"
                  controls
                  playsInline
                />
              )}
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setPreviewUrl(null);
                }}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 flex items-center justify-center text-white"
                aria-label="삭제"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (canUseLiveCamera()) {
                    setCameraOpen(true);
                  } else {
                    cameraInputRef.current?.click();
                  }
                }}
                className="flex flex-col items-center justify-center gap-2 aspect-square rounded-2xl border-2 border-dashed border-neutral-700 bg-[#1C1C1E] text-neutral-300 hover:border-amber-500 hover:text-amber-400 transition-colors"
              >
                <Camera className="w-8 h-8" />
                <span className="text-[13px] font-bold">카메라</span>
                <span className="text-[10px] text-neutral-500">
                  {canUseLiveCamera() ? "탭=사진 · 꾹=영상" : "사진 촬영"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 aspect-square rounded-2xl border-2 border-dashed border-neutral-700 bg-[#1C1C1E] text-neutral-300 hover:border-amber-500 hover:text-amber-400 transition-colors"
              >
                <ImagePlus className="w-8 h-8" />
                <span className="text-[13px] font-bold">갤러리</span>
              </button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*,video/*"
                capture="environment"
                className="sr-only"
                onChange={pickFile}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="sr-only"
                onChange={pickFile}
              />
            </div>
          )}

          {/* 작성자 + 캡션 */}
          {file && (
            <>
              <div className="flex items-center gap-2">
                <div className="relative w-7 h-7 rounded-full overflow-hidden bg-neutral-800 shrink-0">
                  {userProfile?.profile_image ? (
                    <Image
                      src={userProfile.profile_image}
                      alt=""
                      fill
                      sizes="28px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/50 text-[11px] font-black">
                      {(userProfile?.display_name ?? "나").charAt(0)}
                    </div>
                  )}
                </div>
                <div className="text-[13px] text-neutral-300 font-bold">
                  {userProfile?.display_name ?? "나"}
                </div>
                {mode === "live" && area ? (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300 text-[10px] font-black">
                    <Zap className="w-2.5 h-2.5 fill-red-300" />
                    LIVE · {ROOM_LABEL[area]}
                  </span>
                ) : null}
              </div>
              <div className="space-y-1">
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="한 줄 캡션 (선택)"
                  rows={2}
                  maxLength={MAX_CAPTION}
                  className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-2xl px-3 py-2 text-white text-[14px] placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600 resize-none"
                />
                <div className="text-right text-[10px] text-neutral-600">
                  {caption.length}/{MAX_CAPTION}
                </div>
              </div>
            </>
          )}
        </div>

        <CameraCaptureView
          open={cameraOpen}
          onClose={() => setCameraOpen(false)}
          onCapture={(captured) => {
            setFile(captured);
            setPreviewUrl(URL.createObjectURL(captured));
            setCameraOpen(false);
          }}
        />

        {/* 액션 버튼 */}
        <div className="px-4 pt-2 border-t border-neutral-800 shrink-0">
          <button
            onClick={handlePost}
            disabled={!file || uploading || (mode === "live" && !selectedClub)}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-full text-[14px] font-black transition-colors ${
              mode === "live"
                ? "bg-red-500 text-white"
                : "bg-amber-500 text-black"
            } disabled:bg-neutral-800 disabled:text-neutral-600`}
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                올리는 중...
              </>
            ) : mode === "live" ? (
              <>
                <Zap className="w-4 h-4 fill-white" />
                LIVE 올리기
              </>
            ) : (
              <>🥃 SHOT 올리기</>
            )}
          </button>
        </div>
      </SheetContent>

      {/* 클럽 선택 서브 시트 */}
      <ClubPickerSheet
        open={clubSheetOpen}
        onOpenChange={setClubSheetOpen}
        area={area ?? null}
        clubs={nearestClubs}
        loading={clubsLoading}
        selectedId={selectedClub?.id ?? null}
        onSelect={(c) => {
          setSelectedClub(c);
          setClubSheetOpen(false);
        }}
      />
    </Sheet>
  );
}

function ClubPickerSheet({
  open,
  onOpenChange,
  area,
  clubs,
  loading,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  area: VerifiableArea | null;
  clubs: NearestClub[] | null;
  loading: boolean;
  selectedId: string | null;
  onSelect: (c: { id: string; name: string }) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-[#0B0A11] border-neutral-800 rounded-t-3xl p-0 pb-6 max-h-[80vh] flex flex-col"
      >
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-neutral-800 shrink-0">
          <SheetTitle className="text-white text-[16px] text-left flex items-center gap-2">
            <MapPin className="w-4 h-4 text-red-400" />
            지금 있는 클럽 선택
            {area && (
              <span className="text-[11px] font-normal text-neutral-500">
                · {ROOM_LABEL[area]} 인증됨
              </span>
            )}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="p-6 text-center text-neutral-500 text-[13px]">
              주변 클럽 찾는 중...
            </div>
          ) : !clubs || clubs.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-[13px]">
              1.5km 반경에 등록된 클럽이 없어요
            </div>
          ) : (
            <ul className="divide-y divide-neutral-900">
              {clubs.map((c) => {
                const selected = selectedId === c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onSelect({ id: c.id, name: c.name })}
                      className="w-full flex items-center gap-3 px-3 py-3 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-black text-white truncate">
                          {c.name}
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          {c.distance_km.toFixed(2)}km 거리
                        </div>
                      </div>
                      {selected && (
                        <Check className="w-5 h-5 text-red-400 shrink-0" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
