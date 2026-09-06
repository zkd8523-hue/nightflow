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

/** "평일 한정"인데 방문일이 주말이라 담을 수 없는 항목인지. MenuRow의 판정과
    부모(MenuPicker)가 목록 정렬에 쓰는 판정을 하나로 묶는다 — 따로 두면
    둘이 어긋나서 "흐린 항목인데 위쪽에 있는" 불일치가 난다. */
function isItemBlocked(item: ClubMenuItem, isWeekend: boolean): boolean {
  const weekdayOnly = /weekday|평일/i.test(item.condition_note ?? "");
  return weekdayOnly && isWeekend;
}

/** 항목의 조건 문구. 언어별 컬럼(condition_note/condition_note_en) 중 하나를 고른다.
    MenuRow의 개별 표시와, 부모가 "탭 전체가 같은 문구면 배너로 뺀다" 판정할 때
    똑같이 이 함수를 쓴다 — 따로 두면 둘이 어긋난다. */
function itemNote(item: ClubMenuItem, lang: Lang): string | null {
  return lang === "ko" ? item.condition_note : (item.condition_note_en ?? null);
}

/** "(A / B / C)" 같은 옵션 나열을 description에서 잘라낸다.
    선택형 세트는 description에 "Choose 1 (Malibu / Jameson / ...)"처럼 옵션을
    글로 다시 적어둔 게 12건 있었는데(2026-09-06 실측), 그 아래에 실제 버튼으로
    같은 옵션이 또 나온다 — 완전한 중복이다. "구성품 + Choose N"까지는 버튼에
    없는 정보라 남기고, 괄호 나열만 뗀다.
    엄격한 괄호쌍 매칭 대신 "첫 '(' 뒤에 '/'가 있는가"로 판정한다 — 원본 데이터에
    괄호가 안 닫힌 오타(예: "...Waikiki(Malibu")가 있어 쌍 매칭이면 못 잡는다.
    "(2024 edition)"처럼 슬래시 없는 정상 괄호 설명은 그대로 둔다. */
function stripOptionList(description: string): string {
  const idx = description.indexOf("(");
  if (idx === -1) return description.trim();
  if (!description.slice(idx).includes("/")) return description.trim();
  return description.slice(0, idx).trim();
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

  // 담기 애니메이션 — 목업 3안("눌림+리플") 그대로 구현한다(2026-09-06).
  // 목업은 카드→장바구니의 실제 화면 좌표를 재서 그 사이를 날아가게 했다.
  // MenuRow는 자기 위치만 알고 장바구니가 어디 있는지 모르는 리프 컴포넌트라,
  // 최상위(MenuPicker)에 카트 타겟 ref를 두고 fly 엘리먼트도 여기서 fixed로 띄운다.
  // 모바일(하단 고정바)과 데스크탑(오른쪽 사이드바) 둘 다 존재하지만 한쪽만
  // 화면에 보이므로, 클릭 시점에 실제로 보이는 쪽의 rect를 쓴다.
  const rootRef = useRef<HTMLDivElement>(null);
  const mobileCartRef = useRef<HTMLDivElement>(null);
  const desktopCartRef = useRef<HTMLDivElement>(null);
  const [flights, setFlights] = useState<
    { id: number; from: DOMRect; to: DOMRect; label: string }[]
  >([]);
  const flyId = useRef(0);

  const launchFly = (fromRect: DOMRect, label: string) => {
    const target =
      mobileCartRef.current && mobileCartRef.current.offsetParent !== null
        ? mobileCartRef.current
        : desktopCartRef.current;
    if (!target) return;
    const toRect = target.getBoundingClientRect();
    const id = ++flyId.current;
    setFlights((f) => [...f, { id, from: fromRect, to: toRect, label }]);
    window.setTimeout(() => setFlights((f) => f.filter((x) => x.id !== id)), 620);
  };

  // 병 사진 확대 — 36px 썸네일로는 라벨이 뭔지 잘 안 보인다는 지적(2026-09-06).
  // 실측 결과 활성 메뉴 1,002개 중 74.5%(746개)에 image_url이 있어 확대는
  // 대부분의 항목에서 실제로 작동한다.
  const [imagePreview, setImagePreview] = useState<{ imageUrl: string; label: string } | null>(null);

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
    const list =
      activeTab === "best" ? bestItems
      : activeTab === "vvip" ? sel.visibleItems.filter((i) => i.is_vvip)
      : activeTab === "combo" ? []
      : sel.visibleItems.filter((i) => !i.is_vvip && i.category === activeTab);
    // 못 담는 항목(평일 한정인데 주말 방문)을 목록 맨 아래로 민다. 흐리게만
    // 표시하고 원래 자리에 두면, 위에서부터 훑던 손님이 눌리지 않는 항목을
    // 만나 "왜 이건 안 되지" 하고 멈춘다(2026-09-06). 안정 정렬이라 같은
    // 그룹 안에서는 기존 순서(sort_order 등)가 그대로 유지된다.
    return [...list].sort(
      (a, b) => Number(isItemBlocked(a, isWeekend)) - Number(isItemBlocked(b, isWeekend)),
    );
  }, [sel.visibleItems, activeTab, bestItems, isWeekend]);

  // 조건 문구는 이제 줄/상단 배너 어디에도 목록 화면엔 안 낸다(2026-09-06).
  // "완전히 같을 때만 배너로" 판정은 옵션 개수까지 붙어 항목마다 문구가 조금씩
  // 갈리는 실제 데이터(세트 8개 중 다수가 미세하게 다름)에서 대부분 안 걸려
  // 여전히 화면을 뒤덮었다. 정보는 사라지지 않는다 — 항목을 펼치면(ChoiceSheet)
  // 그때 보여준다.

  // 선택형 세트를 담을 때 뜨는 시트. 후보를 다 고르기 전엔 담기지 않는다.
  const [picking, setPicking] = useState<{ item: ClubMenuItem; variantId: string } | null>(null);

  const tabLabel = (c: string) =>
    c === "best" ? (lang === "ko" ? "추천" : "Best")
    : c === "vvip" ? "VVIP"
    : c === "combo" ? (lang === "ko" ? "조합" : "Combo")
    : CATEGORY_LABEL[c as MenuCategory][lang];

  if (needsZone) {
    return (
      // pt-12: 이 화면은 SheetContent(p-0)에 바로 얹혀서, 시트 기본 닫기 X 버튼
      // (absolute top-4 right-4)이 첫 줄 텍스트와 겹쳤다. X 버튼 높이만큼 띄운다.
      <div className="p-4 pt-12">
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
    // pt-12 px-3: 이 화면도 SheetContent(p-0)에 바로 얹혀서 시트 기본 닫기 X
    // (absolute top-4 right-4)가 카테고리 첫 탭·목록 첫 줄과 겹쳤다(2026-09-06).
    // sticky nav가 top-0을 이 wrapper 기준으로 잡으므로, 패딩은 부모에 준다.
    <div ref={rootRef} className="relative flex gap-0 items-start pt-12 px-3">
      {/* 왼쪽 카테고리 레일 — 화면 높이만큼 고정, 자체 스크롤.
          112px: 92px는 특별한 근거 없이 좁게 잡힌 값이었다(2026-09-06).
          오른쪽 목록 이름이 두 줄로 넘치는 항목(Moët & Chandon N.I.R Rose 등)이
          많아 살짝만 더 준다 — 카테고리 이름은 이미 한 줄로 들어가므로 과하게
          넓힐 필요는 없다. */}
      <nav
        className="
          w-[112px] shrink-0 sticky top-12
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
                onLaunchFly={launchFly}
                onImageClick={(imageUrl, label) => setImagePreview({ imageUrl, label })}
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
        ref={mobileCartRef}
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
      <aside
        ref={desktopCartRef}
        className="hidden lg:block lg:w-72 lg:shrink-0 lg:sticky lg:top-4 lg:ml-6 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
      >
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
          onConfirm={(picks, buttonRect) => {
            sel.add(picking.item.id, picking.variantId, picks);
            // 선택형 세트는 여기, "담기" 버튼을 누른 순간이 진짜 확정이다 —
            // 칩을 눌렀던 시점(ChoiceSheet를 여는 트리거)이 아니라.
            launchFly(buttonRect, itemName(picking.item, lang));
            setPicking(null);
          }}
        />
      )}

      {/* 담기 fly 레이어. getBoundingClientRect()는 뷰포트 기준 좌표라
          position:fixed로 그대로 옮기면 된다 — rootRef에 얹을 필요 없이
          이 컴포넌트의 최상위(시트 위)에서 fixed로 띄운다. */}
      {flights.map((f) => (
        <FlyItem key={f.id} from={f.from} to={f.to} label={f.label} />
      ))}

      {/* 병 사진 확대 시트. 36px 썸네일로는 라벨이 뭔지 잘 안 보인다는
          지적(2026-09-06) — 누르면 큰 이미지로 보여준다. */}
      <Sheet open={!!imagePreview} onOpenChange={(o) => !o && setImagePreview(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl p-5 pb-8">
          <SheetTitle className="text-base font-bold">{imagePreview?.label}</SheetTitle>
          {imagePreview && (
            <div className="mt-3 rounded-2xl bg-black overflow-hidden flex items-center justify-center max-h-[60vh]">
              <img
                src={imagePreview.imageUrl}
                alt={imagePreview.label}
                className="w-full h-full object-contain max-h-[60vh]"
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** 카드에서 장바구니까지 실제 좌표를 타고 날아가는 조각.
    목업(add-to-cart-mockup.html)의 flyPath 그대로: 시작 rect에서 등장해
    끝 rect 중심으로 줄어들며 이동한 뒤 사라진다. */
function FlyItem({ from, to, label }: { from: DOMRect; to: DOMRect; label: string }) {
  const [atStart, setAtStart] = useState(true);

  useEffect(() => {
    // 시작 위치로 먼저 마운트한 뒤 한 프레임 뒤에 도착 위치로 전환해야
    // transition이 실제로 재생된다 — 처음부터 도착 좌표로 마운트하면 그냥 순간이동한다.
    const raf = requestAnimationFrame(() => setAtStart(false));
    return () => cancelAnimationFrame(raf);
  }, []);

  const w = 14;
  const h = 14;
  const startX = from.left + from.width / 2 - w / 2;
  const startY = from.top + from.height / 2 - h / 2;
  const endX = to.left + to.width / 2 - w / 2;
  const endY = to.top + to.height / 2 - h / 2;

  return (
    <div
      aria-hidden
      className="fixed z-[100] pointer-events-none rounded-full bg-money flex items-center justify-center"
      style={{
        left: atStart ? startX : endX,
        top: atStart ? startY : endY,
        width: w,
        height: h,
        opacity: atStart ? 1 : 0,
        transform: `scale(${atStart ? 1 : 0.4})`,
        transition: "left 0.42s cubic-bezier(.4,0,.2,1), top 0.42s cubic-bezier(.4,0,.2,1), opacity 0.42s ease-out, transform 0.42s cubic-bezier(.4,0,.2,1)",
      }}
      title={label}
    />
  );
}

/** 항목 한 줄. 옵션이 여러 개면 칩으로 갈라 보여준다. */
function MenuRow({
  lang, item, isWeekend, onAdd, defaultOpen = false, onLaunchFly, onImageClick,
}: {
  lang: Lang;
  item: ClubMenuItem;
  isWeekend: boolean;
  onAdd: (variantId: string) => void;
  /** Best 탭에서는 접어두면 세트가 또 숨어버린다 — 처음부터 펼쳐서 보여준다. */
  defaultOpen?: boolean;
  /** 실제로 담김이 확정되는 순간(단품 클릭, 옵션 칩 클릭)에만 부른다.
      hasChoices라 ChoiceSheet가 먼저 뜨는 경우는 여기서 호출하지 않는다 —
      아직 진짜로 담긴 게 아닌데 날아가면 거짓 피드백이 된다. */
  onLaunchFly?: (fromRect: DOMRect, label: string) => void;
  /** 병 사진을 눌렀을 때 확대해서 보여준다(2026-09-06). 74.5%의 항목에
      이미지가 있는데 9x9(36px) 썸네일이 전부라 라벨이 뭔지 잘 안 보였다. */
  onImageClick?: (imageUrl: string, label: string) => void;
}) {
  const variants = item.variants ?? [];
  const priceOf = (vId: string) => {
    const v = variants.find((x) => x.id === vId);
    if (!v) return 0;
    return isWeekend ? (v.price_weekend ?? v.price) : v.price;
  };

  // 조건 문구("바틀 주문 시 무료입장" 등)는 이 줄에서 더는 안 보여준다 — 세트마다
  // 조금씩 달라 화면을 뒤덮었다(2026-09-06). 항목을 펼치면(ChoiceSheet) 그때
  // itemNote()로 한 번 보여준다. 여기서는 "평일 한정" 같은 지금 못 담는다는
  // 상태(blocked)만 원문 기준으로 판정한다.
  // isItemBlocked()로 통일 — 부모(MenuPicker)의 목록 정렬과 여기 개별 표시가
  // 같은 기준을 써야 "흐린 항목인데 위쪽에 있는" 불일치가 안 생긴다.
  const blocked = isItemBlocked(item, isWeekend);

  // 옵션을 전부 펼쳐두면 한 항목이 4줄을 먹어서 한 화면에 5개도 안 들어간다.
  // 기본은 이름 + 최저가 한 줄로 접어두고, 눌러야 옵션이 나온다.
  // 옵션이 하나뿐인 항목은 펼칠 게 없으니 탭 한 번에 바로 담긴다.
  const [open, setOpen] = useState(defaultOpen);
  // 방금 담은 옵션 — 잠깐 초록으로 눌린 표시를 준다. 토스트 팝업은 화면을 덮어
  // 그 아래 항목을 못 누르게 만들어서 뺐고, 대신 누른 칩 자체가 반응하게 한다.
  const [justAdded, setJustAdded] = useState<string | null>(null);
  // "눌림 + 리플" 담기 애니메이션(2026-09-06, 목업 3안 채택) 트리거 상태.
  // ripple은 클릭 좌표를 받아 그 지점에서 원이 퍼지게 한다. pressing은 카드
  // 전체가 살짝 눌리는 스케일 애니메이션 클래스를 잠깐 붙였다 뗀다.
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);
  const [pressing, setPressing] = useState(false);
  const triggerAddAnim = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, key: Date.now() });
    setPressing(true);
    window.setTimeout(() => setPressing(false), 380);
    window.setTimeout(() => setRipple(null), 460);
  };
  const single = variants.length === 1;
  const cheapest = variants.length
    ? Math.min(...variants.map((v) => priceOf(v.id)))
    : 0;

  return (
    <li className={`lg:rounded-xl lg:border lg:border-border lg:bg-card ${blocked ? "opacity-45" : ""}`}>
      {/* 접힌 줄 전체가 버튼 — 손가락으로 정확히 겨냥할 필요가 없어야 한다.
          relative + overflow-hidden: 리플 원이 카드 밖으로 안 새게 가둔다. */}
      <button
        type="button"
        disabled={blocked}
        onClick={(e) => {
          if (!single) return setOpen((o) => !o);
          // 단품은 행 전체가 담기 버튼이라 여기서도 같은 피드백을 준다.
          triggerAddAnim(e);
          // 카드 자체(li)의 화면 좌표에서 장바구니까지 실제로 날아간다 —
          // 목업 3안 그대로. e.currentTarget은 button이라 li 기준으로 잰다.
          onLaunchFly?.(e.currentTarget.closest("li")!.getBoundingClientRect(), itemName(item, lang));
          onAdd(variants[0].id);
          setJustAdded(variants[0].id);
          window.setTimeout(
            () => setJustAdded((cur) => (cur === variants[0].id ? null : cur)),
            600,
          );
        }}
        style={pressing ? { animation: "add-to-cart-press 0.38s cubic-bezier(.4,0,.2,1)" } : undefined}
        className={`relative overflow-hidden w-full flex items-center gap-3 px-4 py-2.5 text-left lg:px-3 transition-colors duration-200 disabled:cursor-not-allowed ${
          single && justAdded === variants[0]?.id ? "bg-money/10" : ""
        }`}
      >
        {/* 리플 — 클릭한 지점에서 원이 퍼지며 사라진다. key로 매번 새 DOM을
            강제해 연타해도 애니메이션이 처음부터 다시 재생되게 한다. */}
        {ripple && (
          <span
            key={ripple.key}
            aria-hidden
            className="absolute rounded-full bg-amber-400/40 pointer-events-none"
            style={{
              left: ripple.x, top: ripple.y, width: 90, height: 90,
              marginLeft: -45, marginTop: -45,
              animation: "add-to-cart-ripple 0.42s ease-out forwards",
            }}
          />
        )}
        {/* 병 사진이 있는 항목만 이미지 칸을 만든다. 없으면 칸 자체를 빼서 이름이
            줄 왼쪽에서 시작하게 둔다 — 빈 칸을 자리표시자로 채우면(색 막대 등)
            아무 정보도 주지 않으면서 이름이 밀려나기만 한다.
            사진 배경이 검은색이라(주대 사진에서 오려냄) 칸 배경도 검정으로 맞춘다.
            버튼 안에 버튼을 못 두므로(줄 전체가 담기 버튼) span에 role="button"으로
            얹고 stopPropagation — 눌러도 부모의 담기 동작이 같이 발동하지 않는다. */}
        {item.image_url && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onImageClick?.(item.image_url!, itemName(item, lang));
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.stopPropagation();
              e.preventDefault();
              onImageClick?.(item.image_url!, itemName(item, lang));
            }}
            className="w-9 h-9 shrink-0 rounded-md bg-black overflow-hidden flex items-center justify-center"
          >
            <img src={item.image_url} alt="" loading="lazy" className="w-full h-full object-contain" />
          </span>
        )}

        <div className="flex-1 min-w-0">
          {/* 영문 아래 한글을 병기하지는 않는다 — 줄이 두 배로 길어져 한 화면에 담기는
              항목 수가 반으로 준다(외국인 손님에겐 한글이 정보가 아니라 소음이다).
              다만 이름 자체는 두 줄까지 허용한다: 세트는 "CHAMPAGNE SET - DOM PERIGNON
              LUMINOUS"처럼 길어서 한 줄로 자르면 무슨 샴페인인지가 잘려나간다. */}
          <p className="text-sm font-semibold leading-tight line-clamp-2 break-keep">{itemName(item, lang)}</p>
          {/* 조건 문구(note)는 줄마다 노출하지 않는다 — 세트 대부분이 "바틀 주문 시
              프리패스" 계열을 공유하는데, 옵션 개수까지 붙어 항목마다 문구가 조금씩
              달라 sharedNote 배너로도 못 묶여 화면을 뒤덮었다(2026-09-06). 이 정보
              자체는 사라지지 않는다 — 항목을 펼치면(ChoiceSheet) 그때 보여준다.
              여기 줄에는 정말 "지금 못 담는다"는 상태(blocked)만 남긴다. */}
          {blocked && (
            <p className="text-[11px] text-amber-600 leading-tight flex items-center gap-1">
              <Info className="w-3 h-3 shrink-0" />
              <span className="truncate">{lang === "ko" ? "이 날짜 불가" : "not available"}</span>
            </p>
          )}
        </div>

        <span className="relative shrink-0 text-sm font-bold text-money tabular-nums">
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
          {/* 미니 태그 — 담은 순간 가격 위로 살짝 튀어나왔다 아래로(장바구니 방향)
              사라진다. 실제 장바구니 DOM 좌표는 안 쫓는다 — "방향"만으로도
              어디로 들어갔는지는 충분히 전달된다(2026-09-06, 목업 3안). */}
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
            <p className="text-[11px] text-muted-foreground mb-1.5 leading-snug">{stripOptionList(item.description)}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {variants.map((v) => {
              const added = justAdded === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={blocked}
                  onClick={(e) => {
                    onAdd(v.id);
                    // choices가 있는 항목은 이 클릭이 "담기 확정"이 아니라
                    // ChoiceSheet(후보 고르기)를 여는 트리거일 뿐이다 — 아직
                    // 진짜로 담기지 않았는데 여기서 애니메이션을 켜면, 뒤이어
                    // 뜨는 시트에 가려 재생이 끊기거나 거짓 피드백이 된다.
                    // 진짜 확정은 ChoiceSheet의 onConfirm에서 처리한다.
                    if ((item.choices?.length ?? 0) > 0) return;
                    // 옵션 칩도 같은 담기 애니메이션을 쓴다 — 단품 행과 느낌이
                    // 갈리면 "여긴 다른 동작인가" 하고 헷갈린다.
                    triggerAddAnim(e);
                    onLaunchFly?.(e.currentTarget.getBoundingClientRect(), v.label_en);
                    setJustAdded(v.id);
                    window.setTimeout(() => setJustAdded((cur) => (cur === v.id ? null : cur)), 600);
                  }}
                  style={pressing && added ? { animation: "add-to-cart-press 0.38s cubic-bezier(.4,0,.2,1)" } : undefined}
                  className={`relative overflow-hidden rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200 disabled:cursor-not-allowed ${
                    added
                      ? "border-money bg-money/20 scale-95"
                      : "border-border bg-muted hover:bg-muted/70"
                  }`}
                >
                  {ripple && added && (
                    <span
                      key={`chip-ripple-${ripple.key}`}
                      aria-hidden
                      className="absolute rounded-full bg-money/30 pointer-events-none"
                      style={{
                        left: ripple.x, top: ripple.y, width: 60, height: 60,
                        marginLeft: -30, marginTop: -30,
                        animation: "add-to-cart-ripple 0.42s ease-out forwards",
                      }}
                    />
                  )}
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
  onConfirm: (picks: Record<number, string>, buttonRect: DOMRect) => void;
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
          <p className="text-xs text-muted-foreground mt-1">{stripOptionList(item.description)}</p>
        )}
        {/* 조건 문구(바틀 주문 시 프리패스 등)는 목록 줄에서는 뺐다 — 세트마다
            조금씩 달라 화면을 뒤덮었다(2026-09-06). 정보 자체는 없애지 않고
            여기, 항목을 펼쳤을 때만 한 번 보여준다. */}
        {itemNote(item, lang) && (
          <p className="text-xs text-amber-600 mt-1.5 flex items-start gap-1">
            <Info className="w-3 h-3 shrink-0 mt-0.5" />
            <span>{itemNote(item, lang)}</span>
          </p>
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
          onClick={(e) => onConfirm(picks, e.currentTarget.getBoundingClientRect())}
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
  // 카트 줄 폭이 좁아 이름이 "Champagne Set -…"처럼 잘려 뭘 담았는지
  // 안 보인다. 아무 줄이나 누르면 담은 항목 전체를 큰 시트로 펼쳐서
  // 보여준다 — 누른 그 줄 하나만 보여주면 나머지 항목이 뭔지 여전히
  // 안 보여서 무의미하다(2026-09-06).
  const [showAll, setShowAll] = useState(false);

  if (sel.lines.length === 0 && !sel.combo) {
    return (
      <p className="text-xs text-muted-foreground">
        {lang === "ko" ? "아직 담은 항목이 없습니다." : "Nothing selected yet."}
      </p>
    );
  }
  return (
    <>
      <ul className="space-y-2">
        {sel.lines.map((l: ResolvedLine) => {
          // 0은 "한 번 더 누르면 삭제"되는 대기 상태 — 흐리게 표시해 곧 빠질
          // 줄이라는 걸 알려준다. 여기서 완전히 걷어내면 사용자가 실수로
          // -를 눌렀을 때 되돌릴 창구(다시 +) 없이 바로 사라진다.
          const pendingRemove = l.qty === 0;
          return (
            <li key={l.key} className={`flex items-start gap-2 text-xs ${pendingRemove ? "opacity-40" : ""}`}>
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="flex-1 min-w-0 text-left"
              >
                <p className="font-semibold leading-tight truncate">{itemName(l.item, lang)}</p>
                <p className="text-muted-foreground leading-tight">
                  {l.label}
                  {l.pickNames.length > 0 && ` · ${l.pickNames.join(", ")}`}
                </p>
              </button>
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
          );
        })}
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

      {/* 전체 보기 시트 — 좁은 줄에서 잘렸던 이름·옵션을 담은 항목 전부
          큰 글씨로 한 번에 보여준다. 여기서도 수량 조절이 그대로 된다. */}
      <Sheet open={showAll} onOpenChange={setShowAll}>
        <SheetContent side="bottom" className="rounded-t-3xl p-5 pb-8 max-h-[80vh] flex flex-col">
          <SheetTitle className="text-base font-bold">
            {lang === "ko" ? "담은 항목" : "Your order"}
          </SheetTitle>
          <ul className="mt-3 space-y-3 overflow-y-auto">
            {sel.lines.map((l: ResolvedLine) => {
              const pendingRemove = l.qty === 0;
              return (
                <li
                  key={l.key}
                  className={`flex items-start justify-between gap-3 pb-3 border-b border-border last:border-0 ${pendingRemove ? "opacity-40" : ""}`}
                >
                  {/* 이름·옵션 텍스트만 있으면 여러 세트가 이름만으로는 구분이
                      잘 안 된다 — 술 사진이 74.5%(2026-09-06 실측) 항목에 있어
                      실제로 대부분 뜬다. */}
                  {l.item.image_url && (
                    <div className="w-11 h-11 shrink-0 rounded-lg bg-black overflow-hidden flex items-center justify-center">
                      <img src={l.item.image_url} alt="" loading="lazy" className="w-full h-full object-contain" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-snug break-keep">{itemName(l.item, lang)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {l.label}
                      {l.pickNames.length > 0 && ` · ${l.pickNames.join(", ")}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-money font-black text-sm tabular-nums">
                      {fmt(l.lineTotal, lang)}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => sel.setQty(l.key, l.qty - 1)}
                        className="w-7 h-7 rounded-full bg-muted flex items-center justify-center"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-5 text-center tabular-nums font-bold">{l.qty}</span>
                      <button
                        type="button"
                        onClick={() => sel.setQty(l.key, l.qty + 1)}
                        className="w-7 h-7 rounded-full bg-muted flex items-center justify-center"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
            {sel.combo && sel.comboPrice > 0 && (
              <li className="flex items-center justify-between gap-3 pb-3">
                <p className="text-sm font-bold">
                  {lang === "ko"
                    ? `조합 샴페인 ${sel.combo.cham} + 하드 ${sel.combo.hard}`
                    : `Combo: ${sel.combo.cham} champagne + ${sel.combo.hard} hard`}
                </p>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-money font-black text-sm tabular-nums">
                    {fmt(sel.comboPrice, lang)}
                  </span>
                  <button type="button" onClick={() => sel.setCombo(null)}
                    className="text-xs text-muted-foreground underline">
                    {lang === "ko" ? "삭제" : "Remove"}
                  </button>
                </div>
              </li>
            )}
          </ul>

          {/* 항목별 금액만 있고 전체 합계가 없어서, 여러 개 담을수록 얼마가
              나가는지 이 시트 안에서는 알 수 없었다 — 하단에 고정으로 둔다. */}
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between shrink-0">
            <span className="text-sm font-bold text-muted-foreground">
              {lang === "ko" ? "합계" : "Total"}
            </span>
            <span className="text-money font-black text-xl tabular-nums">
              {fmt(sel.total, lang)}
            </span>
          </div>
        </SheetContent>
      </Sheet>
    </>
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
