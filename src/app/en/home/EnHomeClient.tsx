"use client";

import { useState } from "react";
import Link from "next/link";
import { ChatRoom } from "@/components/chat/ChatRoom";
import { Flag, MessageSquare, Map } from "lucide-react";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────
type Tab = "flags" | "chat" | "map";

type FlagItem = {
  id: string;
  area: string;
  event_date: string;
  budget_per_person: number;
  total_budget: number | null;
  target_count: number;
  current_count: number;
  target_male: number;
  target_female: number;
  status: string;
  gender_pref: string;
  notes: string | null;
  leader?: { display_name: string | null; name: string | null; country_code: string | null } | null;
  offerCount: number;
};

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────
const AREA_EN: Record<string, string> = {
  강남: "Gangnam", 홍대: "Hongdae", 이태원: "Itaewon",
  건대: "Konkuk", 부산: "Busan", 대구: "Daegu",
  인천: "Incheon", 광주: "Gwangju", 대전: "Daejeon",
};

function formatEventDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const sameDay = (a: Date, b: Date) =>
    a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (sameDay(date, today)) return "Tonight";
  if (sameDay(date, tomorrow)) return "Tomorrow";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatBudget(total: number | null, perPerson: number, count: number): string {
  const amt = total ?? perPerson * count;
  if (amt >= 1000000) return `₩${(amt / 1000000).toFixed(1)}M`;
  if (amt >= 10000) return `₩${Math.round(amt / 10000)}만`;
  return `₩${amt.toLocaleString()}`;
}

// ────────────────────────────────────────────────────────────────
// Flag Card (carousel item)
// ────────────────────────────────────────────────────────────────
function FlagCard({ flag }: { flag: FlagItem }) {
  const area = AREA_EN[flag.area] ?? flag.area;
  const date = formatEventDate(flag.event_date);
  const budget = formatBudget(flag.total_budget, flag.budget_per_person, flag.target_count);
  const isSelecting = flag.status === "selecting";

  return (
    <div className="shrink-0 w-[200px] rounded-2xl bg-[#1C1C1E] border border-neutral-800 p-4 space-y-3 snap-start">
      {/* 지역 + 상태 */}
      <div className="flex items-start justify-between gap-1">
        <div>
          <p className="font-black text-[15px] leading-tight">{area}</p>
          <p className="text-[12px] text-neutral-400 mt-0.5">{date}</p>
        </div>
        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 ${
          isSelecting
            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
            : "bg-green-500/20 text-green-400 border border-green-500/30"
        }`}>
          {isSelecting ? "Reviewing" : "Open"}
        </span>
      </div>

      {/* 예산 */}
      <p className="text-[18px] font-black text-amber-400">{budget}</p>

      {/* 인원 */}
      <div className="text-[12px] text-neutral-400">
        {flag.target_male > 0 || flag.target_female > 0 ? (
          <span>
            {flag.target_male > 0 && <span className="text-blue-400 font-bold">{flag.target_male}M</span>}
            {flag.target_male > 0 && flag.target_female > 0 && <span className="text-neutral-600"> + </span>}
            {flag.target_female > 0 && <span className="text-pink-400 font-bold">{flag.target_female}F</span>}
          </span>
        ) : (
          <span className="font-bold text-white">{flag.target_count} ppl</span>
        )}
        {flag.offerCount > 0 && (
          <span className="ml-2 text-neutral-500">· {flag.offerCount} offer{flag.offerCount !== 1 ? "s" : ""}</span>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Flags Tab
// ────────────────────────────────────────────────────────────────
function FlagsTab({ flags }: { flags: FlagItem[] }) {
  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div>
          <h2 className="text-[18px] font-black">🚩 Active Flags</h2>
          <p className="text-[12px] text-neutral-500 mt-0.5">
            {flags.length} group{flags.length !== 1 ? "s" : ""} waiting for club offers
          </p>
        </div>
        <Link
          href="/puzzle/new?lang=en"
          className="px-4 py-2 rounded-full bg-white text-black text-[12px] font-black hover:bg-neutral-200 transition-colors"
        >
          + Plant yours
        </Link>
      </div>

      {/* 캐러셀 */}
      {flags.length > 0 ? (
        <div className="px-4 pb-4 overflow-x-auto flex gap-3 snap-x snap-mandatory no-scrollbar">
          {flags.map((f) => <FlagCard key={f.id} flag={f} />)}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-neutral-500 text-[14px]">No active flags right now.</p>
          <Link
            href="/puzzle/new?lang=en"
            className="px-6 py-3 rounded-full bg-white text-black font-black text-[14px] hover:bg-neutral-200 transition-colors"
          >
            🚩 Be the first — plant your flag
          </Link>
        </div>
      )}

      {/* 전체 피드 + 가이드 */}
      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-6">
        {/* All flags 목록 */}
        {flags.length > 0 && (
          <div className="space-y-3">
            <p className="text-[11px] text-neutral-600 font-bold uppercase tracking-widest pt-2">All flags</p>
            {flags.map((flag) => {
            const area = AREA_EN[flag.area] ?? flag.area;
            const date = formatEventDate(flag.event_date);
            const budget = formatBudget(flag.total_budget, flag.budget_per_person, flag.target_count);
            const isSelecting = flag.status === "selecting";
            return (
              <div key={flag.id} className="rounded-2xl bg-[#1C1C1E] border border-neutral-800 p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span className="font-black text-[15px]">{area}</span>
                    <span className="text-neutral-500 text-[13px] ml-2">· {date}</span>
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isSelecting
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      : "bg-green-500/20 text-green-400 border border-green-500/30"
                  }`}>
                    {isSelecting ? "Reviewing" : "Open"}
                  </span>
                </div>
                {flag.notes && (
                  <p className="text-[12px] text-neutral-500 mb-2 line-clamp-1">{flag.notes}</p>
                )}
                <div className="flex items-center gap-3 text-[13px]">
                  <span className="font-black text-amber-400">{budget}</span>
                  <span className="text-neutral-700">·</span>
                  <span className="text-neutral-300">
                    {flag.target_male > 0 || flag.target_female > 0 ? (
                      <>
                        {flag.target_male > 0 && <span className="text-blue-400 font-bold">{flag.target_male}M</span>}
                        {flag.target_male > 0 && flag.target_female > 0 && <span className="text-neutral-600"> + </span>}
                        {flag.target_female > 0 && <span className="text-pink-400 font-bold">{flag.target_female}F</span>}
                      </>
                    ) : (
                      <span className="font-bold">{flag.target_count} ppl</span>
                    )}
                  </span>
                  {flag.offerCount > 0 && (
                    <>
                      <span className="text-neutral-700">·</span>
                      <span className="text-neutral-500">{flag.offerCount} offer{flag.offerCount !== 1 ? "s" : ""}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Map Tab
// ────────────────────────────────────────────────────────────────
function MapTab() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
        <Map className="w-8 h-8 text-blue-400" />
      </div>
      <div className="space-y-2">
        <h3 className="text-[18px] font-black">Seoul Club Map</h3>
        <p className="text-[13px] text-neutral-500 leading-relaxed">
          Browse clubs in Gangnam, Hongdae, and Itaewon.<br />
          See menus, ratings, and opening hours.
        </p>
      </div>
      <div className="w-full space-y-3">
        <Link
          href="/en/clubs"
          className="block w-full py-4 rounded-xl bg-white text-black font-black text-[15px] hover:bg-neutral-200 transition-colors"
        >
          🗺️ Open club map
        </Link>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Gangnam", emoji: "🔥", count: "12 clubs" },
            { label: "Hongdae", emoji: "🎵", count: "8 clubs" },
            { label: "Itaewon", emoji: "🌍", count: "5 clubs" },
          ].map((area) => (
            <div key={area.label} className="rounded-xl bg-[#1C1C1E] border border-neutral-800 p-3 text-center">
              <p className="text-xl mb-1">{area.emoji}</p>
              <p className="text-[12px] font-bold text-white">{area.label}</p>
              <p className="text-[10px] text-neutral-500">{area.count}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────
export function EnHomeClient({ flags }: { flags: FlagItem[] }) {
  const [tab, setTab] = useState<Tab>("flags");

  const tabs: { code: Tab; label: string; icon: React.ReactNode }[] = [
    { code: "flags", label: "Flags", icon: <Flag className="w-4 h-4" /> },
    { code: "chat",  label: "Chat",  icon: <MessageSquare className="w-4 h-4" /> },
    { code: "map",   label: "Map",   icon: <Map className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#0A0A0A] text-white max-w-lg mx-auto">
      {/* 상단 헤더 */}
      <header className="shrink-0 px-4 pt-safe-top pt-3 pb-2 flex items-center justify-between border-b border-neutral-800">
        <span className="text-[17px] font-black tracking-tight">NightFlow</span>
        <Link
          href="/en"
          className="text-[11px] text-neutral-500 hover:text-white transition-colors"
        >
          🌍 About
        </Link>
      </header>

      {/* 콘텐츠 영역 */}
      <div className="flex-1 overflow-hidden">
        {tab === "flags" && <FlagsTab flags={flags} />}
        {tab === "chat" && (
          <ChatRoom
            room="foreigner"
            onAreaVerified={() => {}}
          />
        )}
        {tab === "map" && <MapTab />}
      </div>

      {/* 하단 탭 바 */}
      <nav className="shrink-0 border-t border-neutral-800 bg-[#0A0A0A] pb-safe-bottom grid grid-cols-3">
        {tabs.map(({ code, label, icon }) => (
          <button
            key={code}
            onClick={() => setTab(code)}
            className={`flex flex-col items-center gap-1 py-3 text-[10px] font-bold transition-colors ${
              tab === code ? "text-white" : "text-neutral-600 hover:text-neutral-400"
            }`}
          >
            <span className={tab === code ? "text-white" : "text-neutral-600"}>{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
