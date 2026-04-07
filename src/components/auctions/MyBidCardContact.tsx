"use client";

import { useState } from "react";
import { useCountdown } from "@/hooks/useCountdown";
import { ContactTimer } from "./ContactTimer";
import { ContactButton } from "./ContactButton";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { getVisibleContactMethods } from "@/lib/utils/contact-methods";
import type { ContactMethodType } from "@/types/database";

// 'connected' UI removed (Migration 086): once the user clicks a contact
// button, contact_deadline is cleared but the auction stays in 'won'. The
// timer simply disappears — no "연락 완료" badge.
//
// Migration 087: contact_deadline is now set dynamically by event proximity
// (3h for events 2+ days away, 30m for today/tomorrow). NULL deadline means
// "no timer applies" — never treat NULL as expired.

interface MyBidCardContactProps {
  auction: {
    id: string;
    contact_deadline: string | null;
    contact_attempted_at?: string | null;
    table_info: string | null;
    current_bid: number;
    event_date: string;
    entry_time: string | null;
    club: { name: string } | null;
    md: {
      name: string | null;
      phone: string | null;
      instagram: string | null;
      kakao_open_chat_url: string | null;
      preferred_contact_methods: ContactMethodType[] | null;
    } | null;
  };
}

export function MyBidCardContact({ auction }: MyBidCardContactProps) {
  const [contactAttempted, setContactAttempted] = useState(
    !!auction.contact_attempted_at
  );
  const { remaining } = useCountdown(auction.contact_deadline);
  // deadline이 없으면 시한 없음(만료 아님). 있으면서 0 이하일 때만 만료.
  // 단, 유저가 연락 버튼을 눌러 deadline이 nulled되었더라도 만료 처리하지 않음.
  const isExpired =
    !contactAttempted &&
    !!auction.contact_deadline &&
    remaining <= 0;
  const md = auction.md;
  const methods = getVisibleContactMethods(md);

  // 연락 시간 만료 (연락 시도 없이 타이머 끝남)
  if (isExpired) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 space-y-2 text-center">
        <AlertCircle className="w-5 h-5 text-red-500 mx-auto" />
        <p className="text-red-400 font-bold text-sm">연락 시간이 만료되었습니다</p>
        <p className="text-neutral-500 text-[11px]">차순위 낙찰자에게 넘어갑니다.</p>
      </div>
    );
  }

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-3">
      {/* MD Identity + Timer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-neutral-700 border border-neutral-600 flex items-center justify-center text-xs font-bold text-neutral-400">
              {md?.name?.substring(0, 1) || "M"}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-[#1C1C1E] flex items-center justify-center">
              <ShieldCheck className="w-2 h-2 text-white" />
            </div>
          </div>
          <div>
            <span className="text-white font-bold text-sm">{md?.name || "담당 MD"}</span>
            {md?.instagram && (
              <a href={`https://instagram.com/${md.instagram}`} target="_blank" rel="noopener noreferrer" className="block text-neutral-500 text-[11px] font-medium hover:text-neutral-300 transition-colors">@{md.instagram}</a>
            )}
          </div>
        </div>
        {!contactAttempted && <ContactTimer deadline={auction.contact_deadline} />}
      </div>

      {/* Contact Buttons */}
      {methods.includes("dm") && md?.instagram && (
        <ContactButton
          auctionId={auction.id}
          type="dm"
          url={`https://instagram.com/${md.instagram}`}
          clubName={auction.club?.name}
          tableInfo={auction.table_info}
          currentBid={auction.current_bid}
          eventDate={auction.event_date}
          entryTime={auction.entry_time}
          onContact={() => setContactAttempted(true)}
        />
      )}
      {methods.includes("kakao") && md?.kakao_open_chat_url && (
        <ContactButton
          auctionId={auction.id}
          type="kakao"
          url={md.kakao_open_chat_url}
          clubName={auction.club?.name}
          tableInfo={auction.table_info}
          currentBid={auction.current_bid}
          eventDate={auction.event_date}
          entryTime={auction.entry_time}
          onContact={() => setContactAttempted(true)}
        />
      )}
      {methods.includes("phone") && md?.phone && (
        <ContactButton
          auctionId={auction.id}
          type="phone"
          url={`tel:${md.phone}`}
          onContact={() => setContactAttempted(true)}
        />
      )}
    </div>
  );
}
