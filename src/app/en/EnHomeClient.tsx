"use client";

import { useState, useEffect, createContext, useContext, useRef } from "react";
import Link from "next/link";
import { type Lang, makeT, areaLabel } from "@/lib/i18n";
import { isFlagAreaOpen } from "@/lib/constants/areas";
import { FaqTab } from "./FaqTab";
import { ChevronLeft, ChevronDown, Info, Home, User, HelpCircle, Map, Check } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import { BusinessInfo } from "@/components/layout/BusinessInfo";
import { LangSwitcher } from "@/components/layout/LangSwitcher";
import { ForeignAppCta } from "@/components/layout/ForeignAppCta";
import { displayClubName } from "@/components/clubs/ForeignClubDetailPanel";

type Tab = "flags" | "my" | "qa" | "map";

type MyRequest = {
  id: string;
  area: string | null;
  event_date: string;
  status: string;
  budget: number | null;
  group_size: number;
};

type ClubItem = {
  id: string;
  name: string;
  name_en?: string | null;
  area: string;
  thumbnail_url: string | null;
  address?: string | null;
};

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

function formatAmount(amt: number): string {
  if (amt >= 1000000) return `₩${(amt / 1000000).toFixed(1)}M`;
  if (amt >= 1000) return `₩${Math.round(amt / 1000)}K`;
  return `₩${amt.toLocaleString()}`;
}

function formatBudget(total: number | null, perPerson: number, count: number): string {
  return formatAmount(total ?? perPerson * count);
}

// ── My requests (로그인 외국인 유저의 내 컨시어지 요청, foreign_requests 기반) ──
const MY_STATUS_LABEL: Record<string, { label: string; ja: string; zh: string; cls: string }> = {
  new: { label: "Received", ja: "受付済み", zh: "已收到", cls: "bg-green-500/20 text-green-400 border-green-500/30" },
  contacted: { label: "In progress", ja: "対応中", zh: "处理中", cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  done: { label: "Confirmed", ja: "確定", zh: "已确认", cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  cancelled: { label: "Cancelled", ja: "キャンセル", zh: "已取消", cls: "bg-neutral-700/40 text-neutral-400 border-neutral-700" },
};

// 언어 Context — 서버(page.tsx)에서 initialLang을 확정해 EnHomeClient에 prop 주입.
// 이전엔 각 하위 컴포넌트가 useTr() 안에서 useEffect로 lang을 뒤늦게 확정 → 첫 프레임 flash.
// 이제 EnHomeClient가 Provider로 lang을 내려 첫 렌더부터 정확한 언어.
const LangContext = createContext<Lang>("en");

function useTr() {
  const lang = useContext(LangContext);
  const t = makeT(lang);
  // tr: 영어 키로 사전 조회 / t: 명시적 (ko,en,ja,zh) — 동음이의어(예: 상태 "Open") 처리용
  return { lang, t, tr: (en: string) => t("", en) };
}

function MyRequestsTab() {
  const { user, isLoading } = useCurrentUser();
  const { lang, t, tr } = useTr();
  const [flags, setFlags] = useState<MyRequest[] | null>(null);

  useEffect(() => {
    if (!user) { setFlags(null); return; }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("foreign_requests")
        .select("id, area, event_date, status, budget, group_size")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (cancelled || !data) return;
      setFlags(data);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // 비로그인
  if (!isLoading && !user) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-[15px] font-bold text-neutral-300">{tr("Log in to see your requests")}</p>
        <p className="text-[13px] text-neutral-500">{tr("Track your requests and our replies.")}</p>
        <Link href={`/login?lang=${lang}`} className="px-7 py-3 rounded-full bg-white text-black font-black text-[14px] hover:bg-neutral-200 transition-colors">
          {tr("Log in")}
        </Link>
      </div>
    );
  }
  // 로딩 (로그인 + fetch 전)
  if (isLoading || flags === null) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[13px] text-neutral-500">{tr("Loading…")}</p>
      </div>
    );
  }
  // 로그인 + 깃발 없음
  if (flags.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-[15px] font-bold text-neutral-300">{tr("No requests yet")}</p>
        <p className="text-[13px] text-neutral-500">{tr("Pick a club & we'll book it for you.")}</p>
        <Link href={`/flags/new?lang=${lang}`} className="px-7 py-3 rounded-full bg-amber-500 text-black font-black text-[14px] hover:bg-amber-400 transition-colors">
          {tr("Book with NightFlow")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6 space-y-2.5">
      <p className="text-[13px] font-black text-neutral-300 uppercase tracking-widest">{tr("My requests")}</p>
      {flags.map((f) => {
        const area = f.area ? areaLabel(f.area, lang) : tr("Anywhere in Seoul");
        const date = formatEventDate(f.event_date);
        const budget = f.budget != null ? formatAmount(f.budget) : null;
        const st = MY_STATUS_LABEL[f.status] ?? MY_STATUS_LABEL.new;
        return (
          <div
            key={f.id}
            className="flex items-center justify-between gap-3 rounded-2xl bg-[#1C1C1E] border border-neutral-800 p-4"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-black text-[15px]">{area}</span>
                <span className="text-neutral-500 text-[12px]">· {date}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[13px]">
                {budget && <span className="font-black text-amber-400">{budget}</span>}
                <span className="text-neutral-500">{f.group_size} {tr("people")}</span>
              </div>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${st.cls}`}>
              {t("", st.label, st.ja, st.zh)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── 한국 깃발 캐러셀 카드 (우상단 🇰🇷 = 소셜 프루프) ───────────────
function FlagCarouselCard({ flag }: { flag: FlagItem }) {
  const { lang, tr } = useTr();
  const area = areaLabel(flag.area, lang);
  const date = formatEventDate(flag.event_date);
  const budget = formatBudget(flag.total_budget, flag.budget_per_person, flag.target_count);
  return (
    <Link
      href={`/flags/${flag.id}?lang=${lang}`}
      className="block shrink-0 w-[180px] rounded-2xl bg-[#1C1C1E] border border-neutral-800 p-4 snap-start active:opacity-70 transition-opacity"
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="font-black text-[15px] leading-tight truncate">{area}</p>
          <p className="text-[12px] text-neutral-400 mt-0.5">{date}</p>
        </div>
        {/* 우상단: 한국 국기 (한국인이 올린 깃발 표시) */}
        <span className="text-[18px] leading-none shrink-0">🇰🇷</span>
      </div>
      <p className="text-[18px] font-black text-amber-400 mt-3">{budget}</p>
      <div className="flex items-center gap-1.5 mt-1 text-[12px] text-neutral-400">
        <span className="font-bold text-white">{flag.target_count}{tr(" ppl")}</span>
        {flag.offerCount > 0 && (
          <>
            <span className="text-neutral-700">·</span>
            <span className="text-green-400 font-bold">{flag.offerCount} {tr("offers")}</span>
          </>
        )}
      </div>
    </Link>
  );
}

// ── 지역 섹션 (강남=프리미엄 / 홍대=자유) + 클럽 리스트 + 지역 버튼 ──
const REGIONS = [
  {
    ko: "강남",
    en: "Gangnam",
    emoji: "🍾",
    tagline: "Premium, luxury night",
  },
  {
    ko: "홍대",
    en: "Hongdae",
    emoji: "🎧",
    tagline: "Young, wild night",
  },
  {
    ko: "이태원",
    en: "Itaewon",
    emoji: "🌏",
    tagline: "Global, borderless night",
  },
] as const;

function ClubThumb({ club }: { club: ClubItem }) {
  const { lang, tr } = useTr();
  const name = displayClubName(club);
  // 클릭 시 클럽 페이지에서 해당 클럽 상세시트가 바로 열리도록 club 쿼리로 전달
  // (예전엔 #club-{id} 앵커 스크롤이었는데, 그 페이지가 카드 클릭=Sheet 오픈 방식으로 바뀌면서
  //  앵커 대상 엘리먼트가 없어져 그냥 목록만 보여주고 끝났음 — ClubsClient가 이 쿼리를 읽어 자동 오픈).
  return (
    <Link
      href={`/${lang}/clubs?club=${club.id}`}
      className="shrink-0 w-[120px] snap-start active:opacity-70 transition-opacity"
    >
      <div className="w-[120px] h-[80px] rounded-xl overflow-hidden bg-neutral-800 border border-neutral-800">
        {club.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={club.thumbnail_url} alt={name} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-600 text-[11px] font-bold">{tr("No image")}</div>
        )}
      </div>
      <p className="text-[12px] font-bold text-neutral-200 mt-1.5 truncate">{name}</p>
    </Link>
  );
}

function RegionSection({ clubs, bookCtaRef }: { clubs: ClubItem[]; bookCtaRef?: React.RefObject<HTMLAnchorElement | null> }) {
  const { lang, tr } = useTr();
  return (
    <div className="pt-5 pb-6 border-b border-neutral-900 space-y-5">
      <div className="px-4 flex items-center justify-between gap-2">
        <p className="text-[22px] font-black text-neutral-100 tracking-tight">{tr("Top clubs in Seoul")}</p>
        <Link
          href={`/${lang}/clubs`}
          className="shrink-0 text-[12px] font-bold text-amber-400 hover:text-amber-300 transition-colors whitespace-nowrap"
        >
          {tr("See all")} →
        </Link>
      </div>

      {REGIONS.map((r) => {
        const regionClubs = clubs.filter((c) => c.area === r.ko);
        return (
          <div key={r.ko} className="space-y-2.5">
            <div className="px-4">
              <p className="text-[15px] leading-snug">
                <span className="font-black">{r.emoji} {areaLabel(r.ko, lang)}</span>
                <span className="text-neutral-400 font-medium text-[13px]"> — {tr(r.tagline)}</span>
              </p>
            </div>
            {regionClubs.length > 0 && (
              <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 snap-x">
                {regionClubs.map((c) => <ClubThumb key={c.id} club={c} />)}
              </div>
            )}
          </div>
        );
      })}

      {/* 지역 버튼 → 해당 지역 깃발 등록 바로 */}
      <div className="px-4 space-y-2.5">
        <p className="text-center text-[13px] font-bold text-neutral-300">{tr("Which area do you want?")}</p>
        <div className="grid grid-cols-2 gap-3">
          {REGIONS.map((r) =>
            !isFlagAreaOpen(r.ko) ? (
              // 닫힌 지역: 준비중(선택 불가). 홈에서도 노출하되 등록 유도 안 함.
              <div
                key={r.ko}
                aria-disabled
                className="relative flex items-center justify-center py-4 rounded-2xl bg-[#1C1C1E] border border-neutral-800 opacity-50 cursor-not-allowed"
              >
                <span className="text-[16px] font-black">{areaLabel(r.ko, lang)}</span>
                <span className="absolute top-1.5 right-2.5 text-[10px] font-bold text-amber-400/80">
                  {tr("Soon")}
                </span>
              </div>
            ) : (
              <Link
                key={r.ko}
                href={`/flags/new?lang=${lang}&area=${encodeURIComponent(r.ko)}`}
                className="flex items-center justify-center py-4 rounded-2xl bg-[#1C1C1E] border border-neutral-800 hover:border-amber-500/50 active:scale-[0.98] transition-all"
              >
                <span className="text-[16px] font-black">{areaLabel(r.ko, lang)}</span>
              </Link>
            )
          )}
          {/* 서울 어디든: 가장 많은 오퍼 */}
          <Link
            href={`/flags/new?lang=${lang}&area=${encodeURIComponent("서울 어디든")}`}
            className="flex items-center justify-center py-4 rounded-2xl bg-[#1C1C1E] border border-neutral-800 hover:border-amber-500/50 active:scale-[0.98] transition-all"
          >
            <span className="text-[16px] font-black">{areaLabel("서울 어디든", lang)}</span>
          </Link>
        </div>
        <Link
          ref={bookCtaRef}
          href={`/flags/new?lang=${lang}`}
          className="block w-full mt-1 py-3.5 rounded-full bg-amber-500 text-black font-black text-[14px] text-center hover:bg-amber-400 active:scale-[0.98] transition-all"
        >
          {tr("Book with NightFlow")}
        </Link>
      </div>
    </div>
  );
}

// ── Flags 탭 ─────────────────────────────────────────────────────
function FlagsTab({ flags, clubs }: { flags: FlagItem[]; clubs: ClubItem[] }) {
  const { lang, tr } = useTr();
  // Sticky "Book with NightFlow" CTA: 원본 CTA(RegionSection 하단)가 화면 밖일 때만 표시.
  // 원본이 보이면 자동 숨김 (중복 UI 방지). 스크롤 컨테이너(overflow-y-auto div)를 root로 관찰.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bookCtaRef = useRef<HTMLAnchorElement>(null);
  const [showStickyCta, setShowStickyCta] = useState(false);

  useEffect(() => {
    const target = bookCtaRef.current;
    const root = scrollContainerRef.current;
    if (!target || !root) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // 원본 CTA가 조금이라도 보이면 sticky 숨김. 완전히 밖일 때만 표시.
        setShowStickyCta(!entry.isIntersecting);
      },
      { root, threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [flags.length]);

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto relative">
      {/* ① 타겟 후킹 + 설명 (헤더 아래) */}
      <div className="px-5 pt-6 pb-5 text-center space-y-3 border-b border-neutral-900">
        <h1 className="text-[24px] font-black leading-[1.18] tracking-tight">
          {tr("Want an unforgettable night in Seoul Club?")}
        </h1>
        <p className="text-[18px] font-black text-amber-400 pt-1">{tr("You're in the right place.")}</p>
        <p className="text-[14px] text-neutral-200 leading-relaxed font-medium">
          {tr("Pick a club & your budget")}<br />
          {tr("We book it with the club for you.")}<br />
          {tr("No Korean, no hassle.")}
        </p>
      </div>

      {/* ② 신뢰 배지 — 被宰(바가지) 공포 해결. 프리미엄 유지 위해 초록 체크만(붉은색 X) */}
      <div className="px-5 py-4 border-b border-neutral-900">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 max-w-[320px] mx-auto">
          {["No markup", "Real price", "Zero fee", "No deposit"].map((b) => (
            <div key={b} className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-green-500 shrink-0" strokeWidth={3} />
              <span className="text-[13px] font-bold text-neutral-200">{tr(b)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ③ 한국인이 지금 올린 깃발 = 소셜 프루프 (캐러셀) */}
      {flags.length > 0 && (
        <div className="pt-5 pb-5 border-b border-neutral-900">
          <div className="px-4 mb-3">
            <p className="text-[14px] font-black text-neutral-200">{tr("🇰🇷 Koreans are doing it right now")}</p>
            <p className="text-[12px] text-neutral-500 mt-0.5">{tr("Live requests from people in Seoul")}</p>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 snap-x snap-mandatory">
            {flags.map((f) => <FlagCarouselCard key={f.id} flag={f} />)}
          </div>
        </div>
      )}

      {/* How it works (드롭다운) */}
      <div className="px-4 pb-6">
        <details className="group rounded-2xl bg-[#1C1C1E] border border-neutral-800 overflow-hidden">
          <summary className="flex items-center justify-between gap-3 p-4 cursor-pointer list-none select-none">
            <span className="flex items-center gap-2 font-bold text-[14px]">
              <Info className="w-4 h-4 text-neutral-400" />
              {tr("How it works?")}
            </span>
            <ChevronDown className="w-4 h-4 text-neutral-500 group-open:rotate-180 transition-transform" />
          </summary>
          <div className="px-4 pb-4 space-y-3">
            {[
              { n: "1", title: "Pick your club", body: "Choose the clubs you want (or just tell us your vibe) — date, budget, group size." },
              { n: "2", title: "We book it for you", body: "We contact the club directly and lock in the best table for your budget — real price, no broker markup." },
              { n: "3", title: "Walk in like a VIP", body: "Best table booked, no line, no broker. Show your passport at the door (19+)." },
            ].map((s) => (
              <div key={s.n} className="flex gap-3">
                <div className="shrink-0 w-7 h-7 rounded-full bg-white text-black font-black text-[12px] flex items-center justify-center">{s.n}</div>
                <div className="space-y-0.5">
                  <p className="font-bold text-[14px]">{tr(s.title)}</p>
                  <p className="text-[12px] text-neutral-500 leading-relaxed">{tr(s.body)}</p>
                </div>
              </div>
            ))}
            {/* Zero 바가지 보장 — How it works 안에 포함 */}
            <div className="mt-1 pt-3 border-t border-neutral-800">
              <p className="flex items-center gap-2 text-[13px] font-black text-green-400">{tr("🛡️ Zero rip-off, guaranteed")}</p>
              <p className="text-[12px] text-neutral-400 leading-relaxed mt-1">
                {tr("Pay more than the standard price?")}{" "}
                <span className="font-bold text-white">{tr("We refund you 200%.")}</span>
              </p>
            </div>
          </div>
        </details>
      </div>

      {/* 지역 섹션 (강남/홍대 소개 + 클럽 리스트 + 지역 버튼) */}
      {clubs.length > 0 && <RegionSection clubs={clubs} bookCtaRef={bookCtaRef} />}

      {/* Safety tips */}
      <div className="px-4 pb-6 space-y-3">
        <p className="text-[13px] font-black text-neutral-300 uppercase tracking-widest">{tr("Know before you go")}</p>
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
              <span className="font-bold text-[14px]">{tr(t.title)}</span>
              <span className="text-neutral-500 group-open:rotate-180 transition-transform text-[12px]">▾</span>
            </summary>
            <div className="px-4 pb-4 space-y-2">
              {t.items.map((it, i) => (
                <p key={i} className="text-[12px] text-neutral-400 leading-relaxed">• {tr(it)}</p>
              ))}
            </div>
          </details>
        ))}
      </div>

      {/* 앱 다운로드 CTA (플랫폼 자동 감지: iPhone→App Store / Android→Play) */}
      <ForeignAppCta lang={lang} />

      {/* 19+ 안내 — 하단 CTA 버튼은 상단 amber CTA와 중복이라 제거 */}
      <div className="px-4 pb-6">
        <p className="text-center text-[11px] text-neutral-600 leading-relaxed">
          {tr("19+ only · Bring your passport to the venue.")}
        </p>
      </div>

      {/* 푸터 — 언어 전환 + 약관 링크 + 사업자 정보 (법적 필수) */}
      <footer className="px-4 pt-5 pb-10 border-t border-neutral-900 space-y-4">
        <div className="flex justify-center">
          <LangSwitcher />
        </div>
        <nav className="flex flex-wrap justify-center items-center gap-x-5 gap-y-2 text-[12px] text-neutral-500">
          <Link href={`/terms?lang=${lang}`} className="hover:text-white transition-colors">{tr("Terms")}</Link>
          <Link href={`/privacy?lang=${lang}`} className="hover:text-white transition-colors">{tr("Privacy")}</Link>
          <a href="https://www.instagram.com/nightflow.kr" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">{tr("Contact")}</a>
        </nav>
        <BusinessInfo lang={lang} />
      </footer>

      {/* Sticky "Book with NightFlow" CTA — 원본 CTA(RegionSection 하단)가 화면 밖일 때만 표시.
          스크롤 컨테이너 하단에 sticky 배치. IntersectionObserver로 원본 가시성 감지. */}
      <div
        aria-hidden={!showStickyCta}
        className={`sticky bottom-4 px-4 pointer-events-none z-20 transition-all duration-300 ${
          showStickyCta
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-3"
        }`}
      >
        <Link
          href={`/flags/new?lang=${lang}`}
          tabIndex={showStickyCta ? 0 : -1}
          className={`block w-full py-3.5 rounded-full bg-amber-500 text-black font-black text-[14px] text-center hover:bg-amber-400 active:scale-[0.98] transition-all shadow-2xl shadow-amber-500/30 ${
            showStickyCta ? "pointer-events-auto" : ""
          }`}
        >
          {tr("Book with NightFlow")}
        </Link>
      </div>
    </div>
  );
}

// ── Map 탭 ───────────────────────────────────────────────────────
function MapTab() {
  const { lang, tr } = useTr();
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
        <Map className="w-8 h-8 text-blue-400" />
      </div>
      <div className="space-y-2">
        <h3 className="text-[18px] font-black">{tr("Seoul Club Map")}</h3>
        <p className="text-[13px] text-neutral-500 leading-relaxed">
          {tr("Browse clubs in Gangnam and Hongdae.")}<br />
          {tr("See menus, ratings, and opening hours.")}
        </p>
      </div>
      <div className="w-full space-y-3">
        <Link
          href={`/${lang}/clubs`}
          className="block w-full py-4 rounded-xl bg-white text-black font-black text-[15px] hover:bg-neutral-200 transition-colors"
        >
          {tr("🗺️ Open club map")}
        </Link>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Gangnam", emoji: "🍾" },
            { label: "Hongdae", emoji: "🎧" },
          ].map((area) => (
            <div key={area.label} className="rounded-xl bg-[#1C1C1E] border border-neutral-800 p-3 text-center">
              <p className="text-xl mb-1">{area.emoji}</p>
              <p className="text-[12px] font-bold text-white">{tr(area.label)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────
export function EnHomeClient({
  flags,
  clubs = [],
  initialLang = "en",
}: {
  flags: FlagItem[];
  clubs?: ClubItem[];
  /** 서버에서 확정한 언어. Context로 하위 컴포넌트에 즉시 주입 → 첫 프레임 flash 제거. */
  initialLang?: Lang;
}) {
  return (
    <LangContext.Provider value={initialLang}>
      <EnHomeInner flags={flags} clubs={clubs} />
    </LangContext.Provider>
  );
}

function EnHomeInner({ flags, clubs = [] }: { flags: FlagItem[]; clubs?: ClubItem[] }) {
  const [tab, setTab] = useState<Tab>("flags");
  const { user, isLoading } = useCurrentUser();
  const { lang, tr } = useTr();

  const tabs: { code: Tab; label: string; icon: React.ReactNode }[] = [
    { code: "flags", label: tr("Home"),  icon: <Home className="w-4 h-4" /> },
    { code: "my",    label: tr("My"),    icon: <User className="w-4 h-4" /> },
    { code: "qa",    label: tr("Q&A"),   icon: <HelpCircle className="w-4 h-4" /> },
    { code: "map",   label: tr("Map"),   icon: <Map className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#0A0A0A] text-white max-w-lg mx-auto">
      {/* 헤더 */}
      <header className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between border-b border-neutral-800">
        {tab === "flags" ? (
          <div>
            <span className="text-[17px] font-black tracking-tight">NightFlow</span>
            <p className="text-[11px] text-neutral-500 leading-none mt-0.5">{tr("The easiest way to book Seoul clubs.")}</p>
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
        {isLoading ? (
          <div className="w-[88px] h-9 rounded-full bg-neutral-800 animate-pulse" />
        ) : user ? (
          <Link
            href={`/flags/new?lang=${lang}`}
            className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-amber-500 text-black font-black text-[13px] hover:bg-amber-400 transition-colors"
          >
            {tr("Book now")}
          </Link>
        ) : (
          <Link
            href={`/login?lang=${lang}`}
            className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-white text-black font-black text-[13px] hover:bg-neutral-200 transition-colors"
          >
            {tr("Log in")}
          </Link>
        )}
      </header>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === "flags" && <FlagsTab flags={flags} clubs={clubs} />}
        {tab === "my" && <MyRequestsTab />}
        {tab === "qa" && <FaqTab />}
        {tab === "map" && <MapTab />}
      </div>

      {/* 하단 탭 바 */}
      <nav className="shrink-0 border-t border-neutral-800 bg-[#0A0A0A] grid grid-cols-4">
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
