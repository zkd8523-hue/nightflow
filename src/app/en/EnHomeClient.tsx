"use client";

import { useState, useEffect, createContext, useContext, useRef } from "react";
import Link from "next/link";
import { type Lang, makeT, areaLabel } from "@/lib/i18n";
import { isFlagAreaOpen } from "@/lib/constants/areas";
import { FaqTab } from "./FaqTab";
import { ChevronLeft, ChevronRight, ChevronDown, Info, Home, User, HelpCircle, Map, Check } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import { BusinessInfo } from "@/components/layout/BusinessInfo";
import { LangSwitcher } from "@/components/layout/LangSwitcher";
import { ForeignAppCta } from "@/components/layout/ForeignAppCta";
import { ForeignClubDetailPanel, displayClubName, type ForeignClubDetail } from "@/components/clubs/ForeignClubDetailPanel";
import { SavedClubsButton } from "@/components/clubs/SavedClubsButton";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { trackForeignEvent } from "@/lib/analytics/events";

type Tab = "flags" | "my" | "qa" | "map";

type MyRequest = {
  id: string;
  area: string | null;
  event_date: string;
  status: string;
  budget: number | null;
  group_size: number;
};

type ClubItem = ForeignClubDetail;

// 로그인 후 깃발 폼으로 복귀하는 링크. 미로그인이면 폼 서버 컴포넌트가 자동으로 /login?redirect= 로 튕김.
// clubId를 실으면 폼이 그 클럽을 미리 선택하고 여행확정 게이트도 건너뜀(page.tsx의 presetClubId).
// "Book at BADASS"를 눌렀는데 클럽 얘기가 없는 질문 화면이 뜨면 선택이 증발한 것처럼 보여 되돌아가던 이탈이 있었음.
function buildFlagHref(lang: Lang, area?: string, clubId?: string) {
  const params = new URLSearchParams();
  params.set("lang", lang);
  if (area) params.set("area", area);
  if (clubId) params.set("club", clubId);
  return `/flags/new?${params.toString()}`;
}

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
  leader?: { display_name: string | null; country_code: string | null } | null;
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
  new: { label: "Received", ja: "受付済み", zh: "已收到", cls: "bg-green-500/20 text-money border-green-500/30" },
  contacted: { label: "In progress", ja: "対応中", zh: "处理中", cls: "bg-amber-500/20 text-brand-amber border-amber-500/30" },
  done: { label: "Confirmed", ja: "確定", zh: "已确认", cls: "bg-amber-500/20 text-brand-amber border-amber-500/30" },
  cancelled: { label: "Cancelled", ja: "キャンセル", zh: "已取消", cls: "bg-muted/40 text-muted-foreground border-border" },
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
        <p className="text-[15px] font-bold text-foreground/80">{tr("Log in to see your requests")}</p>
        <p className="text-[13px] text-muted-foreground">{tr("Track your requests and our replies.")}</p>
        <Link href={`/login?lang=${lang}`} className="px-7 py-3 rounded-full bg-inverse text-inverse-foreground font-black text-[14px] hover:opacity-90 transition-colors">
          {tr("Log in")}
        </Link>
      </div>
    );
  }
  // 로딩 (로그인 + fetch 전)
  if (isLoading || flags === null) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[13px] text-muted-foreground">{tr("Loading…")}</p>
      </div>
    );
  }
  // 로그인 + 깃발 없음
  if (flags.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-[15px] font-bold text-foreground/80">{tr("No requests yet")}</p>
        <p className="text-[13px] text-muted-foreground">{tr("Pick a club & we'll book it for you.")}</p>
        <Link href={`/flags/new?lang=${lang}`} className="px-7 py-3 rounded-full bg-amber-500 text-black font-black text-[14px] hover:bg-amber-400 transition-colors">
          {tr("Book with NightFlow")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6 space-y-2.5">
      <p className="text-[13px] font-black text-foreground/80 uppercase tracking-widest">{tr("My requests")}</p>
      {flags.map((f) => {
        const area = f.area ? areaLabel(f.area, lang) : tr("Anywhere in Seoul");
        const date = formatEventDate(f.event_date);
        const budget = f.budget != null ? formatAmount(f.budget) : null;
        const st = MY_STATUS_LABEL[f.status] ?? MY_STATUS_LABEL.new;
        return (
          <div
            key={f.id}
            className="flex items-center justify-between gap-3 rounded-2xl bg-card border border-border p-4"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-black text-[15px]">{area}</span>
                <span className="text-muted-foreground text-[12px]">· {date}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[13px]">
                {budget && <span className="font-black text-brand-amber">{budget}</span>}
                <span className="text-muted-foreground">{f.group_size} {tr("people")}</span>
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
      className="block shrink-0 w-[180px] rounded-2xl bg-card border border-border p-4 snap-start active:opacity-70 transition-opacity"
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="font-black text-[15px] leading-tight truncate">{area}</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">{date}</p>
        </div>
        {/* 우상단: 한국 국기 (한국인이 올린 깃발 표시) */}
        <span className="text-[18px] leading-none shrink-0">🇰🇷</span>
      </div>
      <p className="text-[18px] font-black text-brand-amber mt-3">{budget}</p>
      <div className="flex items-center gap-1.5 mt-1 text-[12px] text-muted-foreground">
        <span className="font-bold text-foreground">{flag.target_count}{tr(" ppl")}</span>
      </div>
    </Link>
  );
}

// ── 지역 섹션 (강남=프리미엄 / 홍대=자유) + 클럽 리스트 + 지역 버튼 ──
const REGIONS = [
  {
    ko: "이태원",
    en: "Itaewon",
    emoji: "🌏",
    tagline: "Global, borderless night",
  },
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
] as const;

function ClubThumb({ club, onOpen }: { club: ClubItem; onOpen: () => void }) {
  const { tr } = useTr();
  const name = displayClubName(club);
  // 홈에서 이탈시키지 않고 제자리에서 상세 모달을 띄움 — "How it works" 교육 기회를 잃지 않도록.
  // (예전엔 /clubs 페이지로 바로 이동했음. RegionSection이 오픈 상태를 관리.)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="shrink-0 w-[120px] snap-start active:opacity-70 transition-opacity text-left"
    >
      <div className="w-[120px] h-[80px] rounded-xl overflow-hidden bg-muted border border-border">
        {club.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={club.thumbnail_url} alt={name} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[11px] font-bold">{tr("No image")}</div>
        )}
      </div>
      <p className="text-[12px] font-bold text-foreground mt-1.5 truncate">{name}</p>
    </button>
  );
}

// 가이드 카드 인덱스.
// 주제 선정 근거: 외국인 검색·커뮤니티에서 반복되는 불안은 "얼마 드나 / 뭐 입나 /
// 외국인이라고 막히나 / 혼자 가도 되나"에 몰려 있다. 추상적인 "한국 클럽의 특징" 류보다
// 이런 구체적 질문이 검색량·전환 모두 낫다(이 프로젝트 블로그 실측에서도 구체 주제만 성과).
// 답이 이미 있는 페이지들이 아코디언·하위 페이지에 묻혀 있어 진입점을 표면으로 끌어올린다.
function GuideIndex() {
  const { lang, t } = useTr();

  const cards = [
    {
      // 실데이터 기반이라 다른 카드보다 앞에 — "얼마 드나"가 가장 큰 불안이고
      // 경쟁 블로그의 뭉뚱그린 숫자와 달리 클럽별 실제 값을 보여준다.
      cat: t("가격", "PRICES", "料金", "价格", "價格"),
      title: t(
        "서울 클럽, 실제로 얼마 드나요?",
        "How much does a Seoul club cost?",
        "ソウルのクラブ、いくらかかる？",
        "首尔夜店要花多少钱?",
        "首爾夜店要花多少錢?"
      ),
      desc: t(
        "클럽 50곳의 실제 입장료를 지역별로 정리했습니다. 대부분 1~2만원이고 무료인 곳도 많습니다.",
        "Verified entry fees from 50 clubs, by district. Most are ₩10,000–20,000 and plenty are free.",
        "50店の実際の入場料をエリア別に。ほとんどが₩10,000〜20,000で、無料の店も多数。",
        "50家夜店的真实入场费,按区域整理。大多数₩10,000–20,000,不少免费。",
        "50家夜店的真實入場費,按區域整理。大多數₩10,000–20,000,不少免費。"
      ),
      href: `/${lang}/club-prices`,
    },
    {
      cat: t("이용 방법", "HOW IT WORKS", "利用方法", "使用方法", "使用方法"),
      title: t(
        "예약이 실제로 어떻게 되나요?",
        "How does booking actually work?",
        "予約は実際どう進むの？",
        "预订到底怎么进行?",
        "預約到底怎麼進行?"
      ),
      desc: t(
        "날짜·인원·예산만 주면 우리가 클럽에 직접 연락해 테이블을 잡습니다. 중개 수수료도 예약금도 없습니다.",
        "Tell us the date, group size and budget — we contact the club directly and lock your table. No broker fee, no deposit.",
        "日程・人数・予算を教えてくれれば、私たちがクラブに直接連絡してテーブルを確保します。仲介手数料もデポジットもなし。",
        "告诉我们日期、人数和预算,我们直接联系夜店锁定卡座。无中介费,无押金。",
        "告訴我們日期、人數和預算,我們直接聯絡夜店鎖定包廂。無中介費,無訂金。"
      ),
      href: `/${lang}/guide`,
    },
    {
      cat: t("테이블", "TABLES", "テーブル", "卡座", "包廂"),
      title: t(
        "테이블과 그냥 입장, 뭐가 다른가요?",
        "Table or just entry — what's the difference?",
        "テーブルと入場だけ、何が違う？",
        "卡座和普通入场有什么区别?",
        "包廂和一般入場有什麼差別?"
      ),
      desc: t(
        "VIP 테이블은 자리·보틀·줄 안 서기가 붙습니다. 가격대와 언제 값어치를 하는지 정리했습니다.",
        "A VIP table gets you seating, bottle service and no queue. Here's what it costs and when it's worth it.",
        "VIPテーブルは席・ボトル・列スキップが付きます。価格帯と、どんな時に元が取れるかをまとめました。",
        "VIP 卡座包含座位、酒水和免排队。这里说明价格区间和什么时候值得。",
        "VIP 包廂包含座位、酒水和免排隊。這裡說明價格區間和什麼時候值得。"
      ),
      href: `/${lang}/vip-tables`,
    },
    {
      cat: t("무료 입장", "FREE ENTRY", "無料入場", "免费入场", "免費入場"),
      title: t(
        "무료로 들어갈 수도 있나요?",
        "Can I get in for free?",
        "無料で入れることもある？",
        "可以免费进场吗?",
        "可以免費進場嗎?"
      ),
      desc: t(
        "게스트 리스트가 어떻게 돌아가는지, 누가 대상이고 어떤 날 가능한지 설명합니다.",
        "How the guest list actually works — who qualifies, and which nights it's possible.",
        "ゲストリストの仕組み — 誰が対象で、どの日なら可能かを説明します。",
        "嘉宾名单是怎么运作的 — 谁符合条件,哪些日子可行。",
        "嘉賓名單是怎麼運作的 — 誰符合條件,哪些日子可行。"
      ),
      href: `/${lang}/guests`,
    },
    {
      cat: t("음악", "MUSIC", "音楽", "音乐", "音樂"),
      title: t(
        "K-pop이 나오는 클럽은 어디인가요?",
        "Which clubs actually play K-pop?",
        "K-popがかかるクラブはどこ？",
        "哪些夜店真的放 K-pop?",
        "哪些夜店真的放 K-pop?"
      ),
      desc: t(
        "장르는 클럽마다, 요일마다 다릅니다. K-pop·힙합·EDM이 실제로 나오는 곳을 골랐습니다.",
        "Genre changes by club and by night. Here are the ones that really play K-pop, hip-hop and EDM.",
        "ジャンルはクラブごと・曜日ごとに変わります。K-pop・ヒップホップ・EDMが実際にかかる店を選びました。",
        "音乐风格因店和日子而异。这里挑出真正放 K-pop、嘻哈和 EDM 的店。",
        "音樂風格因店和日子而異。這裡挑出真正放 K-pop、嘻哈和 EDM 的店。"
      ),
      href: `/${lang}/kpop-clubs`,
    },
    {
      cat: t("지역", "AREAS", "エリア", "区域", "區域"),
      title: t(
        "강남, 홍대, 이태원 중 어디로 가야 하나요?",
        "Gangnam, Hongdae or Itaewon?",
        "江南・弘大・梨泰院、どこに行くべき？",
        "江南、弘大还是梨泰院?",
        "江南、弘大還是梨泰院?"
      ),
      desc: t(
        "동네마다 가격대·연령대·분위기가 확연히 다릅니다. 첫 방문이라면 어디가 무난한지도 함께.",
        "Price, crowd and vibe differ sharply by district — including which one is safest for a first night out.",
        "エリアごとに価格帯・客層・雰囲気がはっきり違います。初めてならどこが無難かも。",
        "各区域的价格、客群和氛围差别很大 — 也包括第一次去哪里最稳妥。",
        "各區域的價格、客群和氛圍差別很大 — 也包括第一次去哪裡最穩妥。"
      ),
      href: `/${lang}/seoul-nightlife`,
    },
    {
      cat: t("영업시간", "HOURS", "営業時間", "营业时间", "營業時間"),
      title: t(
        "몇 시에 열고, 몇 시에 가야 하나요?",
        "When do clubs open — and when should I go?",
        "何時に開いて、何時に行くべき？",
        "几点开门,该几点去?",
        "幾點開門,該幾點去?"
      ),
      desc: t(
        "클럽 96곳의 실제 영업시간. 대부분 22시에 열지만 진짜 붐비는 건 새벽 1시부터입니다.",
        "Real hours from 96 clubs. Most open at 22:00, but the room only fills around 1am.",
        "96店の実際の営業時間。ほとんどが22時オープンですが、本当に混むのは深夜1時からです。",
        "96家夜店的实际营业时间。大多数22点开门,但真正热闹是凌晨1点。",
        "96家夜店的實際營業時間。大多數22點開門,但真正熱鬧是凌晨1點。"
      ),
      href: `/${lang}/club-hours`,
    },
    {
      cat: t("입장 규정", "ENTRY RULES", "入場ルール", "入场规定", "入場規定"),
      title: t(
        "나이·여권, 뭘 챙겨야 하나요?",
        "Age, passport — what do I need at the door?",
        "年齢・パスポート、何が必要？",
        "年龄、护照 — 门口需要什么?",
        "年齡、護照 — 門口需要什麼?"
      ),
      desc: t(
        "한국은 '연 나이' 기준이라 매년 바뀝니다. 여권 실물이 필요하고, 외국인 입장 여부까지 정리했습니다.",
        "Korea uses year-age, so the cutoff shifts annually. You need a physical passport — and here's whether foreigners get in.",
        "韓国は「年年齢」基準なので毎年変わります。パスポートの実物が必要で、外国人の入場可否もまとめました。",
        "韩国按「年龄年」算,每年都变。需要护照原件,外国人能不能进也一并说明。",
        "韓國按「年齡年」算,每年都變。需要護照正本,外國人能不能進也一併說明。"
      ),
      href: `/${lang}/club-entry-rules`,
    },
    {
      cat: t("드레스코드", "DRESS CODE", "ドレスコード", "着装要求", "服裝規定"),
      title: t(
        "뭐 입고 가야 하나요?",
        "What should I wear?",
        "何を着ていけばいい？",
        "该穿什么?",
        "該穿什麼?"
      ),
      desc: t(
        "강남은 깐깐하고 홍대는 자유롭습니다. 다만 슬리퍼·쪼리는 어디서나 걸립니다.",
        "Gangnam is strict, Hongdae is relaxed. But slippers and flip-flops get stopped everywhere.",
        "江南は厳しく弘大は自由です。ただしスリッパ・ビーチサンダルはどこでも引っかかります。",
        "江南严格,弘大自由。但拖鞋和人字拖哪里都会被拦。",
        "江南嚴格,弘大自由。但拖鞋和夾腳拖哪裡都會被攔。"
      ),
      href: `/${lang}/dress-code`,
    },
  ];

  return (
    <section className="px-4 pb-8">
      <p className="text-[12px] font-black text-brand-amber tracking-widest uppercase">
        {t("나플 가이드", "NightFlow Guide", "NightFlow ガイド", "NightFlow 指南", "NightFlow 指南")}
      </p>
      <h2 className="mt-1.5 text-[26px] font-black tracking-tight leading-tight break-keep">
        {t(
          "처음 가도 헤매지 않게",
          "Everything to know before your first night",
          "初めてでも迷わないために",
          "第一次来也不会手足无措",
          "第一次來也不會手足無措"
        )}
      </h2>
      <p className="mt-2 text-[14px] text-muted-foreground leading-relaxed break-keep">
        {t(
          "비용부터 복장, 입장 규정, 지역별 분위기까지 실제로 알아야 할 것만 정리했습니다.",
          "Costs, dress code, entry rules and what each district is actually like — only what you'll actually need.",
          "費用から服装、入場ルール、エリアごとの雰囲気まで、実際に必要なことだけまとめました。",
          "从费用、着装到入场规定和各区域氛围 — 只整理你真正需要知道的。",
          "從費用、著裝到入場規定和各區域氛圍 — 只整理你真正需要知道的。"
        )}
      </p>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map((c, i) => (
          <Link
            key={c.href}
            href={c.href}
            className="group flex flex-col rounded-2xl bg-card border border-border p-4 hover:border-amber-500/40 transition-colors"
          >
            <p className="text-[11px] font-black text-brand-amber tracking-wider">
              {String(i + 1).padStart(2, "0")} · {c.cat}
            </p>
            <h3 className="mt-2 text-[16px] font-black text-foreground leading-snug break-keep">
              {c.title}
            </h3>
            <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed break-keep flex-1">
              {c.desc}
            </p>
            <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-brand-amber">
              {t("읽어보기", "Read", "読む", "阅读", "閱讀")}
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function RegionSection({ clubs, flags, bookCtaRef }: { clubs: ClubItem[]; flags: FlagItem[]; bookCtaRef?: React.RefObject<HTMLAnchorElement | null> }) {
  const { lang, t, tr } = useTr();

  // 클럽 상세 모달 — 열린 캐러셀(지역별) 내에서 좌우 이동 가능
  const [detailList, setDetailList] = useState<ClubItem[]>([]);
  const [detailIndex, setDetailIndex] = useState(0);
  const detailClub = detailList[detailIndex] ?? null;
  const openDetail = (list: ClubItem[], club: ClubItem) => {
    const idx = list.findIndex((c) => c.id === club.id);
    setDetailList(list);
    setDetailIndex(idx >= 0 ? idx : 0);
  };
  const closeDetail = () => setDetailList([]);
  const hasPrevDetail = detailIndex > 0;
  const hasNextDetail = detailIndex < detailList.length - 1;
  const goPrevDetail = () => setDetailIndex((i) => Math.max(i - 1, 0));
  const goNextDetail = () => setDetailIndex((i) => Math.min(i + 1, detailList.length - 1));
  const detailTouchStartXRef = useRef<number | null>(null);

  const bookAtClubLabel = (name: string) =>
    t(`🍾 ${name} 예약하기`, `🍾 Book ${name}`, `🍾 ${name}を予約`, `🍾 预订 ${name}`);

  return (
    <div className="pt-5 pb-6 border-b border-border space-y-5">
      <div className="px-4 flex items-center justify-between gap-2">
        <p className="text-[22px] font-black text-foreground tracking-tight">{tr("Clubs in Seoul")}</p>
        <Link
          href={`/${lang}/clubs`}
          className="shrink-0 text-[12px] font-bold text-brand-amber hover:text-brand-amber transition-colors whitespace-nowrap"
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
                <span className="text-muted-foreground font-medium text-[13px]"> — {tr(r.tagline)}</span>
              </p>
            </div>
            {regionClubs.length > 0 && (
              <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 snap-x">
                {regionClubs.map((c) => <ClubThumb key={c.id} club={c} onOpen={() => openDetail(regionClubs, c)} />)}
              </div>
            )}
          </div>
        );
      })}

      {/* 클럽 상세 모달 — 클릭 시 이탈 없이 제자리에서 오픈, 화살표/스와이프로 같은 지역 내 이동 */}
      <Sheet open={!!detailClub} onOpenChange={(o) => !o && closeDetail()}>
        <SheetContent
          side="bottom"
          className="bg-card border-border rounded-t-3xl max-h-[88vh] overflow-y-auto p-0"
          onTouchStart={(e) => { detailTouchStartXRef.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            const startX = detailTouchStartXRef.current;
            detailTouchStartXRef.current = null;
            if (startX == null) return;
            const deltaX = e.changedTouches[0].clientX - startX;
            const SWIPE_THRESHOLD = 60;
            if (deltaX > SWIPE_THRESHOLD) goPrevDetail();
            else if (deltaX < -SWIPE_THRESHOLD) goNextDetail();
          }}
        >
          {detailClub && (
            <>
              <SheetTitle className="sr-only">{detailClub.name}</SheetTitle>
              {hasPrevDetail && (
                <button
                  type="button"
                  onClick={goPrevDetail}
                  aria-label={tr("Previous club")}
                  className="absolute left-3 top-24 z-10 w-9 h-9 rounded-full bg-black/45 border border-white/30 text-white flex items-center justify-center hover:bg-black/65"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {hasNextDetail && (
                <button
                  type="button"
                  onClick={goNextDetail}
                  aria-label={tr("Next club")}
                  className="absolute right-3 top-24 z-10 w-9 h-9 rounded-full bg-black/45 border border-white/30 text-white flex items-center justify-center hover:bg-black/65"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
              <ForeignClubDetailPanel
                club={detailClub}
                lang={lang}
                cta={
                  <div className="flex gap-2 mt-2">
                    <Link
                      href={buildFlagHref(lang, detailClub.area, detailClub.id)}
                      onClick={() => {
                        // 회원가입 후 깃발 폼에서 원래 클릭한 클럽을 프리셀렉트 — ClubsClient와 동일 패턴.
                        if (typeof window !== "undefined") {
                          try {
                            sessionStorage.setItem(
                              "nightflow_book_intent",
                              JSON.stringify({
                                club_id: detailClub.id,
                                club_name: detailClub.name,
                                area: detailClub.area,
                                lang,
                                savedAt: Date.now(),
                              })
                            );
                          } catch { /* noop */ }
                        }
                        if (lang !== "ko") {
                          trackForeignEvent("foreign_book_at_club_click", {
                            area: detailClub.area,
                            club_id: detailClub.id,
                            club_name: detailClub.name,
                          });
                        }
                        closeDetail();
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-xl bg-amber-500 text-black font-black text-[15px] hover:bg-amber-400 transition-colors"
                    >
                      {bookAtClubLabel(displayClubName(detailClub))}
                    </Link>
                  </div>
                }
              />
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* 한국인이 지금 올린 깃발 = 소셜 프루프 (캐러셀) — 클럽 목록 바로 아래, 지역 버튼 바로 위 */}
      {flags.length > 0 && (
        <div className="space-y-3">
          <div className="px-4">
            <p className="text-[14px] font-black text-foreground">{tr("🇰🇷 Koreans are doing it right now")}</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">{tr("Live requests from people in Seoul")}</p>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 snap-x snap-mandatory">
            {flags.map((f) => <FlagCarouselCard key={f.id} flag={f} />)}
          </div>
        </div>
      )}

      {/* 지역 버튼 → 해당 지역 깃발 등록 바로 */}
      <div className="px-4 space-y-2.5">
        <p className="text-center text-[13px] font-bold text-foreground/80">{tr("Which area do you want?")}</p>
        <div className="grid grid-cols-2 gap-3">
          {REGIONS.map((r) =>
            !isFlagAreaOpen(r.ko) ? (
              // 닫힌 지역: 준비중(선택 불가). 홈에서도 노출하되 등록 유도 안 함.
              <div
                key={r.ko}
                aria-disabled
                className="relative flex items-center justify-center py-4 rounded-2xl bg-card border border-border opacity-50 cursor-not-allowed"
              >
                <span className="text-[16px] font-black">{areaLabel(r.ko, lang)}</span>
                <span className="absolute top-1.5 right-2.5 text-[10px] font-bold text-brand-amber dark:text-brand-amber/80">
                  {tr("Soon")}
                </span>
              </div>
            ) : (
              <Link
                key={r.ko}
                href={`/flags/new?lang=${lang}&area=${encodeURIComponent(r.ko)}`}
                className="flex items-center justify-center py-4 rounded-2xl bg-card border border-border hover:border-amber-500/50 active:scale-[0.98] transition-all"
              >
                <span className="text-[16px] font-black">{areaLabel(r.ko, lang)}</span>
              </Link>
            )
          )}
          {/* 서울 어디든: 가장 많은 오퍼 */}
          <Link
            href={`/flags/new?lang=${lang}&area=${encodeURIComponent("서울 어디든")}`}
            className="flex items-center justify-center py-4 rounded-2xl bg-card border border-border hover:border-amber-500/50 active:scale-[0.98] transition-all"
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
      <div className="px-5 pt-6 pb-5 text-center space-y-3">
        <h1 className="text-[24px] font-black leading-[1.18] tracking-tight">
          {tr("Unforgettable night in Seoul Club?")}
        </h1>
        <p className="text-[18px] font-black text-brand-amber pt-1">{tr("You're in the right place.")}</p>
      </div>

      {/* ② How it works (드롭다운) — 신뢰 배지 + 3단계 설명 + 바가지 보장 통합 */}
      <div className="px-4 pb-6">
        <details className="group rounded-2xl bg-card border border-border overflow-hidden">
          <summary className="flex items-center justify-between gap-3 p-4 cursor-pointer list-none select-none">
            <span className="flex items-center gap-2 font-bold text-[14px]">
              <Info className="w-4 h-4 text-muted-foreground" />
              {tr("How it works?")}
            </span>
            <ChevronDown className="w-4 h-4 text-muted-foreground group-open:rotate-180 transition-transform" />
          </summary>
          <div className="px-4 pb-4 space-y-4">
            {/* 신뢰 배지 — 被宰(바가지) 공포 해결. 프리미엄 유지 위해 초록 체크만(붉은색 X) */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 pb-3 border-b border-border">
              {["No markup", "Real price", "Zero fee", "No deposit"].map((b) => (
                <div key={b} className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-money shrink-0" strokeWidth={3} />
                  <span className="text-[13px] font-bold text-foreground">{tr(b)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {[
                { n: "1", title: "Pick your club", body: "Choose the clubs you want (or just tell us your vibe) — date, budget, group size." },
                { n: "2", title: "We book it for you", body: "We contact the club directly and lock in the best table for your budget — real price, no broker markup." },
                { n: "3", title: "Walk in like a VIP", body: "Best table booked, no line, no broker. Show your passport at the door (19+)." },
              ].map((s) => (
                <div key={s.n} className="flex gap-3">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-inverse text-inverse-foreground font-black text-[12px] flex items-center justify-center">{s.n}</div>
                  <div className="space-y-0.5">
                    <p className="font-bold text-[14px]">{tr(s.title)}</p>
                    <p className="text-[12px] text-muted-foreground leading-relaxed">{tr(s.body)}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* Zero 바가지 보장 — How it works 안에 포함 */}
            <div className="pt-3 border-t border-border">
              <p className="flex items-center gap-2 text-[13px] font-black text-money">{tr("🛡️ Zero rip-off, guaranteed")}</p>
              <p className="text-[12px] text-muted-foreground leading-relaxed mt-1">
                {tr("Pay more than the standard price?")}{" "}
                <span className="font-bold text-foreground">{tr("We refund you 200%.")}</span>
              </p>
            </div>
          </div>
        </details>
      </div>

      {/* 지역 섹션 (강남/홍대 소개 + 클럽 리스트 + 지역 버튼 + 한국인 소셜프루프 캐러셀) */}
      {clubs.length > 0 && <RegionSection clubs={clubs} flags={flags} bookCtaRef={bookCtaRef} />}

      {/* Safety tips */}
      <div className="px-4 pb-6 space-y-3">
        <p className="text-[13px] font-black text-foreground/80 uppercase tracking-widest">{tr("Know before you go")}</p>
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
          <details key={t.title} className="group rounded-2xl bg-card border border-border overflow-hidden">
            <summary className="flex items-center justify-between gap-3 p-4 cursor-pointer list-none select-none">
              <span className="font-bold text-[14px]">{tr(t.title)}</span>
              <span className="text-muted-foreground group-open:rotate-180 transition-transform text-[12px]">▾</span>
            </summary>
            <div className="px-4 pb-4 space-y-2">
              {t.items.map((it, i) => (
                <p key={i} className="text-[12px] text-muted-foreground leading-relaxed">• {tr(it)}</p>
              ))}
            </div>
          </details>
        ))}
      </div>

      {/* 가이드 인덱스 — 외국인이 실제로 불안해하는 것들(비용·복장·입장거부·혼자오기)에
          답하는 페이지로 보내는 진입점. SEO 내부링크(거미줄) 역할도 겸한다.
          6장 모두 en/ja/zh/zh-tw 네 언어에 실재하는 페이지로만 연결. */}
      <GuideIndex />

      {/* 앱 다운로드 CTA (플랫폼 자동 감지: iPhone→App Store / Android→Play) */}
      <ForeignAppCta lang={lang} />

      {/* 19+ 안내 — 하단 CTA 버튼은 상단 amber CTA와 중복이라 제거 */}
      <div className="px-4 pb-6">
        <p className="text-center text-[11px] text-muted-foreground leading-relaxed">
          {tr("19+ only · Bring your passport to the venue.")}
        </p>
      </div>

      {/* 푸터 — 언어 전환 + 약관 링크 + 사업자 정보 (법적 필수) */}
      <footer className="px-4 pt-5 pb-10 border-t border-border space-y-4">
        <div className="flex justify-center">
          <LangSwitcher />
        </div>
        <nav className="flex flex-wrap justify-center items-center gap-x-5 gap-y-2 text-[12px] text-muted-foreground">
          <Link href={`/terms?lang=${lang}`} className="hover:text-foreground transition-colors">{tr("Terms")}</Link>
          <Link href={`/privacy?lang=${lang}`} className="hover:text-foreground transition-colors">{tr("Privacy")}</Link>
          <a href="https://www.instagram.com/nightflow.kr" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">{tr("Contact")}</a>
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
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          {tr("Browse clubs in Gangnam and Hongdae.")}<br />
          {tr("See menus, ratings, and opening hours.")}
        </p>
      </div>
      <div className="w-full space-y-3">
        <Link
          href={`/${lang}/clubs`}
          className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-[15px] hover:opacity-90 transition-colors"
        >
          {tr("🗺️ Open club map")}
        </Link>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Gangnam", emoji: "🍾" },
            { label: "Hongdae", emoji: "🎧" },
          ].map((area) => (
            <div key={area.label} className="rounded-xl bg-card border border-border p-3 text-center">
              <p className="text-xl mb-1">{area.emoji}</p>
              <p className="text-[12px] font-bold text-foreground">{tr(area.label)}</p>
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
  const { lang, tr } = useTr();

  // 외국어 홈 진입 계측. 이게 없어서 /en·/ja·/zh 착지 후 아무것도 안 누르고 나간 유저는
  // user_events에 한 줄도 안 남았고(광고 클릭 60 vs 기록 20), 상단 이탈을 아예 못 보고 있었음.
  // Admin 인사이트에는 en_home_view/ja_home_view/zh_home_view 라벨이 이미 있는데 발동부만 비어 있었다.
  useEffect(() => {
    const key = lang === "zh-tw" ? "zh_tw" : lang;
    trackForeignEvent(`${key}_home_view` as Parameters<typeof trackForeignEvent>[0], { lang });
  }, [lang]);

  const tabs: { code: Tab; label: string; icon: React.ReactNode }[] = [
    { code: "flags", label: tr("Home"),  icon: <Home className="w-4 h-4" /> },
    { code: "my",    label: tr("My"),    icon: <User className="w-4 h-4" /> },
    { code: "qa",    label: tr("Q&A"),   icon: <HelpCircle className="w-4 h-4" /> },
    { code: "map",   label: tr("Map"),   icon: <Map className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col h-screen bg-background text-foreground max-w-lg mx-auto">
      {/* 헤더 */}
      <header className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between border-b border-border">
        {tab === "flags" ? (
          <div>
            <span className="text-[17px] font-black tracking-tight">NightFlow</span>
            <p className="text-[11px] text-muted-foreground leading-none mt-0.5">{tr("Korea Club Guide")}</p>
          </div>
        ) : (
          <button
            onClick={() => setTab("flags")}
            className="flex items-center gap-1 -ml-1 px-2 py-1.5 rounded-lg text-foreground hover:bg-muted transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-[15px] font-black">NightFlow</span>
          </button>
        )}
        {/* 상단 예약 버튼은 제거 — 하단 sticky "Book with NightFlow" CTA와 중복이라
            같은 화면에 예약 버튼이 두 개 떠 있었다. 찜 진입점만 남긴다(0개면 스스로 숨음). */}
        <div className="flex items-center gap-2">
          <SavedClubsButton lang={lang} clubs={clubs} />
        </div>
      </header>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === "flags" && <FlagsTab flags={flags} clubs={clubs} />}
        {tab === "my" && <MyRequestsTab />}
        {tab === "qa" && <FaqTab />}
        {tab === "map" && <MapTab />}
      </div>

      {/* 하단 탭 바 */}
      <nav className="shrink-0 border-t border-border bg-background grid grid-cols-4">
        {tabs.map(({ code, label, icon }) => (
          <button
            key={code}
            onClick={() => setTab(code)}
            className={`flex flex-col items-center gap-1 py-3 text-[10px] font-bold transition-colors ${
              tab === code ? "text-foreground" : "text-muted-foreground hover:text-muted-foreground"
            }`}
          >
            <span className={tab === code ? "text-foreground" : "text-muted-foreground"}>{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
