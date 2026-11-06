"use client";

// 담당자 구성 고르기(2026-11-01) — 제안서 맨 아래 "구성 제안". 글로 적지 않고 클럽 메뉴판에서 직접 고른다.
//   · 가격은 메뉴판 그대로 합계에 반영(요일 가격은 서버가 이미 반영해 내려준다).
//   · 손님 금액을 넘기면 보낼 수 없다. 금액의 80~100%가 정상, 80% 미만은 경고(보낼 수는 있고 손님 확인서에 안내).
//   · 예산을 넘는 술은 목록에서 숨기고(보기로 다시 열 수 있다), ✨추천 구성은 금액 이하·합계가 가까운 순 3개.
//   · 선택한 구성 목록은 탭과 상관없이 맨 위에 고정 — 다른 탭에서 담은 술도 거기서 바로 줄인다.
//   · TC는 클럽 규칙(예: 4병 미만 5만원)으로 자동 채우고, 직접 고치면 규칙과 맞는지 경고만 한다. 0원이어도 한 줄로 보인다.
// 서버(/api/proposal-response)가 같은 가격으로 다시 계산해 검증하므로, 여기 값은 화면용이다.

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { BAND_LOW, bottlesOfLabel, tcFor, tcIsAlways, type PickerItem, type TcRule } from "@/lib/booking/mdMenu";

export type PickerValue = { qty: Record<string, number>; tc: number; tcTouched: boolean };

const CAT_KO: Record<string, string> = {
  champagne: "샴페인", whisky: "위스키", cognac: "꼬냑", tequila: "데킬라", vodka: "보드카", liqueur: "리큐르", set: "세트",
};
const won = (n: number) => `${n.toLocaleString("en-US")}원`;

type Line = { id: string; name: string; label: string; unit: number; n: number; bottles: number };

export function pickerLines(items: PickerItem[], qty: Record<string, number>): Line[] {
  const byV = new Map<string, { it: PickerItem; v: PickerItem["variants"][number] }>();
  items.forEach((it) => it.variants.forEach((v) => byV.set(v.id, { it, v })));
  return Object.entries(qty)
    .filter(([, n]) => n > 0)
    .flatMap(([id, n]) => {
      const h = byV.get(id);
      return h ? [{ id, name: h.it.name, label: h.v.label, unit: h.v.price, n, bottles: n * (bottlesOfLabel(h.v.label) ?? 1) }] : [];
    });
}

export function pickerTotals(items: PickerItem[], value: PickerValue, budget: number | null) {
  const lines = pickerLines(items, value.qty);
  const bottles = lines.reduce((s, l) => s + l.bottles, 0);
  const sum = lines.reduce((s, l) => s + l.unit * l.n, 0);
  const total = lines.length ? sum + value.tc : 0;
  const low = budget != null ? Math.round(budget * BAND_LOW) : 0;
  const state: "none" | "over" | "ok" | "inband" | "far" =
    !lines.length ? "none" : budget == null ? "ok" : total > budget ? "over" : total === budget ? "ok" : total >= low ? "inband" : "far";
  return { lines, bottles, sum, total, low, state };
}

const lineText = (l: Line) =>
  `${l.n} × ${l.name}${l.label && !/^1 bottle$/i.test(l.label) && !/^set$/i.test(l.label) ? ` · ${l.label}` : ""}`;

/** 추천 구성 — 샴페인 세트 / 한 종 N병 / 두 종 조합 중 금액 이하·80% 이상, 합계가 가까운 순. 같은 술 조합은 한 번만. */
export function recommend(items: PickerItem[], budget: number, rule: TcRule) {
  const low = Math.round(budget * BAND_LOW);
  const champs = items.filter((m) => m.cat === "champagne");
  type P = { id: string; n: number; unit: number; name: string; label: string };
  const out: { parts: P[]; bottles: number; tc: number; total: number; names: string }[] = [];
  const add = (parts: P[], bottles: number) => {
    const tc = tcFor(rule, bottles);
    const total = parts.reduce((s, q) => s + q.unit * q.n, 0) + tc;
    if (total > budget || total < low) return;
    out.push({ parts, bottles, tc, total, names: parts.map((q) => q.name).sort().join("+") });
  };
  const singles: { m: PickerItem; v: PickerItem["variants"][number] }[] = [];
  champs.forEach((m) =>
    m.variants.forEach((v) => {
      if (/^1 bottle/i.test(v.label)) singles.push({ m, v });
      const b = bottlesOfLabel(v.label);
      if (b && b > 1 && /set/i.test(v.label)) add([{ id: v.id, n: 1, unit: v.price, name: m.name, label: v.label }], b);
    }),
  );
  singles.forEach((x) => {
    for (let n = 1; n <= 8; n++) add([{ id: x.v.id, n, unit: x.v.price, name: x.m.name, label: x.v.label }], n);
  });
  for (let i = 0; i < singles.length; i++)
    for (let j = i + 1; j < singles.length; j++)
      for (let a = 1; a <= 5; a++)
        for (let b = 1; b <= 5 && a + b <= 8; b++) {
          const A = singles[i], B = singles[j];
          add(
            [
              { id: A.v.id, n: a, unit: A.v.price, name: A.m.name, label: A.v.label },
              { id: B.v.id, n: b, unit: B.v.price, name: B.m.name, label: B.v.label },
            ],
            a + b,
          );
        }
  out.sort((x, y) => budget - x.total - (budget - y.total) || x.parts.length - y.parts.length || x.bottles - y.bottles);
  const pick: typeof out = [];
  const used = new Set<string>();
  for (const r of out) {
    if (used.has(r.names)) continue;
    used.add(r.names);
    pick.push(r);
    if (pick.length === 3) break;
  }
  return pick;
}

export function MdMenuPicker({
  items,
  budget,
  rule,
  value,
  onChange,
  clubName,
}: {
  items: PickerItem[];
  budget: number | null;
  rule: TcRule;
  value: PickerValue;
  onChange: (v: PickerValue) => void;
  clubName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const t = pickerTotals(items, value, budget);
  const diff = budget != null ? t.total - budget : 0;
  // 메뉴판을 열지 않고 추천 구성을 바로 넣는다(2026-11-02) — 누를 때마다 다음 추천(최대 3개)으로 바뀐다.
  const recs = useMemo(() => (budget != null ? recommend(items, budget, rule) : []), [items, budget, rule]);
  const [recIdx, setRecIdx] = useState(-1);
  const applyNextRec = () => {
    const i = (recIdx + 1) % recs.length;
    const qty: Record<string, number> = {};
    recs[i].parts.forEach((p) => (qty[p.id] = p.n));
    onChange({ qty, tc: recs[i].tc, tcTouched: false });
    setRecIdx(i);
  };

  const tag =
    t.state === "ok" ? { cls: "bg-green-500/15 text-money", text: "딱 맞음" }
    : t.state === "inband" ? { cls: "bg-green-500/15 text-money", text: `범위 안 · ${won(-diff)} 적음` }
    : t.state === "far" ? { cls: "bg-sky-400/15 text-sky-300", text: `너무 적음 · ${won(-diff)}` }
    : t.state === "over" ? { cls: "bg-red-500/15 text-red-400", text: `${won(diff)} 초과` }
    : null;

  const message =
    t.state === "over" ? (
      <p className="text-[12px] leading-relaxed rounded-lg bg-red-500/10 text-red-200 px-2.5 py-2">
        <b>손님 금액을 넘길 수 없어요.</b> {won(diff)} 줄여서 {won(budget ?? 0)} 이하로 맞춰주세요.
      </p>
    ) : t.state === "far" ? (
      <p className="text-[12px] leading-relaxed rounded-lg bg-sky-400/10 text-sky-100 px-2.5 py-2">
        정상 범위({won(t.low)}) 밑이에요. 보낼 수는 있고, 손님 확인서에 짧은 안내가 붙어요.
      </p>
    ) : t.state === "inband" ? (
      <p className="text-[12px] leading-relaxed rounded-lg bg-green-500/10 text-green-100 px-2.5 py-2">
        정상 범위({won(t.low)}~{won(budget ?? 0)}) 안이에요. 손님 확인서에 짧은 안내가 붙어요.
      </p>
    ) : null;

  const need = rule ? tcFor(rule, t.bottles) : null;
  const tcCheck =
    t.lines.length && rule ? (
      value.tc === need ? (
        <p className="text-[11.5px] text-green-300 mt-1.5">
          ✓ TC 확인 · {t.bottles}병
          {tcIsAlways(rule) ? ` (이 클럽은 TC ${won(need ?? 0)}가 항상 붙어요)` : need ? ` (${rule.below_bottles}병 미만 → ${won(need)})` : ` (${rule.below_bottles}병 이상 → TC 없음)`}
        </p>
      ) : (
        <p className="text-[12px] leading-relaxed rounded-lg bg-amber-500/10 text-amber-100 px-2.5 py-2 mt-1.5">
          <b>TC 확인이 필요해요</b> — {tcIsAlways(rule) ? "이 클럽은" : `${t.bottles}병이면`} TC가 {won(need ?? 0)}인데 지금 {won(value.tc)}이에요.
        </p>
      )
    ) : !rule && t.lines.length ? (
      // 클럽 TC가 DB에 없으면 합계에 0원으로만 들어가 손님이 현장에서 더 내게 된다 — 오늘 TC를 직접 넣게 하고, 넣은 금액은 클럽 설정에도 저장한다(2026-11-06).
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] px-2.5 py-2 mt-1.5 space-y-1.5">
        <p className="text-[12px] font-bold text-brand-amber">이 클럽 TC를 아직 몰라요</p>
        <p className="text-[11.5px] text-muted-foreground leading-relaxed">오늘 TC가 있으면 넣어주세요. 넣은 금액은 이 클럽 설정에도 저장돼요.</p>
        <input
          inputMode="numeric"
          aria-label="오늘 테이블 차지(TC)"
          value={value.tc ? value.tc.toLocaleString("en-US") : ""}
          onChange={(e) => onChange({ ...value, tc: Number(e.target.value.replace(/[^0-9]/g, "")) || 0, tcTouched: true })}
          placeholder="예) 50,000"
          className="w-full h-10 rounded-lg border border-border bg-card px-3 text-[13.5px] font-mono outline-none focus:border-amber-500"
        />
      </div>
    ) : null;

  return (
    <div className="rounded-xl border border-amber-500/40 p-3 space-y-2">
      <p className="text-[13px] font-bold text-foreground">
        {budget != null ? `${won(budget)} 안에서 ` : ""}어떤 구성으로 드릴까요?
      </p>
      <div className="rounded-xl bg-background border border-border px-3 py-2.5">
        {t.lines.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground text-center py-1.5">아직 고른 술이 없어요</p>
        ) : (
          <>
            {t.lines.map((l) => (
              <div key={l.id} className="flex justify-between gap-2 py-0.5 text-[13px]">
                <b className="font-bold">{lineText(l)}</b>
                <span className="font-mono text-[12.5px] text-foreground/80 whitespace-nowrap">{won(l.unit * l.n)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-2 py-0.5 text-[13px]">
              <b className="font-bold">테이블 차지 (TC)</b>
              <span className="font-mono text-[12.5px] text-foreground/80 whitespace-nowrap">{won(value.tc)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border mt-1.5 pt-1.5 font-black">
              <span className="text-[13px]">
                합계 {tag && <span className={`ml-1.5 text-[11px] rounded-full px-2 py-0.5 ${tag.cls}`}>{tag.text}</span>}
              </span>
              <span className="font-mono text-[17px]">{won(t.total)}</span>
            </div>
          </>
        )}
      </div>
      {message}
      {tcCheck}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex-1 h-12 rounded-xl border border-amber-500 text-brand-amber text-[15px] font-black bg-card"
        >
          {t.lines.length ? "구성 수정" : "구성 제안"}
        </button>
        {recs.length > 0 && (
          <button
            type="button"
            onClick={applyNextRec}
            className="flex-1 h-12 rounded-xl bg-amber-500 text-black text-[15px] font-black"
          >
            {recIdx < 0 ? "✨ 추천 구성" : recs.length > 1 ? `✨ 다른 추천 ${((recIdx + 1) % recs.length) + 1}/${recs.length}` : "✨ 추천 구성"}
          </button>
        )}
      </div>
      {open && (
        <PickerSheet
          items={items} budget={budget} rule={rule} value={value} onChange={onChange}
          clubName={clubName} onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function PickerSheet({
  items, budget, rule, value, onChange, clubName, onClose,
}: {
  items: PickerItem[]; budget: number | null; rule: TcRule; value: PickerValue;
  onChange: (v: PickerValue) => void; clubName: string | null; onClose: () => void;
}) {
  const [tab, setTab] = useState("champagne");
  const [showAll, setShowAll] = useState(false);
  const [recOpen, setRecOpen] = useState(false);
  const t = pickerTotals(items, value, budget);
  const diff = budget != null ? t.total - budget : 0;
  const recs = useMemo(() => (budget != null ? recommend(items, budget, rule) : []), [items, budget, rule]);

  const over = (price: number) => budget != null && price > budget;
  const shown = items
    .map((m) => ({ ...m, vs: showAll ? m.variants : m.variants.filter((v) => !over(v.price)) }))
    .filter((m) => m.vs.length);
  const cats = [...new Set(shown.map((m) => m.cat))];
  const curTab = cats.includes(tab) ? tab : cats[0];
  const hiddenCount = items.reduce((n, m) => n + m.variants.filter((v) => over(v.price)).length, 0);

  // 수량을 바꾸면 TC를 클럽 규칙으로 다시 맞춘다 — 담당자가 TC를 직접 고쳤으면(tcTouched) 건드리지 않는다.
  const setQty = (id: string, next: number) => {
    const qty = { ...value.qty, [id]: Math.max(0, next) };
    if (qty[id] === 0) delete qty[id];
    const b = pickerTotals(items, { ...value, qty }, budget).bottles;
    onChange({ qty, tc: value.tcTouched || !rule ? value.tc : tcFor(rule, b), tcTouched: value.tcTouched });
  };
  const apply = (r: ReturnType<typeof recommend>[number]) => {
    const qty: Record<string, number> = {};
    r.parts.forEach((p) => (qty[p.id] = p.n));
    onChange({ qty, tc: r.tc, tcTouched: false });
    setRecOpen(false);
  };

  const tag =
    t.state === "ok" ? { cls: "bg-green-500/15 text-money", text: "딱 맞음" }
    : t.state === "inband" ? { cls: "bg-green-500/15 text-money", text: `범위 안 · ${won(-diff)} 적음` }
    : t.state === "far" ? { cls: "bg-sky-400/15 text-sky-300", text: `너무 적음 · ${won(-diff)}` }
    : t.state === "over" ? { cls: "bg-red-500/15 text-red-400", text: `${won(diff)} 초과 · 불가` }
    : null;
  const need = rule ? tcFor(rule, t.bottles) : null;

  return (
    <div className="fixed inset-0 z-[300] bg-background flex flex-col overscroll-none" role="dialog" aria-modal="true">
      <div className="flex items-start justify-between px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-2 border-b border-border shrink-0">
        <div>
          <p className="text-[16px] font-black">메뉴판{clubName ? ` · ${clubName}` : ""}</p>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">{budget != null ? `손님 금액 ${won(budget)}` : "손님 금액 미정"}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="w-9 h-9 rounded-full bg-card flex items-center justify-center">
          <X className="w-4.5 h-4.5" />
        </button>
      </div>

      <div className="flex items-center gap-2 px-4 pt-2 pb-1.5 shrink-0">
        {budget != null && (
          <button
            type="button"
            onClick={() => setRecOpen((v) => !v)}
            className="h-9 px-3.5 rounded-xl border border-amber-500 bg-card text-brand-amber text-[13px] font-black"
          >
            ✨ 추천 구성 {recOpen ? "▴" : "▾"}
          </button>
        )}
        {hiddenCount > 0 && (
          <span className="text-[11.5px] text-muted-foreground">
            {showAll ? (
              <button type="button" onClick={() => setShowAll(false)} className="underline text-foreground/80">예산 초과 숨기기</button>
            ) : (
              <>예산 초과 {hiddenCount}개 숨김 · <button type="button" onClick={() => setShowAll(true)} className="underline text-foreground/80">보기</button></>
            )}
          </span>
        )}
      </div>

      {recOpen && (
        <div className="mx-4 mb-2 rounded-xl border border-amber-500/45 bg-amber-500/[0.06] px-3 py-2.5 shrink-0 max-h-[34vh] overflow-y-auto">
          <p className="text-[12px] font-black text-brand-amber mb-1">
            추천 구성 · 금액 이하, 합계가 가까운 순 <span className="font-medium text-muted-foreground">(TC 규칙 반영)</span>
          </p>
          {recs.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground text-center py-2">조건에 맞는 추천이 없어요</p>
          ) : (
            recs.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-2 border-t border-amber-500/20 first:border-t-0 py-2">
                <div className="text-[12.5px] leading-snug text-foreground/90 min-w-0">
                  {r.parts.map((q) => (
                    <div key={q.id}>{`${q.n} × ${q.name}${q.label && !/^1 bottle$/i.test(q.label) ? ` · ${q.label}` : ""}`}</div>
                  ))}
                  {rule && <div>테이블 차지 · {won(r.tc)}</div>}
                  <div className="text-[11.5px] text-muted-foreground">
                    합계 {won(r.total)} · {r.total === budget ? "딱 맞음" : `${won((budget ?? 0) - r.total)} 적음`} · {r.bottles}병
                  </div>
                </div>
                <button type="button" onClick={() => apply(r)} className="shrink-0 h-8 px-3 rounded-lg bg-amber-500 text-black text-[12.5px] font-black">
                  적용
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {t.lines.length > 0 && (
        <div className={`mx-4 mb-1.5 rounded-xl border px-3 py-2 shrink-0 max-h-[26vh] overflow-y-auto ${t.state === "over" ? "border-red-500/60 bg-red-500/[0.07]" : "border-border bg-card"}`}>
          <div className={`flex items-center justify-between text-[12px] font-black mb-1 ${t.state === "over" ? "text-red-400" : ""}`}>
            <span>선택한 구성 · {t.lines.length}종{t.state === "over" ? " — 넘긴 금액만큼 빼 주세요" : ""}</span>
            <button type="button" onClick={() => onChange({ qty: {}, tc: 0, tcTouched: false })} className="text-[11.5px] font-medium underline text-muted-foreground">
              전체 비우기
            </button>
          </div>
          {t.lines.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2 py-1 border-t border-border/60 first:border-t-0">
              <div className="min-w-0 text-[12.5px] text-foreground/90">
                {lineText(l)}
                <span className="block text-[11.5px] text-muted-foreground font-mono">{won(l.unit * l.n)}</span>
              </div>
              <Stepper n={l.n} onMinus={() => setQty(l.id, l.n - 1)} onPlus={() => setQty(l.id, l.n + 1)} />
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto px-4 py-1.5 shrink-0">
        {cats.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setTab(c)}
            className={`shrink-0 h-8 px-3 rounded-full border text-[12px] font-bold ${c === curTab ? "bg-foreground text-background border-foreground" : "bg-card border-border text-foreground/80"}`}
          >
            {CAT_KO[c] ?? c}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        {shown.filter((m) => m.cat === curTab).map((m) => (
          <div key={m.id} className="py-2.5 border-t border-border/60 first:border-t-0">
            <p className="text-[14px] font-extrabold">{m.name}</p>
            {m.vs.map((v) => {
              const n = value.qty[v.id] ?? 0;
              const isOver = over(v.price);
              return (
                <div key={v.id} className={`flex items-center justify-between gap-2 mt-1.5 ${isOver ? "opacity-50" : ""}`}>
                  <div className="text-[12.5px] text-foreground/90">
                    {v.label}
                    <span className={`ml-1.5 font-mono text-[12px] ${isOver ? "text-red-400" : "text-money"}`}>
                      {won(v.price)}{isOver ? " · 예산 초과" : ""}
                    </span>
                  </div>
                  <Stepper n={n} onMinus={() => setQty(v.id, n - 1)} onPlus={() => setQty(v.id, n + 1)} plusDisabled={isOver} />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="border-t border-border bg-card/60 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[12.5px] font-extrabold">
            테이블 차지 (TC)
            {rule && (
              <span className="block text-[11px] font-medium text-muted-foreground">
                {tcIsAlways(rule) ? `이 클럽은 TC ${won(rule.amount)}가 항상 붙어요` : `${rule.below_bottles}병 미만이면 ${won(rule.amount)}`}
              </span>
            )}
          </div>
          <input
            inputMode="numeric"
            value={value.tc.toLocaleString("en-US")}
            onChange={(e) => onChange({ ...value, tc: Number(e.target.value.replace(/[^0-9]/g, "")) || 0, tcTouched: true })}
            className="w-32 h-9 rounded-lg border border-border bg-card px-2.5 text-right text-[13px] font-mono outline-none focus:border-amber-500"
          />
        </div>
        <div className="flex items-center justify-between border-t border-border mt-2.5 pt-2 font-black">
          <span className="text-[13px]">
            합계 {tag && <span className={`ml-1.5 text-[11px] rounded-full px-2 py-0.5 ${tag.cls}`}>{tag.text}</span>}
          </span>
          <span className="font-mono text-[18px]">{won(t.total)}</span>
        </div>
        {t.state === "over" && (
          <p className="text-[12px] leading-relaxed rounded-lg bg-red-500/10 text-red-200 px-2.5 py-2 mt-2">
            손님 금액보다 <b>{won(diff)}</b> 많아요. <b>넘길 수 없어요</b> — 술을 줄이거나 TC를 확인해 주세요.
          </p>
        )}
        {rule && t.lines.length > 0 && (
          value.tc === need ? (
            <p className="text-[11.5px] text-green-300 mt-1.5">✓ TC 확인 · {t.bottles}병</p>
          ) : (
            <p className="text-[12px] leading-relaxed rounded-lg bg-amber-500/10 text-amber-100 px-2.5 py-2 mt-1.5">
              <b>TC 확인이 필요해요</b> — {tcIsAlways(rule) ? "이 클럽은" : `${t.bottles}병이면`} TC가 {won(need ?? 0)}인데 지금 {won(value.tc)}이에요.
            </p>
          )
        )}
        <button
          type="button"
          onClick={onClose}
          disabled={t.state === "over"}
          className="w-full h-12 rounded-xl bg-money text-black text-[15px] font-black mt-2.5 disabled:opacity-40"
        >
          완료
        </button>
      </div>
    </div>
  );
}

function Stepper({ n, onMinus, onPlus, plusDisabled }: { n: number; onMinus: () => void; onPlus: () => void; plusDisabled?: boolean }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <button type="button" onClick={onMinus} disabled={n === 0} className="w-8 h-8 rounded-lg border border-border bg-card text-[16px] font-black disabled:opacity-30">−</button>
      <span className={`w-5 text-center text-[14px] font-black ${n ? "" : "text-muted-foreground/60"}`}>{n}</span>
      <button type="button" onClick={onPlus} disabled={plusDisabled} className="w-8 h-8 rounded-lg border border-border bg-card text-[16px] font-black disabled:opacity-30">+</button>
    </div>
  );
}
