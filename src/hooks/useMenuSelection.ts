"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type {
  ClubMenuItem,
  ClubMenuCombo,
  SelectedMenuSnapshot,
} from "@/types/database";

// 메뉴 선택 상태와 가격 계산. 화면(모바일/데스크탑)이 이걸 공유한다.
//
// 로직을 훅으로 뺀 이유: 레이아웃은 폭에 따라 크게 갈리지만(가로 탭 ↔ 세로 목록,
// 하단 고정바 ↔ 사이드 패널) 가격 계산은 완전히 같다. 선택형 세트 업차지,
// 평일/주말 분기, 존별 가격, 테이블 차지까지 얽혀 있어서 두 벌로 두면
// 한쪽만 고치는 사고가 난다.

/** 담은 항목 하나. 같은 품목이라도 옵션(variant)이 다르면 별개 줄로 친다. */
export type CartLine = {
  key: string;          // itemId:variantId:선택조합 — 같은 조합끼리만 수량이 합쳐진다
  itemId: string;
  variantId: string;
  qty: number;
  /** slot_no → 고른 후보의 choice id. 선택형 세트만 값이 있다. */
  picks: Record<number, string>;
};

export type MenuSelectionInput = {
  items: ClubMenuItem[];
  combos: ClubMenuCombo[];
  /** 방문일이 주말이면 price_weekend와 주말 차지를 쓴다. */
  isWeekend: boolean;
  tableChargeWeekday: number | null;
  tableChargeWeekend: number | null;
  /** 층별 가격표가 있는 클럽에서 손님이 고른 존. 없으면 null. */
  zone?: string | null;
  /** 시트를 다시 열 때(수정) 복원할 이전 선택. 없으면 빈 상태로 시작한다. */
  initialSnapshot?: SelectedMenuSnapshot | null;
};

/** 담긴 줄 하나를 화면에 뿌릴 수 있게 이름·금액까지 풀어놓은 것. */
export type ResolvedLine = {
  key: string;
  item: ClubMenuItem;
  variantId: string;
  label: string;
  qty: number;
  /** 업차지를 포함한 1개당 금액. */
  unitPrice: number;
  lineTotal: number;
  pickNames: string[];
};

export function useMenuSelection({
  items,
  combos,
  isWeekend,
  tableChargeWeekday,
  tableChargeWeekend,
  zone = null,
  initialSnapshot = null,
}: MenuSelectionInput) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [combo, setCombo] = useState<{ cham: number; hard: number } | null>(null);

  // 존이 지정된 클럽은 그 존 것만 보여준다. 존이 없는 클럽은 전부 통과.
  // (그루브&스팟은 같은 앱솔루트가 3F 20만 / 2F 14만이라 섞이면 안 된다)
  const visibleItems = useMemo(
    () => (zone ? items.filter((i) => i.zone === zone) : items),
    [items, zone],
  );

  const itemById = useMemo(() => {
    const m = new Map<string, ClubMenuItem>();
    for (const i of items) m.set(i.id, i);
    return m;
  }, [items]);

  const makeKey = (itemId: string, variantId: string, picks: Record<number, string>) => {
    const p = Object.keys(picks)
      .map(Number)
      .sort((a, b) => a - b)
      .map((slot) => `${slot}=${picks[slot]}`)
      .join(",");
    return `${itemId}:${variantId}${p ? `:${p}` : ""}`;
  };

  // 시트를 다시 열 때(수정) 이전에 담았던 걸 복원한다 — 안 그러면 "취소·수정"이
  // 안 되고 매번 처음부터 다시 골라야 한다. items가 아직 안 왔으면(로딩 중)
  // choice 원본을 못 찾으니 items가 준비된 뒤 한 번만 실행한다.
  //
  // restored는 "복원이 끝났다(또는 복원할 게 없다)"는 신호로 밖에도 내보낸다 —
  // 화면 쪽에서 초안을 부모로 올릴 때, 복원 전 빈 상태를 올려 기존 선택을
  // 지워버리는 걸 막아야 한다.
  const restoredRef = useRef(false);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (restoredRef.current) return;
    // 복원할 게 없으면 그 자체로 준비 완료. 메뉴 로딩 중(items 비어 있음)에는
    // 아직 판단할 수 없으니 기다린다.
    if (!initialSnapshot) {
      if (items.length > 0) { restoredRef.current = true; setRestored(true); }
      return;
    }
    if (items.length === 0) return;
    restoredRef.current = true;

    const restoredLines: CartLine[] = initialSnapshot.items.flatMap((it) => {
      const item = itemById.get(it.item_id);
      if (!item) return []; // 메뉴가 그새 바뀌어 사라진 항목은 조용히 버린다
      const picks: Record<number, string> = {};
      (it.choices ?? []).forEach((c) => {
        // 스냅샷엔 choice id가 없고 name_en만 있다(제출 시점 이름을 통째로 박은 스냅샷).
        // 지금 메뉴의 choices에서 같은 이름을 다시 찾아 실제 id로 되돌린다.
        const match = item.choices?.find((x) => x.name_en === c.name_en && x.slot_no === c.slot_no);
        if (match) picks[c.slot_no] = match.id;
      });
      const key = makeKey(it.item_id, it.variant_id, picks);
      return [{ key, itemId: it.item_id, variantId: it.variant_id, qty: it.qty, picks }];
    });

    if (restoredLines.length > 0) setLines(restoredLines);
    if (initialSnapshot.combo) {
      setCombo({ cham: initialSnapshot.combo.cham_count, hard: initialSnapshot.combo.hard_count });
    }
    setRestored(true);
  }, [initialSnapshot, items, itemById]);

  /** 요일에 맞는 가격. 주말가가 없으면 평일가가 곧 상시가다. */
  const priceOf = useCallback(
    (itemId: string, variantId: string): number => {
      const v = itemById.get(itemId)?.variants?.find((x) => x.id === variantId);
      if (!v) return 0;
      return isWeekend ? (v.price_weekend ?? v.price) : v.price;
    },
    [itemById, isWeekend],
  );

  /** 고른 후보들의 업차지 합. OCEAN SET 2의 "+50,000" 같은 것. */
  const extraOf = useCallback(
    (itemId: string, picks: Record<number, string>): number => {
      const choices = itemById.get(itemId)?.choices ?? [];
      return Object.values(picks).reduce((sum, choiceId) => {
        const c = choices.find((x) => x.id === choiceId);
        return sum + (c?.extra_price ?? 0);
      }, 0);
    },
    [itemById],
  );

  const add = useCallback(
    (itemId: string, variantId: string, picks: Record<number, string> = {}) => {
      const key = makeKey(itemId, variantId, picks);
      setLines((prev) => {
        const hit = prev.find((l) => l.key === key);
        if (hit) return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
        return [...prev, { key, itemId, variantId, qty: 1, picks }];
      });
    },
    [],
  );

  /** 수량 조절. 0 밑으로는 못 내려간다 — 실수로 연타해도 마이너스가 되지 않는다.
      0 자체는 그대로 유지한다("한 번 더 눌러야 진짜 삭제"). 0에서 -를 다시 누르면
      그때 줄을 뺀다. 합계·개수·스냅샷에서는 resolved 단계에서 0을 걸러낸다. */
  const setQty = useCallback((key: string, qty: number) => {
    setLines((prev) => {
      if (qty < 0) return prev.filter((l) => l.key !== key);
      return prev.map((l) => (l.key === key ? { ...l, qty } : l));
    });
  }, []);

  const remove = useCallback((key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setCombo(null);
  }, []);

  const resolved: ResolvedLine[] = useMemo(
    () =>
      lines.flatMap((l) => {
        const item = itemById.get(l.itemId);
        const variant = item?.variants?.find((v) => v.id === l.variantId);
        if (!item || !variant) return []; // 데이터가 바뀌어 사라진 줄은 조용히 버린다
        const unitPrice = priceOf(l.itemId, l.variantId) + extraOf(l.itemId, l.picks);
        const pickNames = Object.values(l.picks).flatMap((cid) => {
          const c = item.choices?.find((x) => x.id === cid);
          return c ? [c.name_en] : [];
        });
        return [{
          key: l.key,
          item,
          variantId: l.variantId,
          label: variant.label_en,
          qty: l.qty,
          unitPrice,
          lineTotal: unitPrice * l.qty,
          pickNames,
        }];
      }),
    [lines, itemById, priceOf, extraOf],
  );

  const comboPrice = useMemo(() => {
    if (!combo) return 0;
    const hit = combos.find(
      (c) => c.cham_count === combo.cham && c.hard_count === combo.hard,
    );
    return hit?.price ?? 0;
  }, [combo, combos]);

  // 테이블 차지: 0은 "확인했고 안 받음", null은 "미확인"이라 둘 다 0원으로 친다.
  // (미확인을 임의의 금액으로 메우면 손님에게 없는 돈을 청구하게 된다)
  const tableCharge = (isWeekend ? tableChargeWeekend : tableChargeWeekday) ?? 0;

  const itemsTotal = resolved.reduce((s, l) => s + l.lineTotal, 0);
  const total = itemsTotal + comboPrice + tableCharge;
  const count = resolved.reduce((s, l) => s + l.qty, 0) + (combo ? 1 : 0);

  /** DB에 넣을 스냅샷. 이름·가격까지 통째로 박아 나중에 가격이 바뀌어도 남는다. */
  const snapshot = useCallback((): SelectedMenuSnapshot => {
    const snap: SelectedMenuSnapshot = {
      // qty=0인 줄은 "삭제 직전, 한 번 더 누르면 빠지는" 화면용 상태일 뿐이라
      // 실제 제출에는 담기지 않는다.
      items: resolved.filter((l) => l.qty > 0).map((l) => ({
        item_id: l.item.id,
        variant_id: l.variantId,
        name_en: l.item.name_en,
        label_en: l.label,
        price: l.unitPrice,
        qty: l.qty,
        ...(l.pickNames.length
          ? {
              choices: Object.entries(
                lines.find((x) => x.key === l.key)?.picks ?? {},
              ).map(([slot, cid]) => {
                const c = l.item.choices?.find((x) => x.id === cid);
                return {
                  slot_no: Number(slot),
                  name_en: c?.name_en ?? "",
                  extra_price: c?.extra_price ?? 0,
                };
              }),
            }
          : {}),
      })),
    };
    if (combo && comboPrice > 0) {
      snap.combo = { cham_count: combo.cham, hard_count: combo.hard, price: comboPrice };
    }
    if (tableCharge > 0) {
      snap.table_charge = { amount: tableCharge, basis: isWeekend ? "weekend" : "weekday" };
    }
    if (zone) snap.zone = zone;
    return snap;
  }, [resolved, lines, combo, comboPrice, tableCharge, isWeekend, zone]);

  return {
    restored,
    visibleItems,
    lines: resolved,
    combo,
    setCombo,
    comboPrice,
    add,
    setQty,
    remove,
    clear,
    itemsTotal,
    tableCharge,
    total,
    count,
    priceOf,
    snapshot,
  };
}
