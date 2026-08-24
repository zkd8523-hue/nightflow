"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ticket, Clock } from "lucide-react";
import { benefitTypeLabel, formatCouponCountdown } from "@/lib/utils/coupon";
import type { CouponClaim } from "@/types/database";

type Tab = "active" | "used" | "expired";

interface Props {
  claims: CouponClaim[];
}

export function MyCouponList({ claims }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("active");
  const [now] = useState(() => Date.now());

  const grouped = useMemo(() => {
    const active: CouponClaim[] = [];
    const used: CouponClaim[] = [];
    const expired: CouponClaim[] = [];
    for (const c of claims) {
      if (c.status === "redeemed") used.push(c);
      else if (c.status === "active" && new Date(c.expires_at).getTime() > now) active.push(c);
      else expired.push(c); // expired/revoked/만료된 active 전부 여기로
    }
    return { active, used, expired };
  }, [claims, now]);

  const list = grouped[tab];

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로가기"
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-card -ml-2"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex items-center gap-1.5">
          <Ticket className="w-5 h-5 text-brand-amber" />
          <h1 className="text-xl md:text-2xl font-black text-foreground tracking-tight">내 쿠폰함</h1>
        </div>
      </header>

      <div className="flex gap-1 bg-card rounded-full p-1">
        {([
          ["active", `사용가능 ${grouped.active.length}`],
          ["used", `사용완료 ${grouped.used.length}`],
          ["expired", `만료 ${grouped.expired.length}`],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 h-9 rounded-full text-[12px] font-bold transition-colors ${
              tab === key ? "bg-amber-500 text-black" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[14px] text-muted-foreground">
            {tab === "active" ? "보유 중인 쿠폰이 없어요" : tab === "used" ? "사용한 쿠폰이 없어요" : "만료된 쿠폰이 없어요"}
          </p>
          {tab === "active" && (
            <Link href="/coupons" className="inline-block mt-3 text-[12px] font-bold text-brand-amber hover:underline">
              쿠폰 받으러 가기 →
            </Link>
          )}
        </div>
      ) : (
        <div className="divide-y divide-neutral-800/60">
          {list.map((c) => (
            <ClaimRow key={c.id} claim={c} tab={tab} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClaimRow({ claim, tab }: { claim: CouponClaim; tab: Tab }) {
  const { label, emoji } = benefitTypeLabel(claim.benefit_type);
  const thumb = claim.issue?.thumbnail_url || claim.club?.thumbnail_url || null;

  const inner = (
    <div className="flex gap-3 py-4 items-center">
      <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-muted shrink-0">
        {thumb ? (
          <Image src={thumb} alt={claim.club?.name ?? label} fill sizes="64px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[20px]">{emoji}</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[11px] font-bold text-brand-amber">{emoji} {label}</span>
        <p className="text-foreground font-black text-[14px] leading-snug line-clamp-1">
          {claim.club?.name ?? ""}
        </p>
        {tab === "active" && (
          <span className="text-[11px] font-black text-brand-amber inline-flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3" />
            {formatCouponCountdown(claim.expires_at)}
          </span>
        )}
        {tab === "used" && claim.redeemed_at && (
          <span className="text-[11px] text-muted-foreground mt-0.5 block">
            {new Date(claim.redeemed_at).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} 사용
          </span>
        )}
      </div>
    </div>
  );

  if (tab === "active") {
    return (
      <Link href={`/my-coupons/${claim.id}/use`} className="block active:opacity-70 transition-opacity">
        {inner}
      </Link>
    );
  }
  return <div className="opacity-70">{inner}</div>;
}
