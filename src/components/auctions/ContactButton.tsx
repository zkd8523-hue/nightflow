"use client";

import { Button } from "@/components/ui/button";
import { Phone, Instagram } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/utils/logger";
import { formatPrice, formatEventDate } from "@/lib/utils/format";
import { trackEvent } from "@/lib/analytics";

interface ContactButtonProps {
  auctionId: string;
  type: "dm" | "phone";
  url: string;
  clubName?: string;
  tableInfo?: string;
  currentBid?: number;
  eventDate?: string;
  entryTime?: string;
  onContact?: () => void;
}

function buildCopyMessage(auctionId: string, clubName?: string, tableInfo?: string, currentBid?: number, eventDate?: string, entryTime?: string): string | null {
  if (!clubName || !currentBid) return null;
  const matchUrl = `${window.location.origin}/match/${auctionId}`;
  const entry = entryTime ? `${entryTime} 입장` : "즉시 입장";
  return [
    `[NightFlow 낙찰 확인]`,
    `${clubName}${tableInfo ? ` · ${tableInfo}` : ""}`,
    `${formatPrice(currentBid)} · ${eventDate ? formatEventDate(eventDate) : ""} ${entry}`,
    ``,
    matchUrl,
  ].join("\n");
}

export function ContactButton({ auctionId, type, url, clubName, tableInfo, currentBid, eventDate, entryTime, onContact }: ContactButtonProps) {
  const handleClick = async () => {
    // 연락 시도 기록 (fire-and-forget)
    fetch("/api/auction/contact-attempt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auctionId }),
    }).catch(logger.error);

    onContact?.();
    trackEvent("contact_initiated", { auction_id: auctionId, contact_type: type });

    // DM: 구조화된 메시지 복사 후 이동
    if (type === "dm" && clubName && currentBid) {
      const message = buildCopyMessage(auctionId, clubName, tableInfo, currentBid, eventDate, entryTime);
      if (message) {
        try {
          await navigator.clipboard.writeText(message);
          toast.success("메시지가 복사되었습니다. 붙여넣기 해주세요!");
        } catch {
          toast.info("낙찰 정보를 공유해주세요.");
        }
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } else if (type === "dm") {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      window.location.href = url;
    }
  };

  if (type === "dm") {
    return (
      <Button
        onClick={handleClick}
        className="w-full h-auto py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:opacity-90 flex flex-col items-center gap-0.5"
      >
        <span className="flex items-center gap-2 font-black text-sm">
          <Instagram className="w-4 h-4" />
          DM
        </span>
        <span className="text-[11px] font-medium text-white/70">메시지 자동 복사</span>
      </Button>
    );
  }

  return (
    <Button
      onClick={handleClick}
      className="w-full h-11 bg-white text-black font-black text-sm rounded-xl flex items-center justify-center gap-2"
    >
      <Phone className="w-4 h-4" />
      전화
    </Button>
  );
}
