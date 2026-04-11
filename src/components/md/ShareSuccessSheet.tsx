"use client";

import { useState, useEffect, useRef } from "react";
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

import { shareAuction, shareToInstagram, copyAuctionLink, appendReferralCode } from "@/lib/utils/share";
import { useKakaoShare } from "@/hooks/useKakaoShare";
import { useReferralCode } from "@/hooks/useReferralCode";


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
  listingType?: "auction" | "instant";
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
  const { shareToKakao, isAvailable: kakaoAvailable } = useKakaoShare();
  const referralCode = useReferralCode();
  const [sharing, setSharing] = useState<string | null>(null);

  // User Gesture 만료 방어: 마운트 즉시 이미지 prefetch → Blob state 보관
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen || !auctionId) return;

    let cancelled = false;
    const fetchImage = async () => {
      try {
        const res = await fetch(`/api/auctions/${auctionId}/share-image`);
        if (!res.ok) return;
        const blob = await res.blob();
        if (cancelled) return;
        setImageBlob(blob);
        blobUrlRef.current = URL.createObjectURL(blob);
      } catch {
        // 이미지 로딩 실패 시 무시 — 공유는 텍스트 fallback으로 가능
      }
    };
    fetchImage();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, [isOpen, auctionId]);

  const auctionUrl = typeof window !== "undefined"
    ? appendReferralCode(`${window.location.origin}/auctions/${auctionId}`, referralCode)
    : "";

  const shareImageUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/auctions/${auctionId}/share-image`
    : "";

  const handleKakaoShare = async () => {
    setSharing("kakao");
    try {
      const success = await shareToKakao({
        clubName,
        tableInfo,
        startPrice,
        auctionUrl,
        thumbnailUrl,
        listingType: listingType || "auction",
        isFromMD: true,
        area: areaName,
        eventDate,
      });
      if (!success) {
        toast.error("카카오톡 공유에 실패했습니다");
      }
    } finally {
      setSharing(null);
    }
  };

  const handleInstagramShare = async () => {
    setSharing("instagram");
    try {
      await shareToInstagram(auctionId, imageBlob, clubName, auctionUrl, referralCode);
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

  const handleGoToDashboard = () => {
    onOpenChange(false);
    router.push("/md/dashboard");
  };

  const handleDrawerClose = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      router.push("/md/dashboard");
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
      available: kakaoAvailable,
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
      iconColor: "text-neutral-400",
      bgColor: "bg-neutral-800/50 border-neutral-700/30",
      handler: handleWebShare,
      available: typeof navigator !== "undefined" && !!navigator.share,
    },
  ];

  const visibleOptions = shareOptions.filter((opt) => opt.available);

  return (
    <Drawer open={isOpen} onOpenChange={handleDrawerClose}>
      <DrawerContent className="bg-[#1C1C1E] border-neutral-800 outline-none px-6 pb-10">
        <DrawerHeader className="text-center space-y-3 pt-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <PartyPopper className="w-8 h-8 text-green-500" />
            </div>
          </div>
          <DrawerTitle className="text-white font-black text-2xl tracking-tight">
            경매등록 성공!
          </DrawerTitle>
          <DrawerDescription className="text-neutral-400 font-medium text-[14px]">
            지금 바로 공유해서 더 많은 입찰자를 모아보세요!
          </DrawerDescription>
        </DrawerHeader>

        {/* 공유 버튼 그리드 */}
        <div className={`grid gap-3 mt-6 ${visibleOptions.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
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
                <div className="w-10 h-10 rounded-full bg-neutral-900/50 flex items-center justify-center">
                  <Icon className={`w-5 h-5 ${opt.iconColor}`} />
                </div>
                <span className="text-[11px] font-bold text-neutral-300">
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
              className="w-full h-14 rounded-2xl border-green-500/30 text-green-400 font-black text-base hover:bg-green-950/20 hover:border-green-400 flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-5 h-5" />
              다른 테이블도 등록하기
            </Button>
          )}
          <Button
            onClick={handleGoToDashboard}
            className="w-full h-14 rounded-2xl bg-white text-black font-black text-base hover:bg-neutral-200 flex items-center justify-center gap-2"
          >
            대시보드로 이동
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
