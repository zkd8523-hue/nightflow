"use client";

import { useState } from "react";
import { LiquorInfoSheet } from "./LiquorInfoSheet";
import { matchLiquorProduct } from "@/lib/utils/liquorMatch";
import { toEnglishInclude } from "@/lib/utils/liquorEn";
import type { LiquorProduct } from "@/types/database";

interface LiquorPillProps {
  includeText: string;
  products: LiquorProduct[];
  isForeigner?: boolean;
}

/** 오퍼 카드의 🍾 주류 배지 — 탭하면 이미지/설명/가격대 정보 시트가 뜬다 */
export function LiquorPill({ includeText, products, isForeigner = false }: LiquorPillProps) {
  const [open, setOpen] = useState(false);
  const product = matchLiquorProduct(includeText, products);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[13px] font-bold px-2.5 py-1 rounded-[7px] bg-gradient-to-b from-amber-400/15 to-amber-600/10 border border-amber-300/40 ring-1 ring-inset ring-amber-200/20 shadow-[0_0_12px_-2px_rgba(245,158,11,0.35)]"
      >
        <span aria-hidden>🍾</span>
        <span className="bg-gradient-to-b from-amber-200 to-amber-500 bg-clip-text text-transparent">
          {isForeigner ? toEnglishInclude(includeText) : includeText}
        </span>
      </button>
      <LiquorInfoSheet
        open={open}
        onOpenChange={setOpen}
        product={product}
        includeText={includeText}
      />
    </>
  );
}
