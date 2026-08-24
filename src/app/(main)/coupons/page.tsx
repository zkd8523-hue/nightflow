import type { Metadata } from "next";
import { Suspense } from "react";
import { createServerClient } from "@supabase/ssr";
import { CouponList } from "@/components/coupon/CouponList";
import { benefitTypeLabel } from "@/lib/utils/coupon";
import { hideTestData } from "@/lib/utils/testData";
import type { CouponIssue } from "@/types/database";

export const revalidate = 30;

// brand suffix(" | 나플")는 layout.tsx의 title.template이 자동 추가.
export const metadata: Metadata = {
  title: "오늘의 클럽 쿠폰·무료입장 - 강남·홍대 클럽 쿠폰함",
  description:
    "나플에서 지금 받을 수 있는 강남·홍대·이태원 클럽 무료입장·프리드링크 쿠폰. 선착순으로 받아 현장에서 바로 사용하세요.",
  alternates: { canonical: "https://nightflow.kr/coupons" },
  keywords: [
    "클럽 쿠폰",
    "클럽 무료입장 쿠폰",
    "강남 클럽 쿠폰",
    "홍대 클럽 쿠폰",
    "클럽 프리드링크",
    "클럽 게스트 쿠폰",
    "나플",
    "나이트플로우",
  ],
  openGraph: {
    title: "오늘의 클럽 쿠폰·무료입장 - 강남·홍대 클럽 쿠폰함",
    description: "강남·홍대 클럽 무료입장·프리드링크 쿠폰을 지금 받아보세요. 나플.",
    url: "https://nightflow.kr/coupons",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

function createAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

export default async function CouponsIndexPage() {
  const supabase = createAnonClient();

  const { data: coupons } = await hideTestData(
    supabase
      .from("coupon_issues")
      .select(`*, club:clubs(id, name, area, thumbnail_url)`)
      .in("status", ["active", "sold_out"])
      .gt("redeem_ends_at", new Date().toISOString())
      .order("redeem_ends_at", { ascending: true }),
    "clubs"
  );

  const visible = (coupons ?? []) as unknown as CouponIssue[];

  return (
    <div className="container mx-auto max-w-3xl px-4 pt-4 pb-8 mb-20">
      <div className="sr-only">
        <h1>오늘의 클럽 쿠폰·무료입장 - 강남·홍대·이태원 클럽 쿠폰함</h1>
        <p>
          나플에서 지금 받을 수 있는 클럽 무료입장·프리드링크·주류 세트 할인 쿠폰
          {visible.length}건. 강남·홍대·이태원 클럽 쿠폰을 선착순으로 받아
          현장에서 바로 사용하세요.
        </p>
        {visible.length > 0 && (
          <ul>
            {visible.slice(0, 50).map((c) => {
              const club = c.club;
              const area = club?.area ?? "";
              const clubName = club?.name ?? "";
              const areaPrefix = area ? `${area} ` : "";
              return (
                <li key={c.id}>
                  {areaPrefix}{clubName} 쿠폰 - {benefitTypeLabel(c.benefit_type).label}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Suspense fallback={null}>
        <CouponList coupons={visible} />
      </Suspense>
    </div>
  );
}
