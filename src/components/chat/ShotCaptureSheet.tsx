"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, ImagePlus, Loader2, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { uploadChatMedia } from "@/lib/utils/uploadChatMedia";
import { ROOM_LABEL } from "@/lib/chat/areas";
import { fetchNearestClubs, type NearestClub } from "@/lib/clubs/nearestClubs";
import type { ChatShot, VerifiableArea } from "@/types/database";
import { CameraCaptureView } from "./CameraCaptureView";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 인증된 area — 작성 가능한 지역 */
  area: VerifiableArea;
  userId: string;
  userProfile?: {
    display_name: string | null;
    profile_image: string | null;
  };
  /** 업로드 성공 후 옵티미스틱 prepend 트리거 */
  onPosted?: (shot: ChatShot) => void;
  /** 클럽 사전 지정 — 클럽 페이지의 빈 CTA에서 진입 시 자동 픽 */
  presetClub?: { id: string; name: string } | null;
}

const MAX_CAPTION = 200;

/**
 * SHOT 캡처/업로드 시트
 * 인증된 지역 유저만 호출됨
 */
export function ShotCaptureSheet({
  open,
  onOpenChange,
  area,
  userId,
  userProfile,
  onPosted,
  presetClub = null,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  // LIVE 클럽 지정 (필수, Migration 341)
  const [selectedClub, setSelectedClub] = useState<{ id: string; name: string } | null>(presetClub);
  const [nearestClubs, setNearestClubs] = useState<NearestClub[] | null>(null);
  const [clubsLoading, setClubsLoading] = useState(false);

  // 동의 모달 (14일 1회)
  const [consentChecked, setConsentChecked] = useState(false);
  const [needConsent, setNeedConsent] = useState(false);
  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("liveCameraConsent");
      if (!raw) {
        setNeedConsent(true);
        return;
      }
      const at = Number(raw);
      const stale = Date.now() - at > 14 * 24 * 60 * 60 * 1000;
      setNeedConsent(stale);
    } catch {
      setNeedConsent(true);
    }
  }, [open]);

  // 시트 열릴 때마다 클럽 추천 GPS 호출 (presetClub 없으면)
  useEffect(() => {
    if (!open || presetClub) return;
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
  }, [open, area, presetClub]);

  /**
   * 인스타식 풀카메라 사용 가능 여부
   * - HTTPS or localhost일 때만 navigator.mediaDevices가 노출됨
   * - 그 외에는 OS 네이티브 카메라 picker(`<input capture>`)로 fallback
   */
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
    setSelectedClub(presetClub);
    setConsentChecked(false);
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    // 다시 같은 파일 선택할 수 있게 input 비우기
    e.target.value = "";
  }

  async function handlePost() {
    if (!file || uploading) return;
    if (!selectedClub) {
      toast.error("클럽을 선택해주세요");
      return;
    }
    if (needConsent && !consentChecked) {
      toast.error("개인정보 안내에 동의해주세요");
      return;
    }
    setUploading(true);

    const media = await uploadChatMedia(file, userId);
    if (!media) {
      setUploading(false);
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("chat_shots")
      .insert({
        area,
        author_id: userId,
        club_id: selectedClub.id,
        media_type: media.type,
        media_url: media.url,
        width: media.width ?? null,
        height: media.height ?? null,
        duration: media.duration ?? null,
        caption: caption.trim() || null,
      })
      .select(
        `id, area, author_id, club_id, media_type, media_url, width, height, duration, caption, created_at, expires_at`
      )
      .single();

    if (error || !data) {
      console.error("[ShotCaptureSheet] insert error", error);
      const msg = error?.message ?? "";
      if (msg.includes("LIVE_LOCKED_30MIN")) {
        toast.error("30분 후에 다시 올릴 수 있어요");
      } else if (msg.includes("LIVE_DAILY_LIMIT")) {
        toast.error("하루에 LIVE 7개까지 올릴 수 있어요");
      } else if (msg.includes("LIVE_AREA_MISMATCH")) {
        toast.error("인증된 지역과 클럽 지역이 달라요");
      } else if (msg.includes("LIVE_CLUB_REQUIRED")) {
        toast.error("클럽을 선택해주세요");
      } else if (
        error?.code === "42501" ||
        msg.includes("row-level security")
      ) {
        toast.error("지역 인증이 만료되었어요. 다시 인증해주세요");
      } else if (error?.code === "42P01" || error?.code === "42703") {
        toast.error("DB 마이그레이션 미적용 (341)");
      } else {
        toast.error(`업로드 실패: ${msg || "알 수 없는 오류"}`);
      }
      setUploading(false);
      return;
    }

    // 동의 시점 기록 (14일 후 재안내)
    try {
      window.localStorage.setItem("liveCameraConsent", String(Date.now()));
    } catch {
      /* noop */
    }

    toast.success(`${selectedClub.name} LIVE 올렸어요 (9시간 후 사라져요)`);
    // 업로드 직후 초상권 검토 안내
    setTimeout(() => {
      toast.message(
        "⚠️ 본인 외 다른 사람 얼굴이 식별 가능하게 찍혔다면 직접 삭제해주세요"
      );
    }, 1000);

    onPosted?.({
      ...data,
      area: data.area as VerifiableArea,
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
            🥃 {ROOM_LABEL[area]} SHOT 올리기
            <span className="text-[11px] font-normal text-neutral-500">
              · 9시간 후 사라져요
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
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
                    // HTTPS 아닌 환경(개발 IP 등) → OS 네이티브 카메라 picker
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
              {/* 카메라 fallback (HTTP/secure context 아닐 때 OS 네이티브 카메라 호출)
                  HTTPS면 인스타식 CameraCaptureView가 사용되고 이 input은 사용 안 됨.
                  accept에 video 포함 — HTTP fallback에서도 동영상 촬영은 OS 카메라 앱으로 가능 */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*,video/*"
                capture="environment"
                className="sr-only"
                onChange={pickFile}
              />
              {/* 갤러리: 사진/동영상 둘 다 선택 가능 */}
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
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-300 text-[10px] font-bold">
                  📍 {ROOM_LABEL[area]}
                </span>
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

        {/* 풀스크린 카메라 캡처 (인스타식: 탭=사진, 꾹=동영상 5초) */}
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
            disabled={!file || uploading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-full text-[14px] font-black bg-amber-500 text-black disabled:bg-neutral-800 disabled:text-neutral-600 transition-colors"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                올리는 중...
              </>
            ) : (
              <>🥃 SHOT 올리기</>
            )}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
