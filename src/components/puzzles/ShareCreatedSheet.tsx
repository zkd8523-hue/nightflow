"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, X } from "lucide-react";
import { useKakaoShare } from "@/hooks/useKakaoShare";
import { shareViaNative } from "@/lib/native/nativeShare";

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
}: Props) {
  const router = useRouter();
  const { shareToKakao } = useKakaoShare();
  const [copying, setCopying] = useState(false);
  // 캐러셀 등 transform 조상 안에서도 화면 전체를 덮도록 body로 포탈
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // "서울 어디든" 같은 광역 표기는 공유 멘트에서 "서울"로 축약
  const rawArea = AREA_LABEL[area] ?? area;
  const areaLabel = /어디든/.test(rawArea) ? "서울" : rawArea;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // 카톡은 URL 단위로 OG를 캐싱 → 링크는 더미 쿼리로 매번 새로 스크랩되게
  const bust = Date.now();
  const shareUrl = `${origin}/flags/${puzzleId}?t=${bust}`;
  // 썸네일은 정적 파일(1200x630 사전 합성) — 동적 라우트 렌더링 지연 제거 + Kakao 캐시 활용
  const imageUrl = `${origin}/og-jogak-card.jpg`;

  async function handleKakao() {
    const title = `${areaLabel} 테이블 같이 잡을래?`;
    const text = `인당 ${perPerson.toLocaleString()}원 · 파티원 찾는 중 🔥`;

    // 앱(Capacitor 네이티브): Kakao JS SDK sendDefault가 WebView에서 먹통 → OS 공유 시트 사용
    const native = await shareViaNative({ title, text, url: shareUrl });
    if (native.handled) return;

    // isAvailable(React state)가 늦게 갱신되는 레이스 방지 — shareToKakao가
    // window.Kakao.isInitialized()를 직접 확인하므로 상태 게이트 없이 바로 시도.
    const ok = await shareToKakao({
      clubName: areaLabel,
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
          return; // 공유 성공/취소 모두 종료
        } catch (e) {
          // 사용자가 취소한 경우(AbortError)는 조용히 종료, 그 외(미지원 등)는 복사 폴백
          if (e instanceof Error && e.name === "AbortError") return;
        }
      }
      // 공유 API 없음/실패 → 링크 복사로 확실히 피드백 (무반응 방지)
      await copyLink();
      toast.success("링크가 복사됐어요. 붙여넣어 공유하세요!");
    }
  }

  async function copyLink() {
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
  const dismiss = mode === "created" ? goDetail : onClose;

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-end justify-center" onClick={dismiss}>
      <div
        className="w-full max-w-lg bg-[#1C1C1E] rounded-t-3xl p-6 space-y-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-[20px] font-black text-white">
              {mode === "created" ? "🧩 조각 등록 완료!" : "🧩 조각 공유하기"}
            </p>
            <p className="text-[14px] text-neutral-300 leading-relaxed">
              <span className="text-green-400 font-bold">링크를 공유</span>해서
              <br />파티원을 빠르게 모아보세요.
            </p>
          </div>
          <button onClick={dismiss} className="p-1 -mr-1 text-neutral-500">
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

        <div className="flex gap-2">
          <button
            onClick={copyLink}
            disabled={copying}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-neutral-800 text-neutral-200 font-bold text-[14px] disabled:opacity-50"
          >
            <Link2 className="w-4 h-4" />
            링크 복사
          </button>
          <button
            onClick={dismiss}
            className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-400 font-bold text-[14px]"
          >
            {mode === "created" ? "나중에" : "닫기"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
