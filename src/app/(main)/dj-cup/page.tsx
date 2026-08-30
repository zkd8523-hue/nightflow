import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SHOW_TEST_DATA } from "@/lib/utils/testData";
import { youtubeVideoId } from "@/lib/lineups/youtubeUrl";
import { DjCupClient } from "@/components/djcup/DjCupClient";
import type { DjCupCandidate } from "@/lib/djCup/types";

// 랭킹처럼 계속 바뀌는 게임 화면이 아니라 후보 풀 자체는 자주 안 바뀐다 —
// 짧은 재검증으로 충분(lineups/page.tsx와 동일 판단).
export const revalidate = 300;

export const metadata: Metadata = {
  title: "DJ 이상형 월드컵 - 소리로 고르는 내 최애 DJ",
  description: "미리듣기로 두 DJ를 비교해 우승자를 뽑는 이상형 월드컵. 나플의 DJ 데이터베이스로 만든 게임.",
  alternates: { canonical: "https://nightflow.kr/dj-cup" },
  openGraph: {
    title: "DJ 이상형 월드컵",
    description: "귀로만 고르는 이상형 월드컵. 내 최애 DJ는 누구?",
    url: "https://nightflow.kr/dj-cup",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

async function fetchPool(): Promise<DjCupCandidate[]> {
  const supabase = await createClient();

  const query = supabase
    .from("djs")
    .select("id, display_name, slug, soundcloud_url, youtube_url, soundcloud_artwork_url")
    .or("soundcloud_url.not.is.null,youtube_url.not.is.null")
    .is("deleted_at", null);
  if (!SHOW_TEST_DATA) query.eq("is_test", false);

  const { data } = await query;

  // 유튜브 채널 URL(임베드 차단)만 있는 DJ는 제외 — 재생이 안 되는 카드가
  // 대결에 나오면 고를 근거가 사라진다.
  return (data ?? []).filter((dj) => dj.soundcloud_url || youtubeVideoId(dj.youtube_url));
}

export default async function DjCupPage() {
  const pool = await fetchPool();
  return <DjCupClient pool={pool} />;
}
