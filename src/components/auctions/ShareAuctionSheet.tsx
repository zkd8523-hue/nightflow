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
import { MessageCircle, Instagram, Link2, Share2, Camera } from "lucide-react";

import { shareAuction, copyAuctionLink, appendReferralCode } from "@/lib/utils/share";
import { useReferralCode } from "@/hooks/useReferralCode";
import { useAuthStore } from "@/stores/useAuthStore";
import { formatEventDate, formatEntryTime } from "@/lib/utils/format";
import type { Auction } from "@/types/database";

interface ShareAuctionSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  auction: Auction;
}

export function ShareAuctionSheet({
  isOpen,
  onOpenChange,
  auction,
}: ShareAuctionSheetProps) {
  const router = useRouter();
  const referralCode = useReferralCode();
  const currentUser = useAuthStore((s) => s.user);
  const isFromMD = currentUser?.id === auction.md_id;
  const [sharing, setSharing] = useState<string | null>(null);

  const club = auction.club;
  const clubName = club?.name || "클럽";
  const tableInfo = auction.table_info || "";
  const isShareListing = auction.listing_type === "share";


  // 이미지 Blob prefetch (User Gesture 만료 방지)
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen || !auction.id) return;

    let cancelled = false;
    const fetchImage = async () => {
      try {
        const res = await fetch(`/api/auctions/${auction.id}/share-image`);
        if (!res.ok) return;
        const blob = await res.blob();
        if (cancelled) return;
        setImageBlob(blob);
        blobUrlRef.current = URL.createObjectURL(blob);
      } catch {
        // 이미지 로딩 실패 시 무시
      }
    };
    fetchImage();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, [isOpen, auction.id]);

  const auctionUrl =
    typeof window !== "undefined"
      ? appendReferralCode(`${window.location.origin}/auctions/${auction.id}`, referralCode)
      : "";

  const shareImageUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/auctions/${auction.id}/share-image?format=kakao`
      : "";

  const handleKakaoShare = async () => {
    setSharing("kakao");
    try {
      // 깃발과 동일한 방식: OS 네이티브 공유 시트 → 사용자가 카카오톡 선택
      // Kakao SDK 직접 호출(sendDefault)은 imageUrl/도메인 검증 이슈로 4019 발생 가능
      const price = isShareListing ? (auction.price_per_seat ?? 0) : auction.start_price;
      const title = `${club?.area ? `[${club.area}] ` : ""}${clubName} ${isShareListing ? "조각 모집" : "테이블 경매"}`;
      const text = isShareListing
        ? `인당 ${price.toLocaleString()}원 · 자리 모집 중`
        : `시작가 ${price.toLocaleString()}원 · 입찰 진행 중`;
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ title, text, url: auctionUrl });
        } catch {
          // 사용자 취소 무시
        }
      } else {
        await copyAuctionLink(auction.id, referralCode);
      }
    } finally {
      setSharing(null);
    }
  };

  const handleInstagramShare = async () => {
    setSharing("instagram");
    try {
      const copied = await copyAuctionLink(auction.id, referralCode);
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
        // 토스트는 copyAuctionLink 내부에서 처리됨
      }
    } finally {
      setSharing(null);
    }
  };

  const handleCopyLink = async () => {
    setSharing("link");
    try {
      await copyAuctionLink(auction.id, referralCode);
    } finally {
      setSharing(null);
    }
  };

  const handleWebShare = async () => {
    setSharing("more");
    try {
      await shareAuction({
        auctionId: auction.id,
        clubName,
        eventDate: auction.event_date,
        entryTime: auction.entry_time,
        startPrice: auction.start_price,
        tableInfo,
        referralCode,
      });
    } finally {
      setSharing(null);
    }
  };

  const handleStoryCard = () => {
    router.push(`/share/auction/${auction.id}/story`);
  };

  const shareOptions = [
    {
      id: "story",
      label: "스토리 카드",
      icon: Camera,
      iconColor: "text-pink-400",
      bgColor: "bg-pink-500/10 border-pink-500/20",
      handler: handleStoryCard,
      available: isFromMD && !isShareListing,
    },
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
      label: "인스타",
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
    <Drawer open={isOpen} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-[#1C1C1E] border-neutral-800 outline-none px-6 pb-10">
        <DrawerHeader className="text-center pt-4 pb-0">
          <DrawerTitle className="text-white font-black text-lg tracking-tight">
            {auction.listing_type === "share" ? "같이 갈 친구 데려오기" : "이 경매를 공유하세요"}
          </DrawerTitle>
          <DrawerDescription className="text-neutral-500 text-[13px] font-medium">
            {auction.listing_type === "share"
              ? "카톡·링크 누르면 바로 복사돼요"
              : `${clubName} · ${tableInfo} · ${formatEventDate(auction.event_date)} ${formatEntryTime(auction.entry_time, auction.event_date)}`}
          </DrawerDescription>
        </DrawerHeader>

        <div
          className={`grid gap-3 mt-5 ${
            visibleOptions.length >= 5 ? "grid-cols-5" : visibleOptions.length === 4 ? "grid-cols-4" : "grid-cols-3"
          }`}
        >
          {visibleOptions.map((opt) => {
            const Icon = opt.icon;
            const isLoading = sharing === opt.id;
            return (
              <button
                key={opt.id}
                onClick={opt.handler}
                disabled={!!sharing}
                className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all active:scale-[0.95] ${opt.bgColor} ${
                  sharing && !isLoading ? "opacity-50" : ""
                }`}
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
      </DrawerContent>
    </Drawer>
  );
}
