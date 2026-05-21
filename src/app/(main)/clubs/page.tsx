import type { Metadata } from "next";
import { createServerClient } from "@supabase/ssr";
import { ClubList } from "@/components/clubs/ClubList";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "전국 클럽 가이드 - 강남·홍대·이태원 클럽 정보 한눈에",
  description:
    "우리나라 클럽 정보를 한눈에. 강남·홍대·이태원·부산·광주·대구 인기 클럽을 둘러보고, 예약 가능한 곳은 깃발로 바로 잡으세요.",
  alternates: { canonical: "https://nightflow.kr/clubs" },
  openGraph: {
    title: "전국 클럽 가이드 - 나이트플로우(나플)",
    description:
      "전국 인기 클럽 정보를 한눈에 비교. 마음에 드는 클럽은 깃발 한 번으로 예약.",
    url: "https://nightflow.kr/clubs",
    type: "website",
  },
};

function createAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

export default async function ClubsIndexPage() {
  const supabase = createAnonClient();

  // 신규 컬럼 (tags, drink_menu_url)을 먼저 시도하고, 마이그레이션 미적용 환경에서는
  // 기본 컬럼만 사용. 컬럼 없을 때 PostgREST가 전체 쿼리를 실패시키므로 fallback 필요.
  let clubsRes: { data: Array<Record<string, unknown>> | null; error: unknown } =
    await supabase
      .from("clubs")
      .select("id, name, area, thumbnail_url, tags, drink_menu_url")
      .is("deleted_at", null)
      .not("name", "ilike", "%운영자%");

  if (clubsRes.error) {
    clubsRes = await supabase
      .from("clubs")
      .select("id, name, area, thumbnail_url")
      .is("deleted_at", null)
      .not("name", "ilike", "%운영자%");
  }

  const auctionsRes = await supabase
    .from("auctions")
    .select("club_id")
    .in("status", ["active", "scheduled"]);

  const HIDDEN_NAME_PATTERNS = [/luna/i, /prism/i, /eclipse/i, /^orion$/i];
  const clubs = (clubsRes.data ?? []).filter(
    (c: { name: string }) => !HIDDEN_NAME_PATTERNS.some((re) => re.test(c.name))
  );
  const activeCountMap: Record<string, number> = {};
  for (const a of auctionsRes.data ?? []) {
    if (!a.club_id) continue;
    activeCountMap[a.club_id] = (activeCountMap[a.club_id] || 0) + 1;
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 mb-20">
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
          전국 클럽 가이드
        </h1>
        <p className="text-sm text-neutral-400 leading-relaxed break-keep">
          우리나라 클럽 정보를 한눈에.
        </p>
      </header>

      <ClubList
        clubs={clubs.map((c: Record<string, unknown>) => ({
          id: c.id as string,
          name: c.name as string,
          area: (c.area as string | null) ?? null,
          thumbnail_url: (c.thumbnail_url as string | null) ?? null,
          tags: (c.tags as string[] | undefined) ?? [],
          drink_menu_url: (c.drink_menu_url as string | null | undefined) ?? null,
        }))}
        activeCountMap={activeCountMap}
      />
    </div>
  );
}
