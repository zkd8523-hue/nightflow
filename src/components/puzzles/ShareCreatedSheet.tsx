"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, X } from "lucide-react";
import { useKakaoShare } from "@/hooks/useKakaoShare";

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
  currentCount: number;
  targetCount: number;
  onClose: () => void;
}

/**
 * 조각 등록 직후 "지금 카톡으로 공유" 강조 시트.
 * 오픈챗에 바로 뿌려 파티원을 모으는 핵심 동선.
 */
export function ShareCreatedSheet({
  puzzleId,
  eventDate,
  area,
  perPerson,
  currentCount,
  targetCount,
  onClose,
}: Props) {
  const router = useRouter();
  const { shareToKakao, isAvailable } = useKakaoShare();
  const [copying, setCopying] = useState(false);

  const areaLabel = AREA_LABEL[area] ?? area;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // 카톡은 URL 단위로 OG를 캐싱 → 더미 쿼리로 매번 새로 스크랩되게
  const bust = Date.now();
  const shareUrl = `${origin}/flags/${puzzleId}?t=${bust}`;
  const imageUrl = `${origin}/api/puzzles/${puzzleId}/share-image?t=${bust}`;

  async function handleKakao() {
    const ok = isAvailable
      ? await shareToKakao({
          clubName: areaLabel,
          tableInfo: "",
          startPrice: perPerson,
          auctionUrl: shareUrl,
          thumbnailUrl: imageUrl,
          listingType: "share",
          isFromMD: false,
          eventDate,
          area: areaLabel,
        })
      : false;
    if (!ok) {
      // 카카오 SDK 불가 → OS 공유 / 링크 복사 폴백
      const title = `${areaLabel} 조각 같이 갈래?`;
      const text = `인당 ${perPerson.toLocaleString()}원 · 같이 갈 사람 구해요`;
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ title, text, url: shareUrl });
        } catch {
          /* 취소 */
        }
      } else {
        await copyLink();
        toast.success("링크가 복사됐어요. 오픈챗에 붙여넣어주세요!");
      }
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

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-end justify-center" onClick={goDetail}>
      <div
        className="w-full max-w-lg bg-[#1C1C1E] rounded-t-3xl p-6 space-y-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-[20px] font-black text-white">🧩 조각 등록 완료!</p>
            <p className="text-[14px] text-neutral-300 leading-relaxed">
              지금 바로 <span className="text-green-400 font-bold">오픈챗에 공유</span>해서
              <br />함께 갈 파티원을 모아보세요.
            </p>
          </div>
          <button onClick={goDetail} className="p-1 -mr-1 text-neutral-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 공유 이미지 미리보기 (카톡에 이렇게 나가요) */}
        <div className="rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="공유 이미지 미리보기"
            className="w-full block"
            style={{ aspectRatio: "1200 / 630", objectFit: "cover" }}
          />
        </div>

        {/* 요약 */}
        <div className="rounded-2xl bg-neutral-900/60 border border-neutral-800 px-4 py-3">
          <p className="text-[14px] font-bold text-white">
            {areaLabel} · 인당 {perPerson.toLocaleString()}원
          </p>
          <p className="text-[12px] text-neutral-400 mt-0.5">
            현재 {currentCount}/{targetCount}명 모집 중
          </p>
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
            onClick={goDetail}
            className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-400 font-bold text-[14px]"
          >
            나중에
          </button>
        </div>
      </div>
    </div>
  );
}
