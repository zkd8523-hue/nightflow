import Link from "next/link";
import { WeeklyBenefitRow } from "@/components/weekly/WeeklyBenefitRow";
import { getWeeklyCoupons, getWeeklyGuestSigns } from "@/lib/weekly/benefits";

/** 헤더에 배경을 주지 않는다 — 아래 카드가 이미 박스라 둘 다 박스면 상자만 쌓인다 */
function Head({ label, href }: { label: string; href: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-2 pb-2 border-b border-border">
      <b className="text-[15px] font-black tracking-tight">{label}</b>
      <Link href={href} className="ml-auto text-[11px] text-muted-foreground font-bold shrink-0">
        전체 ›
      </Link>
    </div>
  );
}

/**
 * 호 본문의 혜택 — 쿠폰과 게스트 간판을 **따로** 싣는다.
 *
 * 섞지 않는 이유: 쿠폰은 받아서 쓰는 것이고(수량·마감이 있다), 게스트 간판은
 * 그 주 내내 걸린 입장 조건이다. 성격이 달라 한 줄에 섞으면 "이걸 받아야 하나,
 * 그냥 가면 되나"가 헷갈린다.
 *
 * 0건이면 그 섹션만 통째로 안 그린다 — 빈 제목만 남으면 서비스가 비어 보인다.
 */
export async function WeeklyBenefitSections() {
  const [coupons, signs] = await Promise.all([getWeeklyCoupons(), getWeeklyGuestSigns()]);
  if (coupons.length === 0 && signs.length === 0) return null;

  return (
    <>
      {coupons.length > 0 && (
        <section className="mt-5">
          <Head label="지금 받을 수 있는 쿠폰" href="/coupons" />
          <div className="space-y-2">
            {coupons.map((c) => (
              <WeeklyBenefitRow
                key={c.clubId}
                kind="coupon"
                clubId={c.clubId}
                clubName={c.clubName}
                clubArea={c.clubArea}
                thumbnail={c.thumbnail}
                labels={c.labels}
                extraCount={c.count - c.labels.length}
              />
            ))}
          </div>
        </section>
      )}

      {signs.length > 0 && (
        <section className="mt-5">
          <Head label="이번 주 게스트 혜택" href="/clubs" />
          <div className="space-y-2">
            {signs.map((g) => (
              <WeeklyBenefitRow
                key={g.clubId}
                kind="guest_sign"
                clubId={g.clubId}
                clubName={g.clubName}
                clubArea={g.clubArea}
                thumbnail={g.thumbnail}
                labels={g.labels}
                note={g.note}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
