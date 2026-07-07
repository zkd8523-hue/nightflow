"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Check, ChevronRight, Loader2, MapPin, X, Zap } from "lucide-react";
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
import { getCurrentCoords } from "@/lib/geo/currentCoords";
import type { ChatShot } from "@/types/database";
import { CameraCaptureView } from "./CameraCaptureView";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 인증된 area — 없으면(null) 클럽 지정 불가, 일반 LIVE만 게시 */
  area?: VerifiableArea | null;
  /** 로그인한 유저 (null이면 게시 자체 불가) */
  userId: string;
  userProfile?: {
    display_name: string | null;
    profile_image: string | null;
  };
  /** 업로드 성공 후 옵티미스틱 prepend 트리거 */
  onPosted?: (shot: ChatShot) => void;
  /** 클럽 사전 지정 — 클럽 페이지의 빈 CTA에서 진입 시 자동 픽 */
  presetClub?: { id: string; name: string } | null;
  /** 지역 인증 유도 콜백 (미인증자에게 배지 클릭 시) */
  onRequestAreaVerify?: () => void;
}

const MAX_CAPTION = 200;

/**
 * LIVE 캡처/업로드 시트 (Migration 413 이후)
 *   플로우: 시트 열림 → (인증자) 클럽 픽 시트 자동 오픈 → 카메라 → 캡션 → 게시
 *
 *   - 클럽 지정 시: club_id + area 있는 LIVE → 조건 충족하면 스탬프 1개
 *   - 클럽 미지정 시: area/club 둘 다 null → 일반 게시 (스탬프 X)
 *   - 미인증자: 클럽 픽 불가, 자동으로 일반 게시 모드
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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const [selectedClub, setSelectedClub] = useState<{ id: string; name: string } | null>(presetClub);
  const [clubSheetOpen, setClubSheetOpen] = useState(false);
  const [nearestClubs, setNearestClubs] = useState<NearestClub[] | null>(null);
  const [clubsLoading, setClubsLoading] = useState(false);

  const isVerified = !!area;

  // 시트 초기화 + 인증자면 클럽 픽 시트 자동 오픈 (presetClub 있으면 skip)
  useEffect(() => {
    if (!open) return;
    setSelectedClub(presetClub);
    if (!presetClub && isVerified) {
      setClubSheetOpen(true);
    }
  }, [open, presetClub, isVerified]);

  // 인증자면 GPS로 주변 클럽 로드
  useEffect(() => {
    if (!open || !area || presetClub) return;
    let cancelled = false;
    setClubsLoading(true);
    getCurrentCoords()
      .then(async (c) => {
        const clubs = await fetchNearestClubs(area, c.latitude, c.longitude, 5, 1.5);
        if (cancelled) return;
        setNearestClubs(clubs);
        setClubsLoading(false);
      })
      .catch((err) => {
        console.warn("[ShotCaptureSheet] geo error", err);
        if (cancelled) return;
        setNearestClubs([]);
        setClubsLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, area, presetClub]);

  // 앱(Capacitor)이면 네이티브 카메라(camera-preview)를 쓰므로 항상 인앱 카메라 사용.
  // Capacitor.isNativePlatform()은 동기 호출이지만 dynamic import라 초기값 판별을 effect로.
  const [isNativeApp, setIsNativeApp] = useState(false);
  useEffect(() => {
    let m = true;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (m) setIsNativeApp(Capacitor.isNativePlatform());
      } catch {
        /* 웹 */
      }
    })();
    return () => {
      m = false;
    };
  }, []);

  function canUseLiveCamera(): boolean {
    // 앱: 네이티브 카메라 항상 가능
    if (isNativeApp) return true;
    // 웹: getUserMedia + HTTPS 필요
    if (typeof window === "undefined") return false;
    if (!window.isSecureContext) return false;
    return !!navigator.mediaDevices?.getUserMedia;
  }

  function resetState() {
    setFile(null);
    setPreviewUrl(null);
    setCaption("");
    setUploading(false);
    setSelectedClub(presetClub);
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    e.target.value = "";
  }

  async function handlePost() {
    if (!file || uploading) return;
    setUploading(true);

    const media = await uploadChatMedia(file, userId);
    if (!media) {
      setUploading(false);
      return;
    }

    // 페이로드 결정:
    //   클럽 지정 → area + club_id 필수 (LIVE, 스탬프 대상)
    //   클럽 미지정 → area/club 모두 null (일반, 스탬프 X)
    const isLive = !!selectedClub;
    const payload: Record<string, unknown> = {
      author_id: userId,
      media_type: media.type,
      media_url: media.url,
      width: media.width ?? null,
      height: media.height ?? null,
      duration: media.duration ?? null,
      caption: caption.trim() || null,
      area: isLive ? area : null,
      club_id: isLive ? selectedClub?.id ?? null : null,
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
      if (msg.includes("LIVE_AREA_MISMATCH")) {
        toast.error("인증된 지역과 클럽 지역이 달라요");
      } else if (msg.includes("LIVE_INVALID_CLUB")) {
        toast.error("선택한 클럽을 찾을 수 없어요");
      } else if (
        error?.code === "42501" ||
        msg.includes("row-level security")
      ) {
        toast.error(
          isLive
            ? "지역 인증이 만료되었어요. 다시 인증해주세요"
            : "로그인이 필요해요"
        );
      } else if (error?.code === "42P01" || error?.code === "42703") {
        toast.error("DB 마이그레이션 미적용 (413)");
      } else {
        toast.error(`업로드 실패: ${msg || "알 수 없는 오류"}`);
      }
      setUploading(false);
      return;
    }

    // 스탬프 적립 확인 (LIVE 게시 후, my_stamp_status 뷰로 마지막 적립 시각 확인)
    if (isLive) {
      const { data: stampStatus } = await supabase
        .from("my_stamp_status")
        .select("last_earned_at, next_eligible_at, earned_last_24h")
        .maybeSingle();
      const justEarned =
        stampStatus?.last_earned_at &&
        new Date(stampStatus.last_earned_at).getTime() > Date.now() - 10_000;
      if (justEarned) {
        toast.success(`🎫 스탬프 1개 적립! (${selectedClub?.name})`);
      } else if (stampStatus?.earned_last_24h && stampStatus.earned_last_24h >= 7) {
        toast.message("🎫 오늘 스탬프 한도(7개)에 도달했어요");
      } else {
        toast.message("🎫 30분 후 다음 스탬프를 받을 수 있어요");
      }
    } else {
      toast.success("LIVE 올렸어요 (12시간 후 사라져요)");
    }

    // 초상권 리마인더
    setTimeout(() => {
      toast.message(
        "⚠️ 본인 외 얼굴이 식별 가능하게 찍혔다면 직접 삭제해주세요"
      );
    }, 1500);

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
    <>
    {/* 카메라는 Sheet 밖 최상위에 렌더 — 카메라 열리면 Sheet(open=false)가 DOM에서 사라져
        Radix 조상 불투명 레이어가 제거되고 네이티브 프리뷰(toBack)가 깨끗이 보인다. */}
    <CameraCaptureView
      open={cameraOpen}
      onClose={() => setCameraOpen(false)}
      onCapture={(captured) => {
        setFile(captured);
        setPreviewUrl(URL.createObjectURL(captured));
        setCameraOpen(false);
      }}
    />

    <Sheet
      open={open && !cameraOpen}
      onOpenChange={(v) => {
        // 카메라 여는 중엔 Sheet가 닫혀도 상위 open 상태를 건드리지 않음
        if (cameraOpen) return;
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
            <Zap className="w-4 h-4 fill-red-400 text-red-400" />
            LIVE 올리기
            <span className="text-[11px] font-normal text-neutral-500">
              · 12시간 후 사라져요
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* 스탬프 안내 배너 */}
          <div className="rounded-2xl bg-red-500/10 border border-red-500/30 px-3 py-2 flex items-center gap-2">
            <span className="text-[16px]">🎫</span>
            <div className="text-[12px] text-red-300 leading-tight">
              <span className="font-black">클럽 지정 + 위치 확인</span>
              <span className="text-red-300/70"> 시 스탬프 1개 지급 (30분/일7개)</span>
            </div>
          </div>

          {/* 클럽 선택 CTA */}
          <button
            type="button"
            onClick={() => {
              if (!isVerified) {
                toast.message("지역 인증 후 클럽을 지정할 수 있어요");
                onRequestAreaVerify?.();
                return;
              }
              if (!presetClub) setClubSheetOpen(true);
            }}
            disabled={!!presetClub}
            className={`w-full flex items-center gap-2 p-3 rounded-2xl border text-left disabled:opacity-80 ${
              selectedClub
                ? "bg-red-500/10 border-red-500/40"
                : "bg-[#1C1C1E] border-neutral-800"
            } ${!isVerified ? "opacity-60" : ""}`}
          >
            <MapPin className={`w-4 h-4 shrink-0 ${selectedClub ? "text-red-400" : "text-neutral-500"}`} />
            <div className="flex-1 min-w-0">
              {selectedClub ? (
                <>
                  <div className="text-[13px] font-black text-white truncate">
                    📍 {selectedClub.name}
                  </div>
                  <div className="text-[10px] text-red-300/70">
                    {presetClub ? "이 클럽에 게시" : "탭해서 변경"}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[13px] font-black text-white">
                    클럽 선택하기 <span className="text-neutral-500 text-[11px] font-normal">(선택)</span>
                  </div>
                  <div className="text-[10px] text-neutral-500">
                    {isVerified ? "GPS로 주변 클럽 추천" : "지역 인증 후 이용 가능"}
                  </div>
                </>
              )}
            </div>
            {!presetClub && isVerified && (
              <ChevronRight className="w-4 h-4 text-neutral-600" />
            )}
          </button>

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
            <div>
              <button
                type="button"
                onClick={() => {
                  if (canUseLiveCamera()) {
                    setCameraOpen(true);
                  } else {
                    cameraInputRef.current?.click();
                  }
                }}
                className="w-full flex flex-col items-center justify-center gap-2 aspect-square rounded-2xl border-2 border-dashed border-neutral-700 bg-[#1C1C1E] text-neutral-300 hover:border-red-500 hover:text-red-400 transition-colors"
              >
                <Camera className="w-10 h-10" />
                <span className="text-[15px] font-bold">카메라로 촬영</span>
                <span className="text-[11px] text-neutral-500">
                  {canUseLiveCamera() ? "탭=사진 · 꾹=영상(12초)" : "사진 촬영"}
                </span>
              </button>
              {/* 갤러리 옵션 제거됨 — LIVE는 현장 카메라 촬영만 허용 */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*,video/*"
                capture="environment"
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
                {selectedClub && area ? (
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

        {/* 액션 버튼 */}
        <div className="px-4 pt-2 border-t border-neutral-800 shrink-0">
          <button
            onClick={handlePost}
            disabled={!file || uploading}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-full text-[14px] font-black transition-colors ${
              selectedClub
                ? "bg-red-500 text-white"
                : "bg-white text-black"
            } disabled:bg-neutral-800 disabled:text-neutral-600`}
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                올리는 중...
              </>
            ) : selectedClub ? (
              <>
                <Zap className="w-4 h-4 fill-white" />
                LIVE 올리기 · 🎫
              </>
            ) : (
              <>LIVE 올리기</>
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
        onSkip={() => {
          setSelectedClub(null);
          setClubSheetOpen(false);
        }}
      />
    </Sheet>
    </>
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
  onSkip,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  area: VerifiableArea | null;
  clubs: NearestClub[] | null;
  loading: boolean;
  selectedId: string | null;
  onSelect: (c: { id: string; name: string }) => void;
  onSkip: () => void;
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
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-neutral-500 text-[13px]">
              주변 클럽 찾는 중...
            </div>
          ) : !clubs || clubs.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-[13px]">
              1.5km 반경에 등록된 클럽이 없어요
            </div>
          ) : (
            <ul className="divide-y divide-neutral-900 px-2 py-2">
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
        {/* 하단: 지정 안 함 옵션 */}
        <div className="border-t border-neutral-800 px-4 py-3 shrink-0">
          <button
            type="button"
            onClick={onSkip}
            className="w-full text-[13px] text-neutral-400 hover:text-white transition-colors py-2"
          >
            클럽 지정 안 하고 게시하기 →
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
