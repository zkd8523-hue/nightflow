"use client";

import { useState, useEffect, useRef } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { MessageCircle, Instagram, Link2, Share2 } from "lucide-react";

import { shareAuction, shareToInstagram, copyAuctionLink } from "@/lib/utils/share";
import { useKakaoShare } from "@/hooks/useKakaoShare";
import { formatEventDate } from "@/lib/utils/format";
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
  const { shareToKakao, isAvailable: kakaoAvailable } = useKakaoShare();
  const [sharing, setSharing] = useState<string | null>(null);

  const club = auction.club;
  const clubName = club?.name || "클럽";
  const tableInfo = auction.table_info || "";

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
      ? `${window.location.origin}/auctions/${auction.id}`
      : "";

  const shareImageUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/auctions/${auction.id}/share-image`
      : "";

  const handleKakaoShare = async () => {
    setSharing("kakao");
    try {
      await shareToKakao({
        clubName,
        tableInfo,
        startPrice: auction.start_price,
        auctionUrl,
        shareImageUrl,
      });
    } finally {
      setSharing(null);
    }
  };

  const handleInstagramShare = async () => {
    setSharing("instagram");
    try {
      await shareToInstagram(auction.id, imageBlob, clubName, auctionUrl);
    } finally {
      setSharing(null);
    }
  };

  const handleCopyLink = async () => {
    setSharing("link");
    try {
      await copyAuctionLink(auction.id);
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
        startPrice: auction.start_price,
        tableInfo,
      });
    } finally {
      setSharing(null);
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
    <Drawer open={isOpen} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-[#1C1C1E] border-neutral-800 outline-none px-6 pb-10">
        <DrawerHeader className="text-center pt-4 pb-0">
          <DrawerTitle className="text-white font-black text-lg tracking-tight">
            이 경매를 공유하세요
          </DrawerTitle>
          <DrawerDescription className="text-neutral-500 text-[13px] font-medium">
            {clubName} · {tableInfo} · {formatEventDate(auction.event_date)}
          </DrawerDescription>
        </DrawerHeader>

        <div
          className={`grid gap-3 mt-5 ${
            visibleOptions.length === 4 ? "grid-cols-4" : "grid-cols-3"
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
