"use client";

import Link from "next/link";
import { Home, User, HelpCircle, Map } from "lucide-react";
import { type Lang, makeT } from "@/lib/i18n";
import { LangSwitcher } from "@/components/layout/LangSwitcher";

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

export function ForeignSidebar({
  lang,
  activeKey = null,
  onSelect,
  navLabels,
}: {
  lang: Lang;
  /** 현재 활성 항목. SEO·상세 페이지처럼 어느 탭도 아니면 null. */
  activeKey?: ForeignNavKey | null;
  /** 넘기면 버튼(홈 내부 탭 전환), 없으면 홈으로 가는 링크. */
  onSelect?: (key: ForeignNavKey) => void;
  /** 홈이 이미 번역해 둔 탭 라벨을 그대로 쓰기 위한 오버라이드. */
  navLabels?: Record<ForeignNavKey, string>;
}) {
  const t = makeT(lang);
  const tr = (en: string) => t("", en);

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

  const itemCls = (on: boolean) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-bold transition-colors ${
      on ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <aside className="hidden lg:flex lg:flex-col lg:shrink-0 lg:w-[248px] lg:sticky lg:top-0 lg:h-screen border-r border-border px-4 py-6">
      <Link href={`/${lang}`} className="px-2.5 pb-6 block">
        <p className="text-[18px] font-black tracking-tight leading-none">NightFlow</p>
        <p className="text-[11px] text-muted-foreground leading-none mt-1">{tr("Korea Club Guide")}</p>
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

      <div className="flex-1" />

      <div className="flex flex-col gap-3 px-1">
        <div className="flex justify-center">
          <LangSwitcher />
        </div>
        <Link
          href={`/flags/new?lang=${lang}`}
          className="block text-center py-3.5 rounded-full bg-amber-500 text-black font-black text-[14px] hover:bg-amber-400 transition-colors"
        >
          {tr("Book with NightFlow")}
        </Link>
      </div>
    </aside>
  );
}

/** SEO·클럽·폼 페이지를 감싸는 셸. 홈은 자체 h-screen 구조라 ForeignSidebar를 직접 쓴다. */
export function ForeignShell({
  lang,
  activeKey = null,
  children,
}: {
  lang: Lang;
  activeKey?: ForeignNavKey | null;
  children: React.ReactNode;
}) {
  return (
    <div className="lg:flex lg:items-start bg-background">
      <ForeignSidebar lang={lang} activeKey={activeKey} />
      <div className="lg:flex-1 lg:min-w-0">{children}</div>
    </div>
  );
}
