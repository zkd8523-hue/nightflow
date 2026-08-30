import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DjCupRankingTable, type DjCupRankingRow } from "@/components/djcup/DjCupRankingTable";
import { DjCupComments } from "@/components/djcup/DjCupComments";

// 집계가 계속 바뀌는 화면이라 캐시하지 않는다.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "DJ 이상형 월드컵 랭킹",
  description: "DJ 이상형 월드컵 전체 우승비율·승률 랭킹. 나플 DJ 데이터베이스 기반.",
  alternates: { canonical: "https://nightflow.kr/dj-cup/ranking" },
  openGraph: {
    title: "DJ 이상형 월드컵 랭킹",
    description: "전체 유저가 뽑은 DJ 랭킹.",
    url: "https://nightflow.kr/dj-cup/ranking",
    type: "website",
    images: [{ url: "/og-djcup.jpg", width: 1200, height: 630 }],
  },
};

export default async function DjCupRankingPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_dj_cup_ranking", { p_limit: 50 });
  const rows = (data ?? []) as DjCupRankingRow[];
  const totalPlays = rows[0]?.total_plays ?? 0;

  return (
    <div className="max-w-lg lg:max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-[20px] font-black text-white tracking-[-0.035em]">
        DJ 이상형 월드컵 랭킹
      </h1>

      {totalPlays > 0 ? (
        <>
          <p className="text-[11.5px] text-muted-foreground mt-1.5 mb-4">
            총 <span className="text-foreground font-bold tabular-nums">{totalPlays}</span>판 집계
          </p>
          <div className="bg-card border border-border rounded-2xl p-4">
            <DjCupRankingTable rows={rows} />
          </div>
        </>
      ) : (
        <p className="text-[12.5px] text-muted-foreground mt-6 mb-4 text-center py-8">
          아직 집계된 게임이 없어요
        </p>
      )}

      <Link
        href="/dj-cup"
        className="h-[38px] mt-5 rounded-xl bg-white text-black font-black text-[12.5px] tracking-[-0.02em] flex items-center justify-center"
      >
        나도 해보기
      </Link>

      {/* 집계가 0판이어도 댓글은 쌓인다 — 빈 랭킹만 있는 화면을 살리는 자리.
          여기서는 우승자를 붙이지 않는다(판을 끝낸 사람이 아니다). */}
      <DjCupComments />
    </div>
  );
}
