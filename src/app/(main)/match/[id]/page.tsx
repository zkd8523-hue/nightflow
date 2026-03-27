import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { formatPrice, formatEventDate, formatEntryTime } from "@/lib/utils/format";
import { CheckCircle2, Calendar, MapPin, Ticket, Shield } from "lucide-react";

interface MatchPageProps {
  params: Promise<{ id: string }>;
}

async function getAuctionData(auctionId: string) {
  const supabase = createAdminClient();

  const { data: auction } = await supabase
    .from("auctions")
    .select(`
      id, title, table_info, event_date, entry_time, winning_price, current_bid, status,
      winner_id, won_at, includes, deposit_required, deposit_amount,
      club:club_id (name, area),
      winner:winner_id (name)
    `)
    .eq("id", auctionId)
    .in("status", ["won", "contacted", "confirmed"])
    .single();

  return auction;
}

export async function generateMetadata({ params }: MatchPageProps): Promise<Metadata> {
  const { id } = await params;
  const auction = await getAuctionData(id);

  if (!auction) {
    return { title: "NightFlow - 낙찰 확인" };
  }

  const club = auction.club as unknown as { name: string; area: string } | null;
  const clubName = club?.name || "클럽";
  const area = club?.area || "";
  const price = formatPrice(auction.winning_price || auction.current_bid);
  const tableInfo = auction.table_info || "";
  const eventDate = formatEventDate(auction.event_date);
  const includes = (auction.includes || []).slice(0, 2).join(" · ");

  const title = `NightFlow 낙찰 확인 | ${clubName}`;
  const description = `${area} ${clubName} | ${tableInfo} | ${price} | ${eventDate}${includes ? ` | ${includes}` : ""}`;

  return {
    title,
    description,
    openGraph: {
      title: `NightFlow 낙찰 확인`,
      description,
      siteName: "NightFlow",
      type: "website",
    },
  };
}

export default async function MatchPage({ params }: MatchPageProps) {
  const { id } = await params;
  const auction = await getAuctionData(id);

  if (!auction) {
    notFound();
  }

  const club = auction.club as unknown as { name: string; area: string } | null;
  const winner = auction.winner as unknown as { name: string } | null;
  const price = auction.winning_price || auction.current_bid;
  const includes = auction.includes || [];

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="max-w-sm w-full">
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/10 px-6 py-5 border-b border-neutral-800/50">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <span className="text-green-500 font-black text-sm tracking-wide">낙찰 확인됨</span>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-5 space-y-4">
            {/* Club */}
            <div>
              <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">클럽</p>
              <h1 className="text-2xl font-black text-white tracking-tight mt-0.5">{club?.name}</h1>
              <div className="flex items-center gap-1 mt-1">
                <MapPin className="w-3 h-3 text-neutral-500" />
                <span className="text-xs text-neutral-500 font-bold">{club?.area}</span>
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-neutral-900/50 rounded-xl p-3 border border-neutral-800/30">
                <p className="text-[9px] text-neutral-500 font-bold uppercase">테이블</p>
                <p className="text-sm font-black text-white mt-0.5">{auction.table_info || "-"}</p>
              </div>
              <div className="bg-neutral-900/50 rounded-xl p-3 border border-neutral-800/30">
                <p className="text-[9px] text-neutral-500 font-bold uppercase">낙찰가</p>
                <p className="text-sm font-black text-green-500 mt-0.5">{formatPrice(price)}</p>
              </div>
            </div>

            {/* Deposit Info */}
            <div className="bg-neutral-900/50 rounded-xl p-3 border border-neutral-800/30 flex items-center gap-3">
              <Shield className="w-4 h-4 text-neutral-500" />
              <div>
                <p className="text-[9px] text-neutral-500 font-bold uppercase">보증금</p>
                {auction.deposit_required ? (
                  <p className="text-sm font-bold text-green-400">
                    {formatPrice(auction.deposit_amount || 30000)} 결제 완료 · 잔금 {formatPrice(price - (auction.deposit_amount || 30000))}
                  </p>
                ) : (
                  <p className="text-sm font-bold text-neutral-400">없음 · 현장 결제</p>
                )}
              </div>
            </div>

            {/* Event Date */}
            <div className="bg-neutral-900/50 rounded-xl p-3 border border-neutral-800/30 flex items-center gap-3">
              <Calendar className="w-4 h-4 text-neutral-500" />
              <div>
                <p className="text-[9px] text-neutral-500 font-bold uppercase">방문 일정</p>
                <p className="text-sm font-bold text-white">{formatEventDate(auction.event_date)}</p>
                <p className="text-xs font-bold text-blue-400 mt-0.5">{formatEntryTime(auction.entry_time, auction.event_date)}</p>
              </div>
            </div>

            {/* Includes */}
            {includes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {includes.slice(0, 4).map((item: string) => (
                  <span key={item} className="px-2 py-1 rounded-md text-[10px] font-bold bg-neutral-800/50 text-neutral-400 border border-neutral-700/30">
                    {item}
                  </span>
                ))}
                {includes.length > 4 && (
                  <span className="text-[10px] text-neutral-500 font-bold self-center">+{includes.length - 4}</span>
                )}
              </div>
            )}

            {/* Winner */}
            {winner && (
              <div className="flex items-center gap-2 pt-2 border-t border-neutral-800/30">
                <Ticket className="w-3.5 h-3.5 text-neutral-500" />
                <span className="text-[11px] text-neutral-500 font-bold">낙찰자: {winner.name}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 bg-neutral-900/30 border-t border-neutral-800/30">
            <p className="text-[10px] text-neutral-600 font-medium text-center">
              NightFlow 서버에서 검증된 낙찰 정보입니다
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
