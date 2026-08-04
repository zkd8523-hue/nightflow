"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Share2, X } from "lucide-react";
import { useKakaoShare } from "@/hooks/useKakaoShare";
import { shareViaNative } from "@/lib/native/nativeShare";
import { trackEvent } from "@/lib/analytics/events";

const AREA_LABEL: Record<string, string> = {
  gangnam: "강남",
  hongdae: "홍대",
  itaewon: "이태원",
  other: "그 외",
};

interface Props {
  puzzleId: string;
  eventDate: string;
  area: string;
  perPerson: number;
  onClose: () => void;
  /** "created": 등록 직후 / "share": 홈·상세에서 공유 버튼 누른 경우 */
  mode?: "created" | "share";
  /** MD 직통 조각: 클럽 대표 이미지·이름 사용 ("{지역} {클럽이름}" + 클럽 썸네일) */
  hostIsMd?: boolean;
  clubName?: string | null;
  clubThumbnail?: string | null;
}

/**
 * 조각 카톡 공유 강조 시트.
 * 등록 직후(created) 또는 홈·상세 공유 버튼(share)에서 재사용.
 */
export function ShareCreatedSheet({
  puzzleId,
  eventDate,
  area,
  perPerson,
  onClose,
  mode = "created",
  hostIsMd = false,
  clubName = null,
  clubThumbnail = null,
}: Props) {
  const useClub = hostIsMd && !!clubName;
  const router = useRouter();
  const { shareToKakao } = useKakaoShare();
  const [copying, setCopying] = useState(false);
  // 캐러셀 등 transform 조상 안에서도 화면 전체를 덮도록 body로 포탈
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // 시트 노출 이벤트 (등록 직후=created / 재공유=share)
  useEffect(() => {
    trackEvent("puzzle_share_sheet_view", {
      puzzle_id: puzzleId,
      mode,
      host_is_md: hostIsMd,
      area,
    });
  }, [puzzleId, mode, hostIsMd, area]);

  // "서울 어디든" 같은 광역 표기는 공유 멘트에서 "서울"로 축약
  const rawArea = AREA_LABEL[area] ?? area;
  const areaLabel = /어디든/.test(rawArea) ? "서울" : rawArea;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // 카톡은 URL 단위로 OG를 캐싱 → 링크는 더미 쿼리로 매번 새로 스크랩되게
  const bust = Date.now();
  const shareUrl = `${origin}/flags/${puzzleId}?t=${bust}`;
  // MD 직통은 클럽 대표 이미지(Supabase 공개 URL) — 로컬에서도 카카오가 긁을 수 있음.
  // 유저 조각은 정적 파일(1200x630 사전 합성) — 로컬 미노출, 프로덕션에서만.
  const imageUrl = useClub && clubThumbnail ? clubThumbnail : `${origin}/og-jogak-card.jpg`;

  async function handleKakao() {
    trackEvent("puzzle_share_kakao_click", {
      puzzle_id: puzzleId,
      mode,
      host_is_md: hostIsMd,
      area,
    });
    // MD 직통: "{지역} {클럽이름}" / 유저 조각: "{지역} 테이블"
    const title = `${areaLabel}${useClub ? ` ${clubName}` : " 테이블"} 같이 갈래?`;
    const text = `1인 ${perPerson.toLocaleString()}₩ · 파티원 찾는 중 🔥`;

    // 앱(Capacitor 네이티브): Kakao JS SDK sendDefault가 WebView에서 먹통 → OS 공유 시트 사용
    const native = await shareViaNative({ title, text, url: shareUrl });
    if (native.handled) {
      trackEvent("puzzle_share_kakao_result", {
        puzzle_id: puzzleId,
        mode,
        host_is_md: hostIsMd,
        method: "native_share",
      });
      return;
    }

    // isAvailable(React state)가 늦게 갱신되는 레이스 방지 — shareToKakao가
    // window.Kakao.isInitialized()를 직접 확인하므로 상태 게이트 없이 바로 시도.
    const ok = await shareToKakao({
      clubName: useClub ? clubName! : "",
      tableInfo: "",
      startPrice: perPerson,
      auctionUrl: shareUrl,
      thumbnailUrl: imageUrl,
      listingType: "share",
      isFromMD: false,
      eventDate,
      area: areaLabel,
    });
    if (!ok) {
      // 카카오 SDK 미로드(광고차단/네트워크) 등 → OS 공유 시도, 실패하면 반드시 링크 복사로 피드백
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ title, text, url: shareUrl });
          trackEvent("puzzle_share_kakao_result", {
            puzzle_id: puzzleId,
            mode,
            host_is_md: hostIsMd,
            method: "web_share_fallback",
          });
          return; // 공유 성공/취소 모두 종료
        } catch (e) {
          // 사용자가 취소한 경우(AbortError)는 조용히 종료, 그 외(미지원 등)는 복사 폴백
          if (e instanceof Error && e.name === "AbortError") return;
        }
      }
      // 공유 API 없음/실패 → 링크 복사로 확실히 피드백 (무반응 방지)
      await copyLink();
      trackEvent("puzzle_share_kakao_result", {
        puzzle_id: puzzleId,
        mode,
        host_is_md: hostIsMd,
        method: "copy_fallback",
      });
      toast.success("링크가 복사됐어요. 붙여넣어 공유하세요!");
    } else {
      trackEvent("puzzle_share_kakao_result", {
        puzzle_id: puzzleId,
        mode,
        host_is_md: hostIsMd,
        method: "kakao_sdk",
      });
    }
  }

  async function handleMoreShare() {
    trackEvent("puzzle_share_more_click", {
      puzzle_id: puzzleId,
      mode,
      host_is_md: hostIsMd,
      area,
    });
    const title = `${areaLabel}${useClub ? ` ${clubName}` : " 테이블"} 같이 갈래?`;
    const text = `1인 ${perPerson.toLocaleString()}₩ · 파티원 찾는 중 🔥`;

    // 카페 앱 등 공유 대상이 전달받은 title/text/url을 글쓰기창에 자동으로 채워줄지는
    // 앱마다 달라 우리가 통제할 수 없음 → 공유시트 열기와 동시에 클립보드에도 링크를 심어둬서
    // "안 채워지면 그냥 붙여넣기" 안전장치를 항상 확보(무음 처리, 별도 토스트 없음).
    try {
      await navigator.clipboard?.writeText(shareUrl);
    } catch {}

    // 앱(Capacitor 네이티브): navigator.share가 WebView에서 먹통일 수 있어 네이티브 브릿지 우선 시도
    const native = await shareViaNative({ title, text, url: shareUrl });
    if (native.handled) {
      toast.success("공유 링크도 복사해뒀어요. 안 채워지면 붙여넣기 하세요!");
      return;
    }

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url: shareUrl });
        toast.success("공유 링크도 복사해뒀어요. 안 채워지면 붙여넣기 하세요!");
      } catch (e) {
        // 사용자가 취소한 경우(AbortError)는 조용히 종료
        if (e instanceof Error && e.name === "AbortError") return;
      }
      return;
    }
    // OS 공유시트 미지원 환경(PC 등) → 이미 복사된 링크 안내만
    toast.success("링크가 복사됐어요. 붙여넣어 공유하세요!");
  }

  async function copyLink() {
    trackEvent("puzzle_share_copy_click", {
      puzzle_id: puzzleId,
      mode,
      host_is_md: hostIsMd,
      area,
    });
    setCopying(true);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("링크가 복사됐어요");
      }
    } finally {
      setCopying(false);
    }
  }

  function goDetail() {
    onClose();
    router.push(`/flags/${puzzleId}`);
  }
  // 등록 직후엔 닫으면 상세로, 공유 버튼에서 열었으면 그냥 닫기
  const rawDismiss = mode === "created" ? goDetail : onClose;
  const dismiss = () => {
    trackEvent("puzzle_share_dismiss", {
      puzzle_id: puzzleId,
      mode,
      host_is_md: hostIsMd,
      area,
    });
    rawDismiss();
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-end justify-center" onClick={dismiss}>
      <div
        className="w-full max-w-lg bg-card rounded-t-3xl p-6 space-y-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-[20px] font-black text-foreground">
              {mode === "created" ? "🧩 조각 등록 성공!" : "🧩 조각 공유하기"}
            </p>
            <p className="text-[14px] text-foreground/80 leading-relaxed">
              <span className="text-money font-bold">링크를 공유</span>해서
              <br />파티원을 빠르게 모아보세요.
            </p>
          </div>
          <button onClick={dismiss} className="p-1 -mr-1 text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 메인 CTA: 카카오톡 공유 */}
        <button
          onClick={handleKakao}
          className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-[#FEE500] text-[#3C1E1E] font-black text-[16px] active:bg-[#FDD835]"
        >
          <span className="text-[18px]">💬</span>
          카카오톡으로 공유하기
        </button>

        {/* 카톡 외 다른 앱(네이버카페 등)으로 공유 — OS 공유시트 노출. PC 등 미지원 환경은 링크 복사로 폴백 */}
        <button
          onClick={handleMoreShare}
          className="flex items-center justify-center gap-1.5 w-full py-3 rounded-xl border border-border text-foreground font-bold text-[14px]"
        >
          <Share2 className="w-4 h-4" />
          카페에 공유하기
        </button>

        <div className="flex gap-2">
          <button
            onClick={copyLink}
            disabled={copying}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-muted text-foreground font-bold text-[14px] disabled:opacity-50"
          >
            <Link2 className="w-4 h-4" />
            링크 복사
          </button>
          <button
            onClick={dismiss}
            className="flex-1 py-3 rounded-xl bg-muted text-muted-foreground font-bold text-[14px]"
          >
            {mode === "created" ? "나중에" : "닫기"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
