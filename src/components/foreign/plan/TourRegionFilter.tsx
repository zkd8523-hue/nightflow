"use client";
// 투어 페이지 지역 필터(2026-10-01, 사용자 요청 "서울 말고 전국 각지"). 상품이 있는 지역만 칩으로 보인다 —
// 빈 결과로 가는 칩을 만들지 않는다(홈 장르 칩과 같은 원칙).
import { useState } from "react";
import { type Tour, type TourRegion, TOUR_REGIONS } from "@/lib/planMemory/content";
import { TourCards } from "./PlanMemoryParts";

export function TourRegionFilter({ tours }: { tours: Tour[] }) {
  const regions = TOUR_REGIONS.filter((r) => tours.some((t) => t.region === r));
  const [active, setActive] = useState<TourRegion | "All">("All");
  const shown = active === "All" ? regions : [active];

  const chip = (on: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13px] transition-colors ${
      on ? "bg-inverse text-inverse-foreground font-black" : "bg-card border border-border font-bold hover:border-foreground/30"
    }`;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
        <button type="button" onClick={() => setActive("All")} className={chip(active === "All")}>All Korea</button>
        {regions.map((r) => (
          <button key={r} type="button" onClick={() => setActive(r)} className={chip(active === r)}>
            {r} <span className="opacity-60">{tours.filter((t) => t.region === r).length}</span>
          </button>
        ))}
      </div>
      {shown.map((r) => {
        const list = tours.filter((t) => t.region === r);
        return (
          <section key={r} className="space-y-3">
            <h2 className="text-[20px] font-black">{r}</h2>
            <TourCards tours={list} campaign={`tours-${r.toLowerCase()}`} compact />
          </section>
        );
      })}
    </div>
  );
}
