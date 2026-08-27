"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PartyPopper, MessageCircle, Instagram, Link2, Share2, ArrowRight, RotateCcw } from "lucide-react";

import { shareAuction, copyAuctionLink, appendReferralCode } from "@/lib/utils/share";
import { useReferralCode } from "@/hooks/useReferralCode";
import { getShareOrigin } from "@/lib/utils/shareOrigin";


interface ShareSuccessSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  auctionId: string;
  clubName: string;
  tableInfo: string;
  eventDate: string;
  startPrice: number;
  onContinue?: () => void;
  thumbnailUrl?: string;
  listingType?: "auction" | "instant" | "share";
  areaName?: string;
}

export function ShareSuccessSheet({
  isOpen,
  onOpenChange,
  auctionId,
  clubName,
  tableInfo,
  eventDate,
  startPrice,
  onContinue,
  thumbnailUrl,
  listingType,
  areaName,
}: ShareSuccessSheetProps) {
  const router = useRouter();
  const referralCode = useReferralCode();
  const [sharing, setSharing] = useState<string | null>(null);

  const auctionUrl = typeof window !== "undefined"
    ? appendReferralCode(`${getShareOrigin()}/auctions/${auctionId}`, referralCode)
    : "";

  const shareImageUrl = typeof window !== "undefined"
    ? `${getShareOrigin()}/api/auctions/${auctionId}/share-image?format=kakao`
    : "";

  const handleKakaoShare = async () => {
    setSharing("kakao");
    try {
      const isShare = listingType === "share";
      const title = `${areaName ? `[${areaName}] ` : ""}${clubName} ${isShare ? "파티 모집" : "테이블 경매"}`;
      const text = isShare
        ? `인당 ${startPrice.toLocaleString()}원 · 자리 모집 중`
        : `시작가 ${startPrice.toLocaleString()}원 · 입찰 진행 중`;
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ title, text, url: auctionUrl });
        } catch {
          // 사용자 취소 무시
        }
      } else {
        await copyAuctionLink(auctionId, referralCode);
        toast.success("링크가 복사됐어요. 카카오톡에 붙여넣어주세요.");
      }
    } finally {
      setSharing(null);
    }
  };

  const handleInstagramShare = async () => {
    setSharing("instagram");
    try {
      const copied = await copyAuctionLink(auctionId, referralCode);
      const isMobile =
        typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
      if (isMobile) {
        window.location.href = "instagram://story-camera";
        setTimeout(() => {
          window.open("https://www.instagram.com/", "_blank");
        }, 600);
      } else {
        window.open("https://www.instagram.com/", "_blank");
      }
      if (!copied) {
        toast.error("링크 복사에 실패했어요. 직접 복사해주세요");
      }
    } finally {
      setSharing(null);
    }
  };

  const handleCopyLink = async () => {
    setSharing("link");
    try {
      await copyAuctionLink(auctionId, referralCode);
    } finally {
      setSharing(null);
    }
  };

  const handleWebShare = async () => {
    setSharing("more");
    try {
      await shareAuction({
        auctionId,
        clubName,
        eventDate,
        startPrice,
        tableInfo,
        referralCode,
      });
    } finally {
      setSharing(null);
    }
  };

  // replace 사용: 등록 폼을 히스토리에서 치움 → 대시보드에서 뒤로가면 바로 홈
  // (push 시 홈→등록폼→대시보드로 스택이 쌓여 뒤로가기가 꼬임)
  const handleGoToDashboard = () => {
    onOpenChange(false);
    router.replace("/md/dashboard");
  };

  const handleDrawerClose = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      router.replace("/md/dashboard");
    }
  };

  const shareOptions = [
    {
      id: "kakao",
      label: "카카오톡",
      icon: MessageCircle,
      iconColor: "text-yellow-400",
      bgColor: "bg-yellow-500/10 border-yellow-500/20",
      handler: handleKakaoShare,
      available: true,
    },
    {
      id: "instagram",
      label: "인스타그램",
      icon: Instagram,
      iconColor: "text-pink-400",
      bgColor: "bg-pink-500/10 border-pink-500/20",
      handler: handleInstagramShare,
      available: true,
    },
    {
      id: "link",
      label: "링크 복사",
      icon: Link2,
      iconColor: "text-blue-400",
      bgColor: "bg-blue-500/10 border-blue-500/20",
      handler: handleCopyLink,
      available: true,
    },
    {
      id: "more",
      label: "더보기",
      icon: Share2,
      iconColor: "text-muted-foreground",
      bgColor: "bg-muted/50 border-border/30",
      handler: handleWebShare,
      available: typeof navigator !== "undefined" && !!navigator.share,
    },
  ];

  const visibleOptions = shareOptions.filter((opt) => opt.available);

  return (
    <Drawer open={isOpen} onOpenChange={handleDrawerClose}>
      <DrawerContent className="bg-card border-border outline-none px-6 pb-10">
        <DrawerHeader className="text-center space-y-3 pt-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <PartyPopper className="w-8 h-8 text-money" />
            </div>
          </div>
          <DrawerTitle className="text-foreground font-black text-2xl tracking-tight">
            파티 등록 성공!
          </DrawerTitle>
          <DrawerDescription className="text-muted-foreground font-medium text-[14px]">
            지금 바로 공유해서 자리를 채워보세요!
          </DrawerDescription>
        </DrawerHeader>

        {/* 공유 버튼 그리드 */}
        <div className={`grid gap-3 mt-6 ${visibleOptions.length >= 5 ? "grid-cols-5" : visibleOptions.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
          {visibleOptions.map((opt) => {
            const Icon = opt.icon;
            const isLoading = sharing === opt.id;
            return (
              <button
                key={opt.id}
                onClick={opt.handler}
                disabled={!!sharing}
                className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all active:scale-[0.95] ${opt.bgColor} ${sharing && !isLoading ? "opacity-50" : ""}`}
              >
                <div className="w-10 h-10 rounded-full bg-card/50 flex items-center justify-center">
                  <Icon className={`w-5 h-5 ${opt.iconColor}`} />
                </div>
                <span className="text-[11px] font-bold text-foreground/80">
                  {isLoading ? "..." : opt.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* 하단 버튼 */}
        <div className="mt-4 space-y-2">
          {onContinue && (
            <Button
              onClick={() => { onOpenChange(false); onContinue(); }}
              variant="outline"
              className="w-full h-14 rounded-2xl border-green-500/30 text-money font-black text-base hover:bg-green-950/20 hover:border-green-400 flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-5 h-5" />
              다른 테이블도 등록하기
            </Button>
          )}
          <Button
            onClick={handleGoToDashboard}
            className="w-full h-14 rounded-2xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 flex items-center justify-center gap-2"
          >
            대시보드로 이동
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
