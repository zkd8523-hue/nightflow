"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Check, ChevronRight, Loader2, MapPin, Search, X, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { uploadChatMedia } from "@/lib/utils/uploadChatMedia";
import { type VerifiableArea } from "@/lib/chat/areas";
import { fetchNearestClubsAnyArea, searchClubsByName, type NearestClub } from "@/lib/clubs/nearestClubs";
import { getCurrentCoords } from "@/lib/geo/currentCoords";
import type { ChatShot, TextOverlay, ImageOverlay, ShotPoll } from "@/types/database";
import { useCameraStore } from "@/stores/useCameraStore";
import { LiveEditView, type ImageOverlayDraft } from "./LiveEditView";

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
 *   - 클럽 지정 시: club_id + area 있는 LIVE → 클럽 페이지 노출
 *   - 클럽 미지정 시: area/club 둘 다 null → 일반 게시
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
  const openCamera = useCameraStore((s) => s.openCamera);

  const [selectedClub, setSelectedClub] = useState<{ id: string; name: string } | null>(presetClub);
  const [clubSheetOpen, setClubSheetOpen] = useState(false);
  const [nearestClubs, setNearestClubs] = useState<NearestClub[] | null>(null);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  // 검색 시 거리 계산용 유저 좌표
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  // 위치 → 가까운 클럽 로드. 실패하면 geoError로 원인 표시(+재시도 버튼에서 재호출).
  const loadNearby = useCallback(async () => {
    setClubsLoading(true);
    setGeoError(null);
    try {
      const c = await getCurrentCoords();
      setUserCoords({ lat: c.latitude, lng: c.longitude });
      const clubs = await fetchNearestClubsAnyArea(c.latitude, c.longitude, 10);
      setNearestClubs(clubs);
    } catch (err) {
      console.warn("[ShotCaptureSheet] geo error", err);
      setNearestClubs([]);
      const msg = err instanceof Error ? err.message : String(err);
      setGeoError(
        /denied|permission|권한|kCLError|denied/i.test(msg)
          ? "위치 권한이 꺼져 있어요. 설정에서 허용해주세요"
          : "위치를 가져오지 못했어요"
      );
    } finally {
      setClubsLoading(false);
    }
  }, []);

  // LIVE 진입 즉시 클럽 픽 시트 자동 오픈 (presetClub 있으면 skip).
  // 인증 여부와 무관 — 위치 동의 → 가까운 클럽 리스트업 흐름.
  useEffect(() => {
    if (!open) return;
    setSelectedClub(presetClub);
    if (!presetClub) {
      setClubSheetOpen(true);
    }
  }, [open, presetClub]);

  // LIVE 진입 시 GPS로 가까운 클럽 로드 (인증 없이 전체 클럽에서 거리순 10개).
  // getCurrentCoords가 위치 권한 동의 모달을 띄운다.
  useEffect(() => {
    if (!open || presetClub) return;
    loadNearby();
  }, [open, presetClub, loadNearby]);

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

  // 카메라 실행 (앱=네이티브 카메라, 웹=파일 input 폴백)
  function launchCamera() {
    if (canUseLiveCamera()) {
      openCamera((captured) => {
        setFile(captured);
        setPreviewUrl(URL.createObjectURL(captured));
      });
    } else {
      cameraInputRef.current?.click();
    }
  }

  async function handlePost(
    captionArg?: string,
    textOverlays?: TextOverlay[],
    imageOverlayDrafts?: ImageOverlayDraft[],
    poll?: ShotPoll | null
  ) {
    if (!file || uploading) return;
    setUploading(true);

    const finalCaption = (captionArg ?? caption).trim();

    const media = await uploadChatMedia(file, userId);
    if (!media) {
      setUploading(false);
      return;
    }

    // 이미지 오버레이 업로드 (각 File → 스토리지 URL)
    const imageOverlays: ImageOverlay[] = [];
    if (imageOverlayDrafts && imageOverlayDrafts.length > 0) {
      for (const io of imageOverlayDrafts) {
        const up = await uploadChatMedia(io.file, userId);
        if (up) {
          imageOverlays.push({
            id: io.id,
            url: up.url,
            xPct: io.xPct,
            yPct: io.yPct,
            widthPct: io.widthPct,
            rotation: io.rotation,
          });
        }
      }
    }

    // 페이로드 결정:
    //   클럽 지정 → area + club_id 필수 (클럽 페이지 노출 LIVE)
    //   클럽 미지정 → area/club 모두 null (일반)
    const isLive = !!selectedClub;
    const payload: Record<string, unknown> = {
      author_id: userId,
      media_type: media.type,
      media_url: media.url,
      width: media.width ?? null,
      height: media.height ?? null,
      duration: media.duration ?? null,
      caption: finalCaption || null,
      text_overlays: textOverlays && textOverlays.length > 0 ? textOverlays : [],
      image_overlays: imageOverlays,
      poll: poll ?? null,
      area: isLive ? area : null,
      club_id: isLive ? selectedClub?.id ?? null : null,
    };

    const supabase = createClient();
    const { data, error } = await supabase
      .from("chat_shots")
      .insert(payload)
      .select(
        `id, area, author_id, club_id, media_type, media_url, width, height, duration, caption, text_overlays, image_overlays, poll, created_at, expires_at`
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

    if (isLive) {
      toast.success(`🔥 LIVE 올렸어요! (${selectedClub?.name})`);
    } else {
      toast.success("LIVE 올렸어요 (12시간 후 사라져요)");
    }

    // 초상권 리마인더 — 최초 게시 1회만 (매번 뜨면 성가심)
    try {
      if (!localStorage.getItem("live.privacyReminderSeen")) {
        localStorage.setItem("live.privacyReminderSeen", "1");
        setTimeout(() => {
          toast.message(
            "⚠️ 본인 외 얼굴이 식별 가능하게 찍혔다면 직접 삭제해주세요"
          );
        }, 1500);
      }
    } catch {
      /* localStorage 실패 시 그냥 skip */
    }

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
    {/* 촬영 결과 풀스크린 편집 (인스타식) — file 있으면 시트 위에 오버레이 */}
    {file && previewUrl && (
      <LiveEditView
        open={!!file}
        file={file}
        previewUrl={previewUrl}
        clubName={selectedClub?.name ?? null}
        uploading={uploading}
        onClose={() => {
          setFile(null);
          setPreviewUrl(null);
        }}
        onRetake={() => {
          setFile(null);
          setPreviewUrl(null);
          openCamera((captured) => {
            setFile(captured);
            setPreviewUrl(URL.createObjectURL(captured));
          });
        }}
        onPost={(cap, textOv, imgOv, poll) => handlePost(cap, textOv, imgOv, poll)}
      />
    )}

    <Sheet
      // 클럽 픽 시트가 열려있는 동안엔 메인 시트를 숨긴다 (둘 동시 노출 방지 — 클럽 선택 먼저).
      open={open && !file && !clubSheetOpen}
      onOpenChange={(v) => {
        // 편집뷰(file 있음) 또는 클럽 픽 중엔 상위 open 상태를 건드리지 않음
        if (file || clubSheetOpen) return;
        if (!v) resetState();
        onOpenChange(v);
      }}
    >
      <SheetContent
        side="bottom"
        // 세로 스크롤이 페이지 pull-to-refresh를 발동시키지 않도록 원천차단
        data-no-pull-refresh="strict"
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
          {/* 클럽 선택 CTA */}
          <button
            type="button"
            onClick={() => {
              if (!presetClub) setClubSheetOpen(true);
            }}
            disabled={!!presetClub}
            className={`w-full flex items-center gap-2 p-3 rounded-2xl border text-left disabled:opacity-80 ${
              selectedClub
                ? "bg-neutral-800/60 border-neutral-600"
                : "bg-[#1C1C1E] border-neutral-800"
            }`}
          >
            <MapPin className={`w-4 h-4 shrink-0 ${selectedClub ? "text-white" : "text-neutral-500"}`} />
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
                    클럽 선택하기 <span className="text-neutral-500 text-[11px] font-normal">(선택)</span>
                  </div>
                  <div className="text-[10px] text-neutral-500">
                    가까운 클럽 추천
                  </div>
                </>
              )}
            </div>
            {!presetClub && (
              <ChevronRight className="w-4 h-4 text-neutral-600" />
            )}
          </button>

          {/* 카메라 진입 — 촬영하면 결과가 LiveEditView 풀스크린으로 넘어감 */}
          <div>
            <button
              type="button"
              onClick={launchCamera}
              className="w-full flex flex-col items-center justify-center gap-2 aspect-square rounded-2xl border-2 border-dashed border-neutral-700 bg-[#1C1C1E] text-neutral-300 hover:border-red-500 hover:text-red-400 transition-colors"
            >
              <Camera className="w-10 h-10" />
              <span className="text-[15px] font-bold">카메라로 촬영</span>
              <span className="text-[11px] text-neutral-500">
                {canUseLiveCamera() ? "탭=사진 · 꾹=영상(12초)" : "사진 촬영"}
              </span>
            </button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*,video/*"
              capture="environment"
              className="sr-only"
              onChange={pickFile}
            />
          </div>
        </div>

        {/* 게시는 촬영 후 풀스크린 편집(LiveEditView)에서 처리 — 여기 하단 버튼 제거됨 */}
      </SheetContent>
    </Sheet>

    {/* 클럽 선택 시트 — 메인 시트와 형제(중첩 X). LIVE 진입 시 이것만 먼저 뜬다. */}
    <ClubPickerSheet
      open={clubSheetOpen}
      onOpenChange={(v) => {
        // 클럽을 고르지 않고 시트를 닫으면(X/뒤로) 클럽 미지정 게시를 막기 위해
        // LIVE 전체를 종료. 이미 고른 클럽이 있으면 픽 시트만 닫음(변경 취소).
        if (!v && !selectedClub) {
          setClubSheetOpen(false);
          resetState();
          onOpenChange(false);
          return;
        }
        setClubSheetOpen(v);
      }}
      clubs={nearestClubs}
      loading={clubsLoading}
      geoError={geoError}
      onRetryLocation={loadNearby}
      userCoords={userCoords}
      selectedId={selectedClub?.id ?? null}
      onSelect={(c) => {
        setSelectedClub(c);
        setClubSheetOpen(false);
        // 클럽 선택 즉시 카메라 진입 (메인 시트의 촬영 버튼 단계 생략)
        launchCamera();
      }}
    />
    </>
  );
}

function ClubPickerSheet({
  open,
  onOpenChange,
  clubs,
  loading,
  geoError,
  onRetryLocation,
  userCoords,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clubs: NearestClub[] | null;
  loading: boolean;
  geoError?: string | null;
  onRetryLocation?: () => void;
  userCoords: { lat: number; lng: number } | null;
  selectedId: string | null;
  onSelect: (c: { id: string; name: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NearestClub[] | null>(null);
  const [searching, setSearching] = useState(false);

  // 검색어 디바운스 → searchClubsByName
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await searchClubsByName(q, userCoords?.lat, userCoords?.lng, 20);
      if (cancelled) return;
      setSearchResults(res);
      setSearching(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, userCoords]);

  // 시트 닫히면 검색 초기화
  useEffect(() => {
    if (!open) {
      setQuery("");
      setSearchResults(null);
    }
  }, [open]);

  const list = searchResults ?? clubs ?? [];
  const isSearchMode = query.trim().length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        // 시트 열릴 때 검색 input으로 자동 포커스 → 키보드 팝업 → 화면 축소 방지
        onOpenAutoFocus={(e) => e.preventDefault()}
        // 리스트 세로 스크롤이 페이지 pull-to-refresh를 발동시키지 않도록 원천차단
        data-no-pull-refresh="strict"
        className="bg-[#0B0A11] border-neutral-800 rounded-t-3xl p-0 pb-6 max-h-[85vh] flex flex-col"
      >
        <SheetHeader className="px-4 pt-4 pb-3 shrink-0">
          <SheetTitle className="text-white text-[16px] text-left flex items-center gap-2">
            <MapPin className="w-4 h-4 text-neutral-400" />
            클럽 선택
            <span className="text-[11px] font-normal text-neutral-500">· 가까운 순</span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto border-t border-neutral-800">
          {loading || searching ? (
            <div className="p-6 text-center text-neutral-500 text-[13px]">
              {searching ? "검색 중..." : "주변 클럽 찾는 중..."}
            </div>
          ) : list.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-[13px] leading-relaxed">
              {isSearchMode ? (
                "검색 결과가 없어요"
              ) : geoError ? (
                <>
                  <span className="text-amber-400">{geoError}</span>
                  <br />
                  {onRetryLocation && (
                    <button
                      type="button"
                      onClick={onRetryLocation}
                      className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-black text-[13px] font-black active:scale-95 transition"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      위치 다시 시도
                    </button>
                  )}
                  <br />
                  <span className="mt-2 inline-block text-neutral-500">
                    또는 아래에서 클럽명을 검색하세요
                  </span>
                </>
              ) : (
                <>
                  주변 클럽을 못 찾았어요.
                  <br />
                  <span className="text-neutral-400">아래에서 클럽명을 검색해보세요</span>
                </>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-neutral-900 px-2 py-2">
              {list.map((c) => {
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
                          {c.area}
                          {c.distance_km >= 0 && (
                            <>
                              {" · "}
                              {c.distance_km < 1
                                ? `${Math.round(c.distance_km * 1000)}m`
                                : `${c.distance_km.toFixed(1)}km`}
                            </>
                          )}
                        </div>
                      </div>
                      {selected && <Check className="w-5 h-5 text-white shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 검색 바 (리스트 아래 — 주변 클럽 우선, 없으면 검색) */}
        <div className="px-4 py-3 shrink-0 border-t border-neutral-800">
          <div className="flex items-center gap-2 bg-[#1C1C1E] border border-neutral-800 rounded-xl px-3 py-2.5">
            <Search className="w-4 h-4 text-neutral-500 shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="검색하기"
              // text-[16px]: iOS 사파리는 16px 미만 input 포커스 시 자동 확대 → 검색창 밀림. 16px로 차단.
              className="flex-1 bg-transparent text-white text-[16px] placeholder:text-neutral-600 focus:outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="지우기">
                <X className="w-4 h-4 text-neutral-500" />
              </button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
