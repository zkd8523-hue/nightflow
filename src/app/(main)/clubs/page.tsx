import type { Metadata } from "next";
import Link from "next/link";
import { createServerClient } from "@supabase/ssr";
import { MapPin, Flame } from "lucide-react";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "강남·홍대 인기 클럽 목록 - 클럽 테이블 예약",
  description:
    "강남·홍대 인기 클럽 전체 목록. 진행 중인 테이블 경매와 가격 정보를 확인하고 정가보다 저렴하게 예약하세요. 레이스&사운드·CLUB BERMUDA 등.",
  alternates: { canonical: "https://nightflow.kr/clubs" },
  openGraph: {
    title: "강남·홍대 인기 클럽 목록 - 나이트플로우(나플)",
    description:
      "강남 8개·홍대 2개·부산 1개 인기 클럽 진행 중인 경매와 가격 비교.",
    url: "https://nightflow.kr/clubs",
    type: "website",
  },
};

const VISIBLE_CLUB_IDS = [
  "14ed8351-1117-4210-b289-eec759bd9b07", // 강남 DM 라운지
  "0b350d81-3d3c-44f0-9113-32ce0861f87b", // 강남 Sound
  "e2e6e10a-e574-472c-af49-6380a05032ee", // 강남 레이스&사운드
  "c6e747de-140f-4a76-857d-6ed51d09b217", // 강남 아르쥬 청담 라운지
  "80ba0738-ffbb-4463-b97e-7e68e4c0da60", // 강남 컬러 압구
  "67b2286c-63e9-46a1-bb90-e9ca4ccf6fae", // 강남 HYPE SEOUL
  "bb929c21-bd6d-4766-85c6-2b51452058da", // 강남 VEIL CLUB
  "6a19815e-c22b-4bc5-8bb5-dd84b872a7b4", // 강남 플팔
  "285ed0d2-983f-49da-8873-f3d00a165d88", // 홍대 CLUB BERMUDA
  "bd820f57-46b6-4d95-822a-4f0cf8e84542", // 홍대 OCEAN
  "0d24b754-6c1d-40f6-badd-b398d03a4b3f", // 부산 그루브&스팟
];

const AREA_ORDER = ["강남", "홍대", "부산"] as const;

function createAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

export default async function ClubsIndexPage() {
  const supabase = createAnonClient();

  const [clubsRes, auctionsRes] = await Promise.all([
    supabase
      .from("clubs")
      .select("id, name, area, thumbnail_url")
      .in("id", VISIBLE_CLUB_IDS)
      .is("deleted_at", null),
    supabase
      .from("auctions")
      .select("club_id")
      .in("club_id", VISIBLE_CLUB_IDS)
      .in("status", ["active", "scheduled"]),
  ]);

  const clubs = clubsRes.data ?? [];
  const activeCountMap: Record<string, number> = {};
  for (const a of auctionsRes.data ?? []) {
    if (!a.club_id) continue;
    activeCountMap[a.club_id] = (activeCountMap[a.club_id] || 0) + 1;
  }

  const byArea: Record<string, typeof clubs> = {};
  for (const c of clubs) {
    const area = c.area || "기타";
    (byArea[area] ||= []).push(c);
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 mb-20">
      <header className="mb-8 space-y-2">
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
          강남·홍대 인기 클럽 목록
        </h1>
        <p className="text-sm text-neutral-400 leading-relaxed break-keep">
          강남·홍대 인기 클럽의 잔여 테이블을 실시간 경매로 정가보다 저렴하게
          예약하세요. 각 클럽의 진행 중인 경매와 가격 정보를 확인할 수 있습니다.
        </p>
      </header>

      <div className="space-y-10">
        {AREA_ORDER.map((area) => {
          const list = byArea[area];
          if (!list || list.length === 0) return null;
          return (
            <section key={area}>
              <h2 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-amber-500" />
                {area} 클럽{" "}
                <span className="text-neutral-500 text-sm font-medium">
                  ({list.length})
                </span>
              </h2>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {list
                  .slice()
                  .sort((a, b) =>
                    (activeCountMap[b.id] || 0) - (activeCountMap[a.id] || 0)
                  )
                  .map((club) => {
                    const cnt = activeCountMap[club.id] || 0;
                    return (
                      <li key={club.id}>
                        <Link
                          href={`/clubs/${club.id}`}
                          className="block bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-4 hover:border-neutral-600 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <h3 className="text-white font-bold truncate">
                                {club.name}
                              </h3>
                              <p className="text-xs text-neutral-500 mt-0.5">
                                {area}
                              </p>
                            </div>
                            {cnt > 0 && (
                              <span className="flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-1 rounded-full whitespace-nowrap">
                                <Flame className="w-3 h-3" />
                                {cnt}건
                              </span>
                            )}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
