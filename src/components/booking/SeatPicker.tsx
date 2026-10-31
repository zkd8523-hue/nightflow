"use client";

// 담당자 자리 고르기(2026-11-01) — 구역마다 [구역 · 전체 가능] [일부 가능 ▾].
// 클럽 안에서 폰으로 누르는 화면이라 37개 번호를 다 깔지 않고, 보통은 구역 버튼 한 번으로 끝낸다.
// 몇 자리만 될 때만 "일부 가능"을 펼쳐 번호를 고른다. 테이블맵은 아래 접이식으로 같이 본다.

import { useState } from "react";
import type { SeatZone } from "@/lib/booking/seats";

export function SeatPicker({
  zones,
  selected,
  onChange,
  floorPlanUrls = [],
  disabled = [],
}: {
  zones: SeatZone[];
  selected: string[];
  onChange: (next: string[]) => void;
  floorPlanUrls?: string[];
  /** 이미 안 되는 자리(손님이 골랐다가 빠진 자리 등) — 줄 그어 못 고르게 */
  disabled?: string[];
}) {
  const sel = new Set(selected);
  const off = new Set(disabled);
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(zones.filter((z) => z.seats.some((s) => sel.has(s)) && !z.seats.every((s) => sel.has(s) || off.has(s))).map((z) => z.key)),
  );
  const [mapOpen, setMapOpen] = useState(false);

  const toggleZone = (z: SeatZone) => {
    const avail = z.seats.filter((s) => !off.has(s));
    const full = avail.length > 0 && avail.every((s) => sel.has(s));
    const next = new Set(sel);
    avail.forEach((s) => (full ? next.delete(s) : next.add(s)));
    onChange([...next]);
    setOpen((o) => {
      const n = new Set(o);
      n.delete(z.key);
      return n;
    });
  };
  const toggleSeat = (s: string) => {
    if (off.has(s)) return;
    const next = new Set(sel);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    onChange([...next]);
  };

  // 공간이 둘인 클럽(Ace)은 공간 이름으로 묶는다.
  const spaces = [...new Set(zones.map((z) => z.space ?? ""))];

  return (
    <div className="space-y-2">
      {spaces.map((space) => (
        <div key={space || "_"} className="space-y-2">
          {space && spaces.length > 1 && (
            <p className="text-[11.5px] font-bold text-muted-foreground pt-1">{space}</p>
          )}
          {zones.filter((z) => (z.space ?? "") === space).map((z) => {
            const avail = z.seats.filter((s) => !off.has(s));
            const picked = avail.filter((s) => sel.has(s));
            const full = avail.length > 0 && picked.length === avail.length;
            const part = !full && picked.length > 0;
            const isOpen = open.has(z.key);
            return (
              <div key={z.key}>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleZone(z)}
                    className={`flex-1 min-w-0 flex items-center justify-between h-[52px] px-3.5 rounded-xl border text-left ${
                      full
                        ? "border-money bg-green-500/15"
                        : part
                        ? "border-dashed border-amber-500 bg-card"
                        : "border-border bg-card"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className={`block text-[14px] font-black ${full ? "text-money" : "text-foreground"}`}>{z.label}</span>
                      <span className={`block text-[11px] font-semibold truncate ${part ? "text-brand-amber" : "text-muted-foreground"}`}>
                        {part ? `일부: ${picked.join(", ")}` : `${z.seats[0]}–${z.seats[z.seats.length - 1]}`}
                      </span>
                    </span>
                    <span className={`shrink-0 text-[13px] font-black ${full ? "text-money" : "text-muted-foreground"}`}>
                      전체 가능{full ? " ✓" : ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setOpen((o) => {
                        const n = new Set(o);
                        if (n.has(z.key)) n.delete(z.key);
                        else n.add(z.key);
                        return n;
                      })
                    }
                    className={`shrink-0 w-24 h-[52px] rounded-xl border text-[12.5px] font-bold ${
                      isOpen ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground bg-background"
                    }`}
                  >
                    일부 가능 {isOpen ? "▴" : "▾"}
                  </button>
                </div>
                {isOpen && (
                  <div className="flex flex-wrap gap-1.5 pt-2 pb-1">
                    {z.seats.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSeat(s)}
                        disabled={off.has(s)}
                        className={`min-w-[44px] h-9 px-2 rounded-lg border text-[12.5px] font-bold ${
                          off.has(s)
                            ? "border-dashed border-border text-muted-foreground/50 line-through"
                            : sel.has(s)
                            ? "border-money bg-green-500/15 text-money"
                            : "border-border bg-background text-foreground/80"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {floorPlanUrls.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <button
            type="button"
            onClick={() => setMapOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3.5 h-11 text-[13px] font-bold text-foreground"
          >
            🗺️ 테이블맵 보기
            <span className="text-[12px] text-muted-foreground">{mapOpen ? "▴ 접기" : "▾ 눌러서 열기"}</span>
          </button>
          {mapOpen && (
            <div className="border-t border-border bg-black space-y-1">
              {floorPlanUrls.map((u) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={u} src={u} alt="테이블맵" className="w-full block" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
