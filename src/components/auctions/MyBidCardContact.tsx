"use client";

import { useState } from "react";
import { useCountdown } from "@/hooks/useCountdown";
import { ContactTimer } from "./ContactTimer";
import { ContactButton } from "./ContactButton";
import { AlertCircle, ShieldCheck } from "lucide-react";

interface MyBidCardContactProps {
  auction: {
    id: string;
    contact_deadline: string | null;
    contact_attempted_at?: string | null;
    table_info: string | null;
    current_bid: number;
    event_date: string;
    entry_time: string | null;
    deposit_required?: boolean;
    deposit_amount?: number | null;
    club: { name: string } | null;
    md: {
      name: string | null;
      phone: string | null;
      instagram: string | null;
    } | null;
  };
}

export function MyBidCardContact({ auction }: MyBidCardContactProps) {
  const [contactAttempted, setContactAttempted] = useState(
    !!auction.contact_attempted_at
  );
  const { remaining } = useCountdown(auction.contact_deadline);
  const isExpired = !auction.contact_deadline || remaining <= 0;
  const md = auction.md;

  // 연락 완료 상태 (버튼 클릭 후 자동 contacted 전환됨)
  if (contactAttempted) {
    return (
      <div className="space-y-3">
        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-3 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-green-500 shrink-0" />
          <div>
            <p className="text-green-400 font-bold text-sm">연락 완료</p>
            <p className="text-neutral-500 text-[11px]">방문 시간에 맞춰 클럽을 방문해주세요.</p>
          </div>
        </div>

        <div className="bg-neutral-900/50 border border-neutral-800/50 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-neutral-700 border border-neutral-600 flex items-center justify-center text-xs font-bold text-neutral-400">
              {md?.name?.substring(0, 1) || "M"}
            </div>
            <div>
              <span className="text-white font-bold text-sm">{md?.name || "담당 MD"}</span>
              <p className="text-[11px] text-neutral-500">연락이 안 되셨나요? 다시 시도해주세요.</p>
            </div>
          </div>
          {md?.instagram && (
            <ContactButton
              auctionId={auction.id}
              type="dm"
              url={`https://instagram.com/${md.instagram}`}
              clubName={auction.club?.name}
              tableInfo={auction.table_info}
              currentBid={auction.current_bid}
              eventDate={auction.event_date}
              entryTime={auction.entry_time}
              depositRequired={auction.deposit_required}
              depositAmount={auction.deposit_amount}
            />
          )}
          {md?.phone && (
            <ContactButton
              auctionId={auction.id}
              type="phone"
              url={`tel:${md.phone}`}
            />
          )}
        </div>
      </div>
    );
  }

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
        <ContactTimer deadline={auction.contact_deadline} />
      </div>

      {/* Contact Buttons: DM → 전화 */}
      {md?.instagram && (
        <ContactButton
          auctionId={auction.id}
          type="dm"
          url={`https://instagram.com/${md.instagram}`}
          clubName={auction.club?.name}
          tableInfo={auction.table_info}
          currentBid={auction.current_bid}
          eventDate={auction.event_date}
          entryTime={auction.entry_time}
          depositRequired={auction.deposit_required}
          depositAmount={auction.deposit_amount}
          onContact={() => setContactAttempted(true)}
        />
      )}
      {md?.phone && (
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
