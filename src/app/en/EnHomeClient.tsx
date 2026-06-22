"use client";

import { useState } from "react";
import Link from "next/link";
import { FaqTab } from "./FaqTab";
import { ChevronLeft, Flag, HelpCircle, Map } from "lucide-react";

type Tab = "flags" | "qa" | "map";

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

const AREA_EN: Record<string, string> = {
  "서울 어디든": "Anywhere in Seoul",
  강남: "Gangnam", 홍대: "Hongdae", 이태원: "Itaewon",
  건대: "Konkuk", 부산: "Busan", 대구: "Daegu",
  인천: "Incheon", 광주: "Gwangju", 대전: "Daejeon",
  울산: "Ulsan", 세종: "Sejong",
};

function formatEventDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const sameDay = (a: Date, b: Date) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();
  if (sameDay(date, today)) return "Tonight";
  if (sameDay(date, tomorrow)) return "Tomorrow";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatBudget(total: number | null, perPerson: number, count: number): string {
  const amt = total ?? perPerson * count;
  if (amt >= 1000000) return `₩${(amt / 1000000).toFixed(1)}M`;
  if (amt >= 1000) return `₩${Math.round(amt / 1000)}K`;
  return `₩${amt.toLocaleString()}`;
}

// ── 피드 행 ──────────────────────────────────────────────────────
function FlagRow({ flag }: { flag: FlagItem }) {
  const area = AREA_EN[flag.area] ?? flag.area;
  const date = formatEventDate(flag.event_date);
  const budget = formatBudget(flag.total_budget, flag.budget_per_person, flag.target_count);
  const isSelecting = flag.status === "selecting";
  return (
    <div className="rounded-2xl bg-[#1C1C1E] border border-neutral-800 p-4">
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
      {/* notes는 한글일 수 있어 /en에서 노출 안 함 */}
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
}

// ── Flags 탭 ─────────────────────────────────────────────────────
const PREVIEW_COUNT = 3;

function FlagsTab({ flags }: { flags: FlagItem[] }) {
  const [showAll, setShowAll] = useState(false);
  const visibleFlags = showAll ? flags : flags.slice(0, PREVIEW_COUNT);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* All flags */}
      <div className="px-4 pt-4 pb-6 space-y-3">
        {flags.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <p className="text-neutral-500 text-[14px]">No active flags right now.</p>
            <Link
              href="/flags/new?lang=en"
              className="px-6 py-3 rounded-full bg-white text-black font-black text-[14px] hover:bg-neutral-200 transition-colors"
            >
              🚩 Be the first — plant your flag
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-black text-neutral-300 uppercase tracking-widest">All flags</p>
              {flags.length > PREVIEW_COUNT && (
                <button
                  onClick={() => setShowAll((v) => !v)}
                  className="flex items-center gap-0.5 -mr-2 px-2 py-1.5 text-[12px] text-neutral-400 hover:text-white font-bold rounded-lg hover:bg-white/5 transition-colors"
                >
                  {showAll ? "Collapse" : "See all"}
                  <ChevronLeft className={`w-3.5 h-3.5 transition-transform ${showAll ? "rotate-90" : "-rotate-90"}`} />
                </button>
              )}
            </div>
            {visibleFlags.map((f) => <FlagRow key={f.id} flag={f} />)}
          </>
        )}
      </div>

      {/* How it works */}
      <div className="px-4 pb-6 space-y-3">
        <p className="text-[13px] font-black text-neutral-300 uppercase tracking-widest">How it works</p>
        {[
          { n: "1", title: "Tell us your night", body: "Date, budget, how many of you. No need to know a single club name." },
          { n: "2", title: "Top clubs compete for you", body: "Seoul's best clubs send you private VIP offers — real tables, real prices. They compete; you pick." },
          { n: "3", title: "Walk in like a VIP", body: "Best table booked, no line, no broker. Show your passport at the door (19+)." },
        ].map((s) => (
          <div key={s.n} className="flex gap-3 p-4 rounded-2xl bg-[#1C1C1E] border border-neutral-800">
            <div className="shrink-0 w-7 h-7 rounded-full bg-white text-black font-black text-[12px] flex items-center justify-center">{s.n}</div>
            <div className="space-y-0.5">
              <p className="font-bold text-[14px]">{s.title}</p>
              <p className="text-[12px] text-neutral-500 leading-relaxed">{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Price guide */}
      <div className="px-4 pb-6 space-y-3">
        <p className="text-[13px] font-black text-neutral-300 uppercase tracking-widest">What a night costs</p>
        {[
          { icon: "🎟️", label: "Just get in", price: "₩20,000–30,000 pp", desc: "Entry + first drink. Quick night on the dance floor." },
          { icon: "👑", label: "The full VIP", price: "₩500,000+", desc: "Prime table, bottle service, staff looking after you all night." },
        ].map((t) => (
          <div key={t.label} className="flex gap-3 p-4 rounded-2xl bg-[#1C1C1E] border border-neutral-800">
            <span className="shrink-0 text-2xl leading-none pt-0.5">{t.icon}</span>
            <div className="flex-1 space-y-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-bold text-[14px]">{t.label}</p>
                <p className="font-black text-[13px] text-amber-400 whitespace-nowrap">{t.price}</p>
              </div>
              <p className="text-[12px] text-neutral-500 leading-relaxed">{t.desc}</p>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-green-500/10 border border-green-500/20">
          <span className="text-green-400 text-[15px]">✓</span>
          <p className="text-[12px] font-bold text-green-400">
            Zero platform fee — you pay the club directly, nothing to us.
          </p>
        </div>
        <p className="text-[12px] text-neutral-500 text-center leading-relaxed">
          Set your budget when you plant a flag — clubs send offers that match.
        </p>
      </div>

      {/* Safety tips */}
      <div className="px-4 pb-6 space-y-3">
        <p className="text-[13px] font-black text-neutral-300 uppercase tracking-widest">Know before you go</p>
        {[
          {
            title: "🚩 Common scams to watch for",
            items: [
              '"Free entry" traps — lured in free, then blocked until you pay huge fees.',
              "Hidden prices — no menu; foreigners charged several times the real price.",
              'Fake promoters — DMs offering "reservations," pocketing far more than real price.',
            ],
          },
          {
            title: "🛡️ How to protect yourself",
            items: [
              "Don't follow street touts handing out \"free entry\" cards.",
              "Always check a printed price menu. Pay upfront, per order.",
              "Police — 112 · Tourist Complaint Center — 1330 (English OK).",
            ],
          },
        ].map((t) => (
          <details key={t.title} className="group rounded-2xl bg-[#1C1C1E] border border-neutral-800 overflow-hidden">
            <summary className="flex items-center justify-between gap-3 p-4 cursor-pointer list-none select-none">
              <span className="font-bold text-[14px]">{t.title}</span>
              <span className="text-neutral-500 group-open:rotate-180 transition-transform text-[12px]">▾</span>
            </summary>
            <div className="px-4 pb-4 space-y-2">
              {t.items.map((it, i) => (
                <p key={i} className="text-[12px] text-neutral-400 leading-relaxed">• {it}</p>
              ))}
            </div>
          </details>
        ))}
      </div>

      {/* Bottom CTA */}
      <div className="px-4 pb-10 space-y-3">
        <Link
          href="/flags/new?lang=en"
          className="block w-full py-4 rounded-xl bg-white text-black font-black text-[15px] text-center hover:bg-neutral-200 transition-colors"
        >
          🚩 Plant your flag — get VIP offers
        </Link>
        <p className="text-center text-[11px] text-neutral-600 leading-relaxed">
          19+ only · Bring your passport to the venue.<br />Make the night more beautiful.
        </p>
      </div>
    </div>
  );
}

// ── Map 탭 ───────────────────────────────────────────────────────
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

// ── Main ─────────────────────────────────────────────────────────
export function EnHomeClient({ flags }: { flags: FlagItem[] }) {
  const [tab, setTab] = useState<Tab>("flags");

  const tabs: { code: Tab; label: string; icon: React.ReactNode }[] = [
    { code: "flags", label: "Flags", icon: <Flag className="w-4 h-4" /> },
    { code: "qa",    label: "Q&A",   icon: <HelpCircle className="w-4 h-4" /> },
    { code: "map",   label: "Map",   icon: <Map className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#0A0A0A] text-white max-w-lg mx-auto">
      {/* 헤더 */}
      <header className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between border-b border-neutral-800">
        {tab === "flags" ? (
          <div>
            <span className="text-[17px] font-black tracking-tight">NightFlow</span>
            <p className="text-[11px] text-neutral-500 leading-none mt-0.5">Make the night more beautiful</p>
          </div>
        ) : (
          <button
            onClick={() => setTab("flags")}
            className="flex items-center gap-1 -ml-1 px-2 py-1.5 rounded-lg text-white hover:bg-neutral-800 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-[15px] font-black">NightFlow</span>
          </button>
        )}
        <Link
          href="/flags/new?lang=en"
          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber-500 text-black font-black text-[13px] hover:bg-amber-400 transition-colors"
        >
          + Flag
        </Link>
      </header>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === "flags" && <FlagsTab flags={flags} />}
        {tab === "qa" && <FaqTab />}
        {tab === "map" && <MapTab />}
      </div>

      {/* 하단 탭 바 */}
      <nav className="shrink-0 border-t border-neutral-800 bg-[#0A0A0A] grid grid-cols-3">
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
