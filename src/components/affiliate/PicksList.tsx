"use client";

import { useEffect, useState } from "react";
import { COUPANG_DISCLOSURE, isAffPreview } from "@/lib/affiliate/config";
import { kitProducts, coupangSearchUrl, type CoupangProduct } from "@/lib/affiliate/coupang";
import { AdBadge } from "./CoupangSlot";
import { trackAdClick, useAdImpression } from "./useAdTracking";

const CATEGORY_LABEL: Record<CoupangProduct["category"], string> = {
  hangover: "숙취", battery: "충전", breath: "입냄새", oral: "입냄새", deo: "땀",
  hair: "머리", lip: "립", fixer: "화장 고정", perfume: "향", bag: "가방", halloween: "할로윈",
};

export function PicksList() {
  const [items, setItems] = useState<CoupangProduct[] | null>(null);
  const [from, setFrom] = useState("direct");

  useEffect(() => {
    const preview = isAffPreview();
    setItems(kitProducts((p) => !!p.link || preview));
    setFrom(new URLSearchParams(window.location.search).get("from") ?? "direct");
  }, []);

  const base = { ad_id: "aff_coupang", placement: `picks_${from}`, items: items?.map((p) => p.id).join(","), variant: "kit" };
  const ref = useAdImpression<HTMLDivElement>(items && items.length ? base : null);

  if (!items) return null;
  if (items.length === 0) {
    return <p className="py-10 text-center text-[13px] text-muted-foreground">곧 채워질 예정이에요.</p>;
  }

  return (
    <div ref={ref}>
      <div className="mb-2 flex items-center gap-1.5">
        <AdBadge />
        <span className="text-[11px] text-muted-foreground">쿠팡 상품 링크</span>
      </div>
      <ol className="divide-y divide-border rounded-2xl border border-border bg-card px-3.5">
        {items.map((p, i) => (
          <li key={p.id}>
            <a
              href={p.link || coupangSearchUrl(p)}
              target="_blank"
              rel="sponsored nofollow noopener noreferrer"
              onClick={() => trackAdClick({ ...base, item_id: p.id, position: i + 1, target: p.link ? "coupang" : "coupang_preview" })}
              className="flex min-h-[72px] items-center gap-3 py-3"
            >
              <span className="w-5 shrink-0 text-center font-mono text-[15px] font-black text-[#DFFF00]">{i + 1}</span>
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[10px] bg-white">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt={p.shortName} loading="lazy" className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center p-1 text-center text-[9.5px] font-bold text-neutral-500">
                    {p.shortName}
                  </div>
                )}
                {p.rocket && (
                  <span className="absolute bottom-0.5 left-0.5 rounded bg-blue-600 px-1 py-[1px] text-[8.5px] font-extrabold text-white">로켓</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-muted-foreground">{CATEGORY_LABEL[p.category]}</p>
                <p className="line-clamp-2 text-[14px] font-bold leading-snug text-foreground">{p.name}</p>
                {p.price != null && (
                  <p className="text-[13.5px] font-extrabold text-foreground">
                    {p.price.toLocaleString("ko-KR")}원{p.priceFrom ? "~" : ""}
                  </p>
                )}
              </div>
            </a>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground">{COUPANG_DISCLOSURE} 가격은 쿠팡 기준이며 바뀔 수 있어요.</p>
    </div>
  );
}
