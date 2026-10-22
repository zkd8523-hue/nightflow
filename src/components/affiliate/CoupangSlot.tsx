"use client";

// 쿠팡 파트너스 상품 자리 — 세 가지 모양(목업 확정안, 2026-10-22).
// - rail: 상품 카드 가로 줄(클럽 상세·아티스트·공연 상세). 5초마다 한 칸 살짝 밀었다 돌아오는 힌트.
// - grid: 3칸 고정 격자(홈 — 위아래가 이미 가로 스크롤이라 넘김 없음).
// - band: 한 줄 띠(클럽 가이드·라인업·공연 목록) → 키트(/picks) 페이지로.
// 링크가 없는 상품은 숨긴다(?affpreview=1이면 자리표시로 보여줌). 고를 상품이 없으면 자리 자체를 안 그린다.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { COUPANG_DISCLOSURE, isAffPreview, toAffArea } from "@/lib/affiliate/config";
import { pickCoupangSet, coupangSearchUrl, type CoupangProduct } from "@/lib/affiliate/coupang";
import { trackAdClick, useAdImpression } from "./useAdTracking";

const SEEN_KEY = "nf_aff_seen";

function readSeen(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function addSeen(ids: string[]) {
  try {
    const next = Array.from(new Set([...readSeen(), ...ids])).slice(-12);
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(next));
  } catch {}
}

export function AdBadge({ label = "Ad" }: { label?: string }) {
  return (
    <span className="shrink-0 rounded border border-white/20 px-1.5 text-[10.5px] font-bold leading-[17px] text-neutral-300">
      {label}
    </span>
  );
}

function ProductImage({ p, className, withPrice = false }: { p: CoupangProduct; className: string; withPrice?: boolean }) {
  return (
    <div className={`relative overflow-hidden bg-white ${className}`}>
      {p.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.image} alt={p.shortName} loading="lazy" className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] font-bold text-neutral-500">
          {p.shortName}
        </div>
      )}
      {p.rocket && (
        <span className="absolute bottom-1 left-1 rounded bg-blue-600 px-1 py-[2px] text-[9px] font-extrabold leading-none text-white">
          로켓
        </span>
      )}
      {/* 가격은 사진 위에 얹는다 — 아래에 한 줄을 더 두면 자리를 너무 먹는다(2026-10-22 운영자) */}
      {withPrice && price(p) && (
        <span className="absolute bottom-1 right-1 rounded-md bg-black/80 px-1.5 py-[3px] text-[12px] font-extrabold leading-none text-white">
          {price(p)}
        </span>
      )}
    </div>
  );
}

function price(p: CoupangProduct) {
  if (p.price == null) return null;
  return `${p.price.toLocaleString("ko-KR")}원${p.priceFrom ? "~" : ""}`;
}

function hrefOf(p: CoupangProduct) {
  return p.link || coupangSearchUrl(p);
}

export interface CoupangSlotProps {
  variant: "rail" | "grid" | "band";
  placement: string;
  /** 클럽 area · 공연 venue_area */
  area?: string | null;
  title: string;
  /** band 전용 보조 문구 */
  subtitle?: string;
  className?: string;
  /** 바뀔 때마다 상품을 다시 뽑는다(라인업 클럽/DJ 탭 전환 — 같은 자리에 새 조합을 보여줘 시선을 끈다) */
  refreshKey?: string;
}

export function CoupangSlot({ variant, placement, area, title, subtitle, className = "", refreshKey }: CoupangSlotProps) {
  const { user } = useCurrentUser();
  const gender = (user as { gender?: "male" | "female" | null } | null)?.gender ?? null;
  const [products, setProducts] = useState<CoupangProduct[] | null>(null);
  const affArea = toAffArea(area);
  const count = variant === "rail" ? 5 : 3;

  // 뽑기는 마운트 후 브라우저에서 — 서버 캐시 페이지라 서버에서 뽑으면 모두 같은 조합이 된다.
  useEffect(() => {
    const preview = isAffPreview();
    const set = pickCoupangSet({
      area: affArea,
      count,
      gender,
      usable: (p) => !!p.link || preview,
      exclude: readSeen(),
    });
    // 제외 때문에 모자라면 제외 없이 다시
    const final =
      set.length < count
        ? pickCoupangSet({ area: affArea, count, gender, usable: (p) => !!p.link || preview })
        : set;
    setProducts(final);
    addSeen(final.map((p) => p.id));
  }, [affArea, count, gender, refreshKey]);

  const items = useMemo(() => products?.map((p) => p.id).join(",") ?? "", [products]);
  const trackBase = { ad_id: "aff_coupang", placement, area: affArea, items, variant };
  const ref = useAdImpression<HTMLDivElement>(products && products.length ? trackBase : null);

  if (!products || products.length === 0) return null;

  const onClick = (p: CoupangProduct, i: number) =>
    trackAdClick({ ...trackBase, item_id: p.id, position: i + 1, target: p.link ? "coupang" : "coupang_preview" });

  if (variant === "band") {
    return (
      <div ref={ref} className={className}>
        <Link
          href={`/picks?from=${encodeURIComponent(placement)}`}
          onClick={() => trackAdClick({ ...trackBase, item_id: "kit", position: 0, target: "picks" })}
          className="flex min-h-[44px] items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 md:gap-4 md:px-5 md:py-4"
        >
          {/* 넓은 화면에선 띠가 화면 폭만큼 늘어나 썸네일·글씨가 상대적으로 작아 보인다 → md부터 키운다 */}
          <div className="flex shrink-0">
            {products.slice(0, 3).map((p, i) => (
              <ProductImage
                key={p.id}
                p={{ ...p, rocket: false }}
                className={`h-10 w-10 rounded-[9px] border-2 border-card md:h-16 md:w-16 md:rounded-xl ${i > 0 ? "-ml-3 md:-ml-4" : ""}`}
              />
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[14px] font-extrabold text-foreground md:text-[18px]">{title}</span>
              <AdBadge />
            </div>
            {subtitle && <p className="truncate text-[11.5px] text-muted-foreground md:mt-0.5 md:text-[14px]">{subtitle}</p>}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground md:h-5 md:w-5" aria-hidden="true" />
        </Link>
        <p className="mt-1.5 truncate text-[9.5px] text-muted-foreground/80">{COUPANG_DISCLOSURE}</p>
      </div>
    );
  }

  const head = (
    <div className="flex min-h-[44px] items-center justify-between gap-2 pr-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-[15px] font-extrabold text-foreground">{title}</span>
        <AdBadge />
      </div>
      {/* "더보기"는 뺐다 — 우리 키트 페이지를 한 번 더 거치는 것보다 상품을 바로 누르는 게 쿠팡 쿠키에 짧다(2026-10-22 운영자) */}
    </div>
  );

  if (variant === "grid") {
    return (
      <div ref={ref} className={className}>
        <div className="rounded-2xl border border-border bg-card px-3.5 pb-3.5 pt-0.5">
          {head}
          <div className="grid grid-cols-3 gap-2.5">
            {products.map((p, i) => (
              <a
                key={p.id}
                href={hrefOf(p)}
                target="_blank"
                rel="sponsored nofollow noopener noreferrer"
                onClick={() => onClick(p, i)}
                className="min-w-0"
              >
                <ProductImage p={p} withPrice className="aspect-square w-full rounded-[10px]" />
                <p className="mt-1.5 truncate text-[12px] text-neutral-200">{p.shortName}</p>
              </a>
            ))}
          </div>
        </div>
        <p className="mt-1.5 truncate text-[9.5px] text-muted-foreground/80">{COUPANG_DISCLOSURE}</p>
      </div>
    );
  }

  // rail
  return (
    <div ref={ref} className={className}>
      <div className="rounded-2xl border border-border bg-card pb-3.5 pl-3.5 pt-0.5">
        <div className="pr-2">{head}</div>
        <div className="overflow-hidden">
          <div className="flex gap-2.5 overflow-x-auto pr-3.5 scrollbar-hide motion-safe:animate-[aff-nudge_5s_ease-in-out_3]">
            {products.map((p, i) => (
              <a
                key={p.id}
                href={hrefOf(p)}
                target="_blank"
                rel="sponsored nofollow noopener noreferrer"
                onClick={() => onClick(p, i)}
                className="w-[112px] shrink-0"
              >
                <ProductImage p={p} withPrice className="h-[112px] w-[112px] rounded-[10px]" />
                <p className="mt-1.5 line-clamp-2 h-[34px] text-[12.5px] leading-[1.35] text-neutral-200">{p.name}</p>
              </a>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-1.5 truncate text-[9.5px] text-muted-foreground/80">{COUPANG_DISCLOSURE}</p>
    </div>
  );
}
