"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Check, Plus, Minus, Info, ChevronDown } from "lucide-react";
import { type Lang } from "@/lib/i18n";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type {
  ClubMenuItem,
  ClubMenuCombo,
  MenuCategory,
  SelectedMenuSnapshot,
} from "@/types/database";
import { useMenuSelection, type ResolvedLine } from "@/hooks/useMenuSelection";

// 손님이 술 메뉴를 직접 고르는 화면.
//
// 레이아웃은 폭에 따라 크게 갈리지만(모바일=가로 탭+하단 고정바 /
// 데스크탑=세로 목록+오른쪽 장바구니) 가격 계산은 useMenuSelection 하나를 공유한다.
// 선택형 세트 업차지·평일주말·존·테이블차지가 얽혀 있어 두 벌로 두면 사고가 난다.

const CATEGORY_LABEL: Record<MenuCategory, Record<Lang, string>> = {
  champagne: { ko: "샴페인", en: "Champagne", ja: "シャンパン", zh: "香槟", "zh-tw": "香檳" },
  liqueur:   { ko: "리큐르", en: "Liqueur",   ja: "リキュール", zh: "利口酒", "zh-tw": "利口酒" },
  whisky:    { ko: "위스키", en: "Whisky",    ja: "ウイスキー", zh: "威士忌", "zh-tw": "威士忌" },
  tequila:   { ko: "데킬라", en: "Tequila",   ja: "テキーラ",   zh: "龙舌兰", "zh-tw": "龍舌蘭" },
  vodka:     { ko: "보드카", en: "Vodka",     ja: "ウォッカ",   zh: "伏特加", "zh-tw": "伏特加" },
  cognac:    { ko: "코냑",   en: "Cognac",    ja: "コニャック", zh: "干邑",   "zh-tw": "干邑" },
  gin:       { ko: "진",     en: "Gin",       ja: "ジン",       zh: "金酒",   "zh-tw": "琴酒" },
  rum:       { ko: "럼",     en: "Rum",       ja: "ラム",       zh: "朗姆酒", "zh-tw": "蘭姆酒" },
  set:       { ko: "세트",   en: "Set",       ja: "セット",     zh: "套餐",   "zh-tw": "套餐" },
};

const CATEGORY_ORDER: MenuCategory[] = [
  "champagne", "whisky", "cognac", "tequila", "vodka", "gin", "rum", "liqueur", "set",
];

/** ₩5.9M / ₩450k — 자릿수가 커지면 원 단위는 못 읽는다. */
function fmt(won: number, lang: Lang): string {
  if (lang === "ko") return `₩${(won / 10000).toLocaleString()}만`;
  if (won >= 1000000) {
    const m = won / 1000000;
    return `₩${m.toFixed(won % 1000000 === 0 ? 0 : 1)}M`;
  }
  return `₩${(won / 1000).toLocaleString()}k`;
}

function itemName(item: ClubMenuItem, lang: Lang): string {
  return lang === "ko" ? (item.name_ko ?? item.name_en) : item.name_en;
}

export type MenuPickerProps = {
  lang: Lang;
  items: ClubMenuItem[];
  combos: ClubMenuCombo[];
  /** 방문일이 주말인지. 주말이면 price_weekend와 주말 차지를 쓴다. */
  isWeekend: boolean;
  tableChargeWeekday: number | null;
  tableChargeWeekend: number | null;
  /** 층별 가격표가 있는 클럽에서 고른 존. 존이 있는 클럽인데 null이면 존 선택을 먼저 띄운다. */
  zone?: string | null;
  onZoneChange?: (zone: string) => void;
  /** 하단 합계 바를 띄울 높이(px). 앱 하단 네비를 피하려고 기본 60이지만,
   *  시트 안에서는 네비가 오버레이에 가려지므로 0을 넘겨 바닥에 붙인다. */
  bottomOffset?: number;
  /** 이 클럽(지역)의 최소주문금액. 넘겨주면 합계가 이 밑일 때 안내하고 Continue를 막는다. */
  minAmount?: number;
  /** 수정하러 시트를 다시 열 때 복원할 이전 선택. 없으면 빈 상태로 시작한다. */
  initialSnapshot?: SelectedMenuSnapshot | null;
  /** 담을 때마다 부모에게 현재 상태를 올린다. 시트를 X로 닫아도 부모가 들고 있다가
   *  다시 열 때 initialSnapshot으로 되돌려주면 담은 게 날아가지 않는다.
   *  (이 컴포넌트는 시트가 닫히면 언마운트돼서 자체 상태로는 못 지킨다) */
  onDraftChange?: (snapshot: SelectedMenuSnapshot, total: number) => void;
  onDone: (snapshot: SelectedMenuSnapshot, total: number) => void;
};

export function MenuPicker({
  lang,
  items,
  combos,
  isWeekend,
  tableChargeWeekday,
  tableChargeWeekend,
  zone = null,
  onZoneChange,
  bottomOffset = 60,
  minAmount,
  initialSnapshot = null,
  onDraftChange,
  onDone,
}: MenuPickerProps) {
  const sel = useMenuSelection({
    items, combos, isWeekend, tableChargeWeekday, tableChargeWeekend, zone, initialSnapshot,
  });

  // 담을 때마다 부모에 초안을 올린다 — 시트를 X로 닫아도 살아남게.
  // 복원(initialSnapshot 반영)이 끝나기 전에 올리면 빈 초안이 부모의 기존 선택을
  // 덮어써서 오히려 다 지운다. sel.restored가 true가 된 뒤부터만 올린다.
  const draftRef = useRef(onDraftChange);
  draftRef.current = onDraftChange;
  useEffect(() => {
    if (!sel.restored) return;
    draftRef.current?.(sel.snapshot(), sel.total);
  }, [sel.restored, sel.snapshot, sel.total]);

  // 이 클럽에 존이 있으면 손님이 먼저 골라야 한다 — 같은 술이 층마다 값이 다르다.
  const zones = useMemo(() => {
    const s = new Set(items.map((i) => i.zone).filter((z): z is string => !!z));
    return [...s];
  }, [items]);
  const needsZone = zones.length > 0 && !zone;

  // "Best" 탭 — 손님이 처음 보는 화면.
  //
  // 클럽 한 곳에 담을 수 있는 조합이 50~90개나 돼서, 카테고리 탭만 주면 "뭘 골라야
  // 최소금액이 맞나" 재다가 포기한다. 그래서 클럽이 메뉴판에서 이미 밀고 있는
  // 세트를 맨 앞에 세운다 — 우리가 지어내는 게 아니라 클럽의 큐레이션이다.
  //
  // 세 갈래로 모은다:
  //   ① set 카테고리 항목 (BERMUDA A/B/C, OCEAN 하드보틀세트, 그루브 바틀세트)
  //   ② 병수 세트가 붙은 항목 (DM SEOUL "CHAMPAGNE SET MENU" 3/5/10병이 여기 해당)
  //      — 지금은 각 술 행을 펼쳐야만 보여서 세트 메뉴가 있다는 걸 아예 모른다
  //   ③ ①②가 없는 클럽(Club Ace·DM은 싼 세트가 없다)은 입문가 단품으로 채운다
  //      — 빈 탭을 띄우느니 "여기서부터 시작" 목록을 주는 게 낫다
  const bestItems = useMemo(() => {
    const pool = sel.visibleItems.filter((i) => !i.is_vvip);
    const sets = pool.filter((i) => i.category === "set");
    const bottleSets = pool.filter(
      (i) => i.category !== "set" && (i.variants?.length ?? 0) > 1,
    );
    const lowestOf = (i: ClubMenuItem) =>
      Math.min(...(i.variants ?? []).map((v) => (isWeekend ? (v.price_weekend ?? v.price) : v.price)));
    const byPrice = (a: ClubMenuItem, b: ClubMenuItem) => lowestOf(a) - lowestOf(b);

    const curated = [...sets.sort(byPrice), ...bottleSets.sort(byPrice)];
    if (curated.length > 0) return curated.slice(0, 12);
    // 폴백: 싼 순 단품
    return [...pool].sort(byPrice).slice(0, 8);
  }, [sel.visibleItems, isWeekend]);

  const categories = useMemo(() => {
    const present = new Set(sel.visibleItems.filter((i) => !i.is_vvip).map((i) => i.category));
    const list = CATEGORY_ORDER.filter((c) => present.has(c));
    const hasVvip = sel.visibleItems.some((i) => i.is_vvip);
    return [
      ...(bestItems.length ? (["best"] as const) : []),
      ...list,
      ...(hasVvip ? (["vvip"] as const) : []),
      ...(combos.length ? (["combo"] as const) : []),
    ];
  }, [sel.visibleItems, combos.length, bestItems.length]);

  const [tab, setTab] = useState<string>("");
  const activeTab = tab && categories.includes(tab as never) ? tab : (categories[0] as string);

  const shown = useMemo(() => {
    if (activeTab === "best") return bestItems;
    if (activeTab === "vvip") return sel.visibleItems.filter((i) => i.is_vvip);
    if (activeTab === "combo") return [];
    return sel.visibleItems.filter((i) => !i.is_vvip && i.category === activeTab);
  }, [sel.visibleItems, activeTab, bestItems]);

  // 선택형 세트를 담을 때 뜨는 시트. 후보를 다 고르기 전엔 담기지 않는다.
  const [picking, setPicking] = useState<{ item: ClubMenuItem; variantId: string } | null>(null);

  const tabLabel = (c: string) =>
    c === "best" ? (lang === "ko" ? "추천" : "Best")
    : c === "vvip" ? "VVIP"
    : c === "combo" ? (lang === "ko" ? "조합" : "Combo")
    : CATEGORY_LABEL[c as MenuCategory][lang];

  if (needsZone) {
    return (
      <div className="p-4">
        <p className="text-sm font-bold mb-1">
          {lang === "ko" ? "어느 층인가요?" : "Which floor?"}
        </p>
        <p className="text-xs text-muted-foreground mb-3">
          {lang === "ko"
            ? "층마다 가격이 다릅니다."
            : "Prices differ by floor."}
        </p>
        <div className="grid gap-2">
          {zones.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => onZoneChange?.(z)}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-left text-sm font-semibold hover:bg-muted"
            >
              {z}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    // 배달앱처럼 왼쪽 세로 카테고리 + 오른쪽 스크롤 목록. 모바일도 데스크탑도
    // 같은 좌우 분할 구조 — 예전엔 모바일만 상단 가로 pill이었는데, 항목이
    // 접혔다 펼쳐지는 구조(Best 탭 등)와 안 맞아 "진짜 카테고리 탭"으로 통일한다.
    <div className="flex gap-0 items-start">
      {/* 왼쪽 카테고리 레일 — 화면 높이만큼 고정, 자체 스크롤 */}
      <nav
        className="
          w-[92px] shrink-0 sticky top-0
          flex flex-col gap-0.5 overflow-y-auto
          max-h-[calc(100vh-140px)] lg:max-h-none lg:overflow-visible
          border-r border-border pr-2 py-1
          lg:w-44 lg:pr-4
        "
      >
        {categories.map((c) => {
          const on = activeTab === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setTab(c as string)}
              className={`w-full rounded-lg px-2.5 py-2.5 text-[12.5px] font-bold text-center leading-tight transition
                lg:px-3 lg:py-2 lg:text-left lg:text-sm
                ${on ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
            >
              {tabLabel(c as string)}
            </button>
          );
        })}
      </nav>

      {/* 항목 목록 — 모바일 1열, 데스크탑 2열 */}
      <div className="flex-1 min-w-0 pl-3 lg:pl-6">
        {activeTab === "combo" ? (
          <ComboPicker
            lang={lang}
            combos={combos}
            value={sel.combo}
            onChange={sel.setCombo}
          />
        ) : (
          <ul className="divide-y divide-border lg:grid lg:grid-cols-2 lg:gap-3 lg:divide-y-0 lg:pt-1">
            {shown.map((item) => (
              <MenuRow
                key={item.id}
                lang={lang}
                item={item}
                isWeekend={isWeekend}
                onAdd={(variantId) => {
                  const hasChoices = (item.choices?.length ?? 0) > 0;
                  if (hasChoices) setPicking({ item, variantId });
                  else sel.add(item.id, variantId);
                }}
              />
            ))}
          </ul>
        )}
        {/* 하단 고정바(카트 목록 최대 38vh + 합계 69px + 앱 네비 60px)에 마지막
            항목이 가리지 않도록 확보. 담은 게 있으면 더 크게 비운다. */}
        <div className={`lg:hidden ${sel.count > 0 ? "h-[52vh]" : "h-32"}`} aria-hidden />
      </div>

      {/* 하단 고정바 — 모바일 전용. 담은 게 있으면 CartList(수량 조절·삭제 가능)를
          접지 않고 항상 펼쳐서 그 위에 얹는다 — 탭해야만 보이는 시트로 했더니
          "뭘 담았는지 상시 보여야 한다"는 지적이 있었다. 개수가 늘어나도 화면을
          다 덮지 않도록 목록 부분만 최대 높이+스크롤을 둔다.
          앱 하단 네비(fixed bottom-0, h-60px, z-50) 위에 얹어야 해서 z-50 + bottomOffset. */}
      <div
        className="lg:hidden fixed left-0 right-0 z-50 border-t border-border bg-background"
        style={{ bottom: bottomOffset }}
      >
        {sel.count > 0 && (
          <div className="max-h-[38vh] overflow-y-auto border-b border-border px-4 py-3">
            <CartList lang={lang} sel={sel} />
          </div>
        )}
        <div className="px-4 py-3">
          <Summary
            lang={lang}
            sel={sel}
            minAmount={minAmount}
            onDone={() => onDone(sel.snapshot(), sel.total)}
          />
        </div>
      </div>

      {/* 데스크탑 합계 — 오른쪽 패널로 상주.
          ml-6로 목록과 간격을 두고, 자체 스크롤을 둬서 담은 게 많아져도
          패널이 화면 밖으로 넘치지 않게 한다. 예전엔 목록 카드 위로 겹쳐 보였다. */}
      <aside className="hidden lg:block lg:w-72 lg:shrink-0 lg:sticky lg:top-4 lg:ml-6 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <div className="rounded-xl border border-border bg-card p-4">
          <CartList lang={lang} sel={sel} />
          <div className="mt-4 border-t border-border pt-3">
            <Summary lang={lang} sel={sel} minAmount={minAmount} onDone={() => onDone(sel.snapshot(), sel.total)} />
          </div>
        </div>
      </aside>

      {picking && (
        <ChoiceSheet
          lang={lang}
          item={picking.item}
          onCancel={() => setPicking(null)}
          onConfirm={(picks) => {
            sel.add(picking.item.id, picking.variantId, picks);
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}

/** 항목 한 줄. 옵션이 여러 개면 칩으로 갈라 보여준다. */
function MenuRow({
  lang, item, isWeekend, onAdd, defaultOpen = false,
}: {
  lang: Lang;
  item: ClubMenuItem;
  isWeekend: boolean;
  onAdd: (variantId: string) => void;
  /** Best 탭에서는 접어두면 세트가 또 숨어버린다 — 처음부터 펼쳐서 보여준다. */
  defaultOpen?: boolean;
}) {
  const variants = item.variants ?? [];
  const priceOf = (vId: string) => {
    const v = variants.find((x) => x.id === vId);
    if (!v) return 0;
    return isWeekend ? (v.price_weekend ?? v.price) : v.price;
  };

  // 조건 문구는 부연이 아니라 돈·입장 조건이다("바틀 주문 시 무료입장",
  // "킵술 오픈 시 인당 1만원"). 한국어 원문만 있던 탓에 영어 손님에게 한글이
  // 그대로 나가고 있었다(2026-09-06, 54건). 영어판이 있으면 그걸 쓰고,
  // 없으면 아예 감춘다 — 못 읽는 문장은 정보가 아니라 소음이다.
  const note = lang === "ko" ? item.condition_note : (item.condition_note_en ?? null);

  // "평일 한정"처럼 요일을 못 박는 조건은 우리가 방문일을 이미 알고 있으므로
  // 아예 담기지 않게 막는다. 담게 두면 손님이 확정서까지 받고 현장에서 거절당한다.
  // 원문 기준으로 판정한다 — 번역이 비어 있어도 차단은 걸려야 한다.
  const weekdayOnly = /weekday|평일/i.test(item.condition_note ?? "");
  const blocked = weekdayOnly && isWeekend;

  // 옵션을 전부 펼쳐두면 한 항목이 4줄을 먹어서 한 화면에 5개도 안 들어간다.
  // 기본은 이름 + 최저가 한 줄로 접어두고, 눌러야 옵션이 나온다.
  // 옵션이 하나뿐인 항목은 펼칠 게 없으니 탭 한 번에 바로 담긴다.
  const [open, setOpen] = useState(defaultOpen);
  // 방금 담은 옵션 — 잠깐 초록으로 눌린 표시를 준다. 토스트 팝업은 화면을 덮어
  // 그 아래 항목을 못 누르게 만들어서 뺐고, 대신 누른 칩 자체가 반응하게 한다.
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const single = variants.length === 1;
  const cheapest = variants.length
    ? Math.min(...variants.map((v) => priceOf(v.id)))
    : 0;

  return (
    <li className={`lg:rounded-xl lg:border lg:border-border lg:bg-card ${blocked ? "opacity-45" : ""}`}>
      {/* 접힌 줄 전체가 버튼 — 손가락으로 정확히 겨냥할 필요가 없어야 한다. */}
      <button
        type="button"
        disabled={blocked}
        onClick={() => {
          if (!single) return setOpen((o) => !o);
          // 단품은 행 전체가 담기 버튼이라 여기서도 같은 피드백을 준다.
          onAdd(variants[0].id);
          setJustAdded(variants[0].id);
          window.setTimeout(
            () => setJustAdded((cur) => (cur === variants[0].id ? null : cur)),
            600,
          );
        }}
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left lg:px-3 transition-colors duration-200 disabled:cursor-not-allowed ${
          single && justAdded === variants[0]?.id ? "bg-money/10" : ""
        }`}
      >
        {/* 병 사진이 있는 항목만 이미지 칸을 만든다. 없으면 칸 자체를 빼서 이름이
            줄 왼쪽에서 시작하게 둔다 — 빈 칸을 자리표시자로 채우면(색 막대 등)
            아무 정보도 주지 않으면서 이름이 밀려나기만 한다.
            사진 배경이 검은색이라(주대 사진에서 오려냄) 칸 배경도 검정으로 맞춘다. */}
        {item.image_url && (
          <div className="w-9 h-9 shrink-0 rounded-md bg-black overflow-hidden flex items-center justify-center">
            <img src={item.image_url} alt="" loading="lazy" className="w-full h-full object-contain" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* 영문 아래 한글을 병기하지는 않는다 — 줄이 두 배로 길어져 한 화면에 담기는
              항목 수가 반으로 준다(외국인 손님에겐 한글이 정보가 아니라 소음이다).
              다만 이름 자체는 두 줄까지 허용한다: 세트는 "CHAMPAGNE SET - DOM PERIGNON
              LUMINOUS"처럼 길어서 한 줄로 자르면 무슨 샴페인인지가 잘려나간다. */}
          <p className="text-sm font-semibold leading-tight line-clamp-2 break-keep">{itemName(item, lang)}</p>
          {note && (
            <p className="text-[11px] text-amber-600 leading-tight flex items-center gap-1">
              <Info className="w-3 h-3 shrink-0" />
              <span className="truncate">
                {note}
                {blocked && ` · ${lang === "ko" ? "이 날짜 불가" : "not available"}`}
              </span>
            </p>
          )}
        </div>

        <span className="shrink-0 text-sm font-bold text-money tabular-nums">
          {single && justAdded === variants[0]?.id ? (
            <span className="flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              {lang === "ko" ? "담김" : "Added"}
            </span>
          ) : (
            <>
              {/* 옵션이 여럿이면 최저가에 ~를 붙여 "여기서부터"임을 알린다. */}
              {fmt(cheapest, lang)}{!single && "~"}
            </>
          )}
        </span>
        {!single && (
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {open && !single && (
        <div className="px-4 pb-3 pl-16 lg:pl-14">
          {item.description && (
            <p className="text-[11px] text-muted-foreground mb-1.5 leading-snug">{item.description}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {variants.map((v) => {
              const added = justAdded === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={blocked}
                  onClick={() => {
                    onAdd(v.id);
                    setJustAdded(v.id);
                    window.setTimeout(() => setJustAdded((cur) => (cur === v.id ? null : cur)), 600);
                  }}
                  className={`rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200 disabled:cursor-not-allowed ${
                    added
                      ? "border-money bg-money/20 scale-95"
                      : "border-border bg-muted hover:bg-muted/70"
                  }`}
                >
                  {added ? (
                    <span className="flex items-center gap-1 text-money">
                      <Check className="w-3 h-3" />
                      {lang === "ko" ? "담김" : "Added"}
                    </span>
                  ) : (
                    <>
                      <span className="mr-1 opacity-70">{v.label_en}</span>
                      <span className="text-money">{fmt(priceOf(v.id), lang)}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </li>
  );
}

/** 선택형 세트("하드 1 + 샴페인 1, 하드는 7종 중 택1")의 후보 고르기. */
function ChoiceSheet({
  lang, item, onCancel, onConfirm,
}: {
  lang: Lang;
  item: ClubMenuItem;
  onCancel: () => void;
  onConfirm: (picks: Record<number, string>) => void;
}) {
  const slots = useMemo(() => {
    const s = new Set((item.choices ?? []).map((c) => c.slot_no));
    return [...s].sort((a, b) => a - b);
  }, [item.choices]);

  const [picks, setPicks] = useState<Record<number, string>>({});
  const ready = slots.every((s) => picks[s]);

  return (
    <Sheet open onOpenChange={(o) => !o && onCancel()}>
      <SheetContent side="bottom" className="rounded-t-3xl bg-card border-border max-w-lg mx-auto p-5 pb-8">
        <SheetTitle className="text-base font-bold">{itemName(item, lang)}</SheetTitle>
        {item.description && (
          <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
        )}

        <div className="mt-4 space-y-4 max-h-[55vh] overflow-y-auto">
          {slots.map((slot) => (
            <div key={slot}>
              {slots.length > 1 && (
                <p className="text-xs font-bold text-muted-foreground mb-1.5">
                  {lang === "ko" ? `${slot}번째 선택` : `Choice ${slot}`}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {(item.choices ?? [])
                  .filter((c) => c.slot_no === slot)
                  .map((c) => {
                    const on = picks[slot] === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setPicks((p) => ({ ...p, [slot]: c.id }))}
                        className={`rounded-lg border px-3 py-2 text-left text-xs transition
                          ${on ? "border-foreground bg-muted font-bold" : "border-border bg-background"}`}
                      >
                        <span className="flex items-center gap-1">
                          {on && <Check className="w-3 h-3 shrink-0" />}
                          {lang === "ko" ? (c.name_ko ?? c.name_en) : c.name_en}
                        </span>
                        {c.extra_price > 0 && (
                          <span className="block text-money mt-0.5">+{fmt(c.extra_price, lang)}</span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={!ready}
          onClick={() => onConfirm(picks)}
          className="mt-5 w-full rounded-full bg-foreground py-3 text-sm font-bold text-background disabled:opacity-40"
        >
          {lang === "ko" ? "담기" : "Add"}
        </button>
      </SheetContent>
    </Sheet>
  );
}

/** 샴페인 N + 하드 M 조합 (Club Ace). */
function ComboPicker({
  lang, combos, value, onChange,
}: {
  lang: Lang;
  combos: ClubMenuCombo[];
  value: { cham: number; hard: number } | null;
  onChange: (v: { cham: number; hard: number } | null) => void;
}) {
  const cham = value?.cham ?? 0;
  const hard = value?.hard ?? 0;
  const hit = combos.find((c) => c.cham_count === cham && c.hard_count === hard);
  const maxTotal = Math.max(...combos.map((c) => c.cham_count + c.hard_count));

  // 계산된 키({ cham, hard, [k]: ... })로 쓰면 타입이 넓어져 next.cham을 읽을 때
  // 갱신 전 값이 잡힌다. 두 필드를 명시적으로 만든다.
  const step = (k: "cham" | "hard", d: number) => {
    const next =
      k === "cham"
        ? { cham: Math.max(0, cham + d), hard }
        : { cham, hard: Math.max(0, hard + d) };
    if (next.cham + next.hard > maxTotal) return;
    onChange(next.cham + next.hard === 0 ? null : next);
  };

  const Row = ({ label, n, k }: { label: string; n: number; k: "cham" | "hard" }) => (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
      <span className="text-sm font-semibold">{label}</span>
      {/* 44px 터치 타겟 — 이전엔 32px(w-8)라 금액이 바로 바뀌는 버튼치고 오조작이
          나기 쉬웠다. 아이콘 크기는 그대로 두고 버튼 자체를 키운다. */}
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => step(k, -1)}
          className="w-11 h-11 rounded-full bg-muted flex items-center justify-center disabled:opacity-30"
          disabled={n === 0}>
          <Minus className="w-4 h-4" />
        </button>
        <span className="w-6 text-center text-sm font-bold tabular-nums">{n}</span>
        <button type="button" onClick={() => step(k, 1)}
          className="w-11 h-11 rounded-full bg-muted flex items-center justify-center disabled:opacity-30"
          disabled={cham + hard >= maxTotal}>
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-4 space-y-2">
      <p className="text-xs text-muted-foreground">
        {lang === "ko"
          ? `샴페인과 하드를 합쳐 최대 ${maxTotal}병까지 고를 수 있습니다.`
          : `Mix champagne and hard liquor, up to ${maxTotal} bottles.`}
      </p>
      <Row label={lang === "ko" ? "샴페인" : "Champagne"} n={cham} k="cham" />
      <Row label={lang === "ko" ? "하드" : "Hard liquor"} n={hard} k="hard" />
      {cham + hard > 0 && (
        <p className="pt-1 text-sm font-bold text-money">
          {hit ? fmt(hit.price, lang) : (lang === "ko" ? "해당 조합 없음" : "No such combination")}
        </p>
      )}
    </div>
  );
}

/** 담은 내역 목록. 모바일은 시트 안, 데스크탑은 오른쪽 패널에서 같은 걸 쓴다. */
function CartList({
  lang, sel,
}: {
  lang: Lang;
  sel: ReturnType<typeof useMenuSelection>;
}) {
  if (sel.lines.length === 0 && !sel.combo) {
    return (
      <p className="text-xs text-muted-foreground">
        {lang === "ko" ? "아직 담은 항목이 없습니다." : "Nothing selected yet."}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {sel.lines.map((l: ResolvedLine) => (
        <li key={l.key} className="flex items-start gap-2 text-xs">
          <div className="flex-1 min-w-0">
            <p className="font-semibold leading-tight truncate">{itemName(l.item, lang)}</p>
            <p className="text-muted-foreground leading-tight">
              {l.label}
              {l.pickNames.length > 0 && ` · ${l.pickNames.join(", ")}`}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={() => sel.setQty(l.key, l.qty - 1)}
              className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-4 text-center tabular-nums font-bold">{l.qty}</span>
            <button type="button" onClick={() => sel.setQty(l.key, l.qty + 1)}
              className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
              <Plus className="w-3 h-3" />
            </button>
          </div>
          <span className="w-14 text-right text-money font-bold tabular-nums">
            {fmt(l.lineTotal, lang)}
          </span>
        </li>
      ))}
      {sel.combo && sel.comboPrice > 0 && (
        <li className="flex items-center gap-2 text-xs">
          <span className="flex-1 font-semibold">
            {lang === "ko"
              ? `조합 샴페인 ${sel.combo.cham} + 하드 ${sel.combo.hard}`
              : `Combo: ${sel.combo.cham} champagne + ${sel.combo.hard} hard`}
          </span>
          <button type="button" onClick={() => sel.setCombo(null)}
            className="text-muted-foreground underline">
            {lang === "ko" ? "삭제" : "Remove"}
          </button>
          <span className="w-14 text-right text-money font-bold tabular-nums">
            {fmt(sel.comboPrice, lang)}
          </span>
        </li>
      )}
    </ul>
  );
}

/** 합계 + 다음 버튼. 테이블 차지는 손님이 놓치기 쉬워 별도 줄로 드러낸다. */
function Summary({
  lang, sel, minAmount, onDone,
}: {
  lang: Lang;
  sel: ReturnType<typeof useMenuSelection>;
  minAmount?: number;
  onDone: () => void;
}) {
  // 아무것도 안 담았으면 테이블 차지만 있는 금액을 합계로 띄우지 않는다 —
  // 0개 선택인데 ₩100k가 보이면 이미 뭔가 청구되는 것처럼 읽힌다.
  const empty = sel.count === 0;
  // 최소주문금액에 못 미치는 상태 — 0개(empty)일 때도 사실이다. 처음부터
  // 빨간색으로 보여줘야 "얼마부터 담아야 하는지"를 경고로 인지하고 시작한다.
  // Continue는 아무것도 안 담았을 때(empty)만 별도로 막는다 — belowMin 하나로
  // 합치면 "여기까지 남았어요" 문구가 0개 상태에서 이상하게 읽힌다.
  const belowMin = minAmount != null && sel.total < minAmount;

  return (
    <>
      {!empty && sel.tableCharge > 0 && (
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{lang === "ko" ? "테이블 차지" : "Table charge"}</span>
          <span className="tabular-nums">{fmt(sel.tableCharge, lang)}</span>
        </div>
      )}
      {/* 최소금액은 "아직 못 미쳤을 때"만 띄운다 — 넘긴 뒤에도 계속 떠 있으면
          이미 해결된 조건이 화면을 차지하며 잔소리처럼 남는다. */}
      {minAmount != null && belowMin && (
        <p className="mb-1.5 text-[11px] font-semibold text-red-400">
          {empty
            ? (lang === "ko" ? `최소 주문금액 ${fmt(minAmount, lang)}` : `Minimum order ${fmt(minAmount, lang)}`)
            : (lang === "ko"
                ? `최소 주문금액 ${fmt(minAmount, lang)}까지 ${fmt(minAmount - sel.total, lang)} 남았어요`
                : `Add ${fmt(minAmount - sel.total, lang)} more to reach the ${fmt(minAmount, lang)} minimum`)}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">
            {lang === "ko" ? `${sel.count}개 선택` : `${sel.count} selected`}
          </p>
          <p className="text-lg font-black text-money leading-tight tabular-nums">
            {empty ? "—" : fmt(sel.total, lang)}
          </p>
        </div>
        <button
          type="button"
          disabled={empty || belowMin}
          onClick={onDone}
          className="shrink-0 rounded-full bg-foreground px-6 py-3 text-sm font-bold text-background disabled:opacity-40"
        >
          {lang === "ko" ? "다음" : "Continue"}
        </button>
      </div>
    </>
  );
}
