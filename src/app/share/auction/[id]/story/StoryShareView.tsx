"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Camera, Check } from "lucide-react";
import { toast } from "sonner";
import type { Auction } from "@/types/database";
import { AuctionCard } from "@/components/auctions/AuctionCard";
import { appendReferralCode } from "@/lib/utils/share";
import { useReferralCode } from "@/hooks/useReferralCode";

interface Props {
  auction: Auction;
}

export function StoryShareView({ auction }: Props) {
  const router = useRouter();
  const referralCode = useReferralCode();
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    const baseUrl = `${window.location.origin}/auctions/${auction.id}`;
    let url = appendReferralCode(baseUrl, referralCode);
    try {
      const u = new URL(url);
      u.searchParams.set("utm_source", "instagram_story");
      u.searchParams.set("utm_medium", "share");
      url = u.toString();
    } catch {}

    const copyLink = async (): Promise<boolean> => {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(url);
          return true;
        } catch {}
      }
      try {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        textarea.style.pointerEvents = "none";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        return ok;
      } catch {
        return false;
      }
    };

    copyLink().then((ok) => {
      if (ok) {
        setLinkCopied(true);
        toast.success("링크가 복사됐어요!", {
          description: "스토리 링크 스티커에 붙여넣으세요",
          duration: 4000,
        });
      } else {
        toast.error("자동 복사 실패 — 직접 복사해주세요");
      }
    });
  }, [auction.id, referralCode]);

  const handleClose = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/md/dashboard");
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* 상단 헤더 (스크린샷 영역 밖) */}
      <header className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur z-20 sticky top-0">
        <button
          onClick={handleClose}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 active:scale-95 transition-transform"
          aria-label="닫기"
        >
          <X className="w-5 h-5 text-white" />
        </button>
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {linkCopied ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-400" />
              <span className="text-green-400">링크 복사됨</span>
            </>
          ) : (
            <span className="text-white/60">준비 중...</span>
          )}
        </div>
      </header>

      {/* 메인 영역: 9:16 비율 스크린샷 캔버스 */}
      <main className="flex-1 flex items-center justify-center px-2 py-4">
        <div
          className="w-full max-w-[460px] rounded-3xl bg-[#0A0A0A] flex flex-col overflow-hidden"
          style={{ aspectRatio: "9 / 16" }}
        >
          {/* 중앙 정렬: NightFlow 로고 + AuctionCard 붙임 */}
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 pointer-events-none select-none">
            <div className="text-3xl font-black tracking-tight text-white">
              NightFlow
            </div>
            <div className="w-full">
              <AuctionCard auction={{ ...auction, view_count: 0 }} priority />
            </div>
          </div>
        </div>
      </main>

      {/* 하단 안내 (스크린샷 영역 밖) */}
      <footer className="px-6 py-4 bg-black/80 backdrop-blur space-y-2 z-20 sticky bottom-0">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Camera className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-black text-white">
              화면을 캡처해서 인스타 스토리에 올려주세요
            </div>
            <div className="text-[12px] text-white/60 mt-0.5">
              링크는 이미 복사돼있어요. 스토리 링크 스티커에 붙여넣기만 하면 끝!
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
