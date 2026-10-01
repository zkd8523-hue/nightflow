"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Home, User, HelpCircle, Map, Heart, X } from "lucide-react";
import { type Lang, makeT, areaLabel } from "@/lib/i18n";
import { LangSwitcher } from "@/components/layout/LangSwitcher";
import { createClient } from "@/lib/supabase/client";
import { useSavedClubs, removeSavedClub } from "@/lib/clubs/savedClubs";
import { trackForeignEvent } from "@/lib/analytics/events";

// ── 외국인 트랙 데스크톱 셸 ────────────────────────────────────────
// 외국인 트래픽은 데스크톱 비중이 한국어(25%)의 두 배 안팎이다(ZH 63%·JA 51%·ZH-TW 39%·EN 38%).
// 하단 탭 바는 모바일 전용 패턴이라 lg 이상에선 좌측 세로 레일로 바꾼다.
//
// 홈(EnHomeClient)은 탭을 로컬 state로 들고 있어 onSelect를 넘겨 버튼으로 쓰고,
// SEO·클럽·폼 페이지는 onSelect 없이 링크로 쓴다(홈으로 이동 + ?tab= 로 탭 지정).
// 이렇게 나눠야 홈의 기존 탭 전환 동작을 그대로 두면서 같은 레일을 재사용할 수 있다.

export type ForeignNavKey = "home" | "my" | "qa" | "map";

const NAV: { key: ForeignNavKey; icon: React.ReactNode }[] = [
  { key: "home", icon: <Home className="w-[18px] h-[18px]" /> },
  { key: "my", icon: <User className="w-[18px] h-[18px]" /> },
  { key: "qa", icon: <HelpCircle className="w-[18px] h-[18px]" /> },
  { key: "map", icon: <Map className="w-[18px] h-[18px]" /> },
];

/**
 * 사이드바 하단 CTA 교체. 데스크톱에선 사이드바 버튼이 그 페이지의 유일한 예약 버튼이다 —
 * 홈·지역 목록은 원래 하단 고정 버튼을 lg에서 숨겼는데, 클럽 상세만 하단 바를 그대로 띄워
 * 왼쪽 "Book Korean Clubs"(빈 폼)와 아래 "Book X"(그 클럽)가 동시에 보였다(2026-09-26).
 * 클럽 상세는 하단 바를 lg에서 숨기고 이 자리에 자기 버튼을 넣는다.
 */
export type ForeignSidebarCta = {
  /** 없으면 기본(빈 예약 폼) */
  href?: string;
  /** 없으면 기본 "Book Korean Clubs"(언어별) */
  label?: string;
  /** 클릭 이벤트 구분값(foreign_sidebar_cta_click.kind) */
  kind: string;
  /** 버튼 위(조기 마감 한 줄 등) */
  above?: React.ReactNode;
  /** 버튼 아래(찜 버튼 등) */
  below?: React.ReactNode;
};

export function ForeignSidebar({
  lang,
  activeKey = null,
  onSelect,
  navLabels,
  cta,
}: {
  lang: Lang;
  /** 현재 활성 항목. SEO·상세 페이지처럼 어느 탭도 아니면 null. */
  activeKey?: ForeignNavKey | null;
  /** 넘기면 버튼(홈 내부 탭 전환), 없으면 홈으로 가는 링크. */
  onSelect?: (key: ForeignNavKey) => void;
  /** 홈이 이미 번역해 둔 탭 라벨을 그대로 쓰기 위한 오버라이드. */
  navLabels?: Record<ForeignNavKey, string>;
  /** 없으면 기본 "Book Korean Clubs", null이면 버튼 숨김(예약 폼 화면 — 자기 자신으로 가는 링크라). */
  cta?: ForeignSidebarCta | null;
}) {
  const t = makeT(lang);
  const tr = (en: string) => t("", en);

  // 신뢰 문구("N requests on-going right now") — 사이드바는 EnHomeClient와 별도로
  // 여러 페이지(SEO·클럽·폼)에 박히는 공용 컴포넌트라 서버 prop을 못 받는다. anon으로도
  // 안전한 count_open_foreign_requests() RPC(Migration 638, 행 데이터 미노출)를 직접 호출.
  const [openRequestCount, setOpenRequestCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    createClient()
      .rpc("count_open_foreign_requests")
      .then(({ data }) => {
        if (!cancelled) setOpenRequestCount(typeof data === "number" ? data : null);
      });
    return () => { cancelled = true; };
  }, []);

  const label = (key: ForeignNavKey) =>
    navLabels?.[key] ??
    {
      home: tr("Home"),
      my: tr("My"),
      qa: tr("Q&A"),
      map: tr("Map"),
    }[key];

  const guides = [
    { href: `/${lang}/dress-code`, label: t("드레스코드", "Dress code", "ドレスコード", "着装要求", "服裝規定") },
    { href: `/${lang}/club-prices`, label: t("클럽 가격", "Club prices", "クラブ料金", "夜店价格", "夜店價格") },
    { href: `/${lang}/club-hours`, label: t("영업시간", "Opening hours", "営業時間", "营业时间", "營業時間") },
    { href: `/${lang}/club-entry-rules`, label: t("입장 규정", "Entry rules", "入場ルール", "入场规定", "入場規定") },
  ];

  const saved = useSavedClubs();
  const itemCls = (on: boolean) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-bold transition-colors ${
      on ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <aside className="hidden lg:flex lg:flex-col lg:shrink-0 lg:w-[248px] lg:sticky lg:top-0 lg:h-screen border-r border-border px-4 py-6">
      {/* 위쪽(로고·메뉴·가이드·찜 목록)만 스크롤, 아래 예약 버튼 묶음은 항상 화면 안에 고정.
          클럽 상세는 데스크톱에서 이 버튼이 유일한 예약 버튼인데, 찜이 2곳만 넘어도 노트북 높이(680px)에서
          버튼이 화면 밖으로 밀려 안 보였다(2026-09-26 크리틱 실측). */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
      <Link href={`/${lang}`} className="px-2.5 pb-6 block">
        <p className="text-[18px] font-black tracking-tight leading-none">NightFlow</p>
      </Link>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ key, icon }) =>
          onSelect ? (
            <button key={key} type="button" onClick={() => onSelect(key)} className={itemCls(activeKey === key)}>
              {icon}
              {label(key)}
            </button>
          ) : (
            <Link
              key={key}
              href={key === "home" ? `/${lang}` : `/${lang}?tab=${key}`}
              className={itemCls(activeKey === key)}
            >
              {icon}
              {label(key)}
            </Link>
          )
        )}
      </nav>

      <div className="h-px bg-border my-5 mx-3" />

      <p className="px-3 mb-2.5 text-[11px] font-black text-muted-foreground uppercase tracking-widest">
        {tr("Know before you go")}
      </p>
      <nav className="flex flex-col gap-0.5">
        {guides.map((g) => (
          <Link
            key={g.href}
            href={g.href}
            className="px-3 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {g.label}
          </Link>
        ))}
      </nav>

      {/* Plan your Memory(2026-10-01) — 동네 목록 대신 넓은 입구 하나. 동네 이름을 모르는 사람도
          "밤에 뭘 할지 고르는 곳"으로 읽히게. 아직 영어판만 있어 en에서만 보인다. */}
      {lang === "en" && (
        <Link
          href="/en/night-activities"
          onClick={() => trackForeignEvent("foreign_sidebar_cta_click", { lang, kind: "plan_memory" })}
          className="mt-5 mx-1 flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-3 hover:border-foreground/30 transition-colors"
        >
          <span className="text-[18px] leading-none">🌙</span>
          <span className="text-[13.5px] font-black text-foreground">Night Activities</span>
        </Link>
      )}

      {/* 찜한 클럽 — 팝업 시트 대신 사이드바에 상시 노출한다. 이전엔 헤더의
          하트 버튼을 눌러야만 보이는 시트였는데, 그러면 "찜했다는 사실"이
          화면 밖으로 사라져서 고민 중인 후보를 계속 보며 비교할 수가 없었다.
          20곳 넘는 외국인 페이지가 이 사이드바를 공유하므로 여기 한 번만
          넣으면 어디서든(클럽 상세를 보다가도, 예약 폼을 채우다가도) 보인다. */}
      {saved.length > 0 && (
        <div className="mt-5">
          <p className="px-3 mb-2.5 text-[11px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
            <Heart className="w-3 h-3 text-brand-amber fill-current" />
            {tr("Saved clubs")}
          </p>
          <div className="flex flex-col gap-1.5 px-1 max-h-[260px] overflow-y-auto">
            {saved.map((c) => (
              <div key={c.id} className="flex items-center gap-1 rounded-xl bg-card border border-border">
                <Link rel="nofollow"
                  href={`/flags/new?lang=${lang}&club=${c.id}`}
                  onClick={() =>
                    trackForeignEvent("foreign_sidebar_saved_club_click", {
                      lang,
                      club_id: c.id,
                      club_name: c.name_en?.trim() || c.name,
                    })
                  }
                  className="flex items-center gap-2.5 min-w-0 flex-1 p-2 text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-muted overflow-hidden shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {c.thumbnail_url && (
                      <img src={c.thumbnail_url} alt={c.name_en || c.name} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-foreground truncate">
                      {c.name_en?.trim() || c.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{areaLabel(c.area, lang)}</p>
                  </div>
                </Link>
                <button
                  type="button"
                  aria-label={t("찜 해제", "Remove", "解除", "移除")}
                  onClick={() => removeSavedClub(c.id)}
                  className="shrink-0 p-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      </div>

      <div className="shrink-0 flex flex-col gap-3 px-1 pt-4">
        <div className="flex justify-center">
          <LangSwitcher />
        </div>
        {!!openRequestCount && (
          <p className="text-center text-[13px] text-foreground">
            <span className="font-bold text-amber-500 tabular-nums">{openRequestCount}</span>
            {" "}
            {tr("requests on-going right now")}
          </p>
        )}
        {cta !== null && (
          <>
            {cta?.above}
            <Link
              href={cta?.href ?? `/flags/new?lang=${lang}`}
              // 폼(/flags/new)으로 가는 경우만 nofollow — "See bookable clubs"는 색인 대상인 지역 목록으로 간다.
              rel={(cta?.href ?? "/flags/new").startsWith("/flags/new") ? "nofollow" : undefined}
              // 모든 외국어 페이지에 상시 노출되는 CTA인데 클릭 추적이 없어서, 여기로
              // 전환한 사람이 퍼널 분모·분자 양쪽에서 통째로 빠져 있었다(2026-09-06).
              onClick={() =>
                trackForeignEvent("foreign_sidebar_cta_click", {
                  lang,
                  saved_count: saved.length,
                  kind: cta?.kind ?? "default",
                })
              }
              className="block text-center px-3 py-3.5 rounded-full bg-amber-500 text-black font-black text-[14px] leading-tight hover:bg-amber-400 transition-colors"
            >
              {cta?.label ?? tr("Book Korean Clubs")}
            </Link>
            {cta?.below}
          </>
        )}
      </div>
    </aside>
  );
}

/** SEO·클럽·폼 페이지를 감싸는 셸. 홈은 자체 h-screen 구조라 ForeignSidebar를 직접 쓴다. */
export function ForeignShell({
  lang,
  activeKey = null,
  sidebarCta,
  children,
}: {
  lang: Lang;
  activeKey?: ForeignNavKey | null;
  /** ForeignSidebar.cta 그대로 — 없으면 기본, null이면 숨김. */
  sidebarCta?: ForeignSidebarCta | null;
  children: React.ReactNode;
}) {
  return (
    <div className="lg:flex lg:items-start bg-background">
      <ForeignSidebar lang={lang} activeKey={activeKey} cta={sidebarCta} />
      <div className="lg:flex-1 lg:min-w-0">{children}</div>
    </div>
  );
}
