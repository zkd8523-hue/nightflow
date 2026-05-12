import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  AbuseInvestigationTable,
  type AbuseLeaderRow,
  type AbusePuzzleRow,
} from "@/components/admin/AbuseInvestigationTable";

export const dynamic = "force-dynamic";

export default async function AdminAbusePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (userData?.role !== "admin") redirect("/");

  // 1) 모든 깃발 (admin RLS — Migration 148)
  const { data: puzzles } = await supabase
    .from("puzzles")
    .select("id, leader_id, area, event_date, notes, status, created_at")
    .order("created_at", { ascending: false });

  // 2) leader 정보
  const leaderIds = [...new Set((puzzles || []).map((p) => p.leader_id).filter(Boolean))];
  const leaderMap = new Map<string, { id: string; name: string | null; display_name: string | null }>();
  if (leaderIds.length > 0) {
    const { data: leaders } = await supabase
      .from("users")
      .select("id, name, display_name")
      .in("id", leaderIds);
    for (const l of leaders || []) leaderMap.set(l.id, l);
  }

  // 3) 모든 오퍼 (수락된 것 + 전체 카운트용)
  const puzzleIds = (puzzles || []).map((p) => p.id);
  const offerMap = new Map<string, { total: number; acceptedMdId: string | null }>();
  if (puzzleIds.length > 0) {
    const { data: offers } = await supabase
      .from("puzzle_offers")
      .select("puzzle_id, md_id, status")
      .in("puzzle_id", puzzleIds);

    for (const o of offers || []) {
      const cur = offerMap.get(o.puzzle_id) || { total: 0, acceptedMdId: null };
      cur.total += 1;
      if (o.status === "accepted") cur.acceptedMdId = o.md_id;
      offerMap.set(o.puzzle_id, cur);
    }
  }

  // 4) 수락된 MD 정보
  const acceptedMdIds = [
    ...new Set(
      Array.from(offerMap.values())
        .map((v) => v.acceptedMdId)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const mdMap = new Map<string, { id: string; display_name: string | null; name: string | null }>();
  if (acceptedMdIds.length > 0) {
    const { data: mds } = await supabase
      .from("users")
      .select("id, name, display_name")
      .in("id", acceptedMdIds);
    for (const m of mds || []) mdMap.set(m.id, m);
  }

  // 5) leader_id 기준 그룹화
  const groupMap = new Map<
    string,
    {
      leader_id: string;
      leader_name: string;
      last_puzzle_at: string;
      puzzles: AbusePuzzleRow[];
    }
  >();

  for (const p of puzzles || []) {
    if (!p.leader_id) continue;
    const leader = leaderMap.get(p.leader_id);
    const leaderName = leader?.display_name || leader?.name || "(이름 없음)";
    const offerInfo = offerMap.get(p.id) || { total: 0, acceptedMdId: null };
    const acceptedMd = offerInfo.acceptedMdId ? mdMap.get(offerInfo.acceptedMdId) : null;
    const acceptedMdName = acceptedMd?.display_name || acceptedMd?.name || null;

    const row: AbusePuzzleRow = {
      id: p.id,
      created_at: p.created_at,
      event_date: p.event_date,
      area: p.area,
      notes: p.notes,
      status: p.status,
      accepted_md_id: offerInfo.acceptedMdId,
      accepted_md_name: acceptedMdName,
      offer_count: offerInfo.total,
    };

    const existing = groupMap.get(p.leader_id);
    if (existing) {
      existing.puzzles.push(row);
      if (p.created_at > existing.last_puzzle_at) existing.last_puzzle_at = p.created_at;
    } else {
      groupMap.set(p.leader_id, {
        leader_id: p.leader_id,
        leader_name: leaderName,
        last_puzzle_at: p.created_at,
        puzzles: [row],
      });
    }
  }

  // 6) 각 그룹의 수락 MD 요약 집계
  const rows: AbuseLeaderRow[] = Array.from(groupMap.values()).map((g) => {
    const mdCount = new Map<string, { md_name: string; count: number }>();
    let acceptedCount = 0;
    for (const p of g.puzzles) {
      if (p.accepted_md_id && p.accepted_md_name) {
        acceptedCount += 1;
        const cur = mdCount.get(p.accepted_md_id);
        if (cur) cur.count += 1;
        else mdCount.set(p.accepted_md_id, { md_name: p.accepted_md_name, count: 1 });
      }
    }
    const accepted_md_summary = Array.from(mdCount.entries())
      .map(([md_id, v]) => ({ md_id, md_name: v.md_name, count: v.count }))
      .sort((a, b) => b.count - a.count);

    return {
      leader_id: g.leader_id,
      leader_name: g.leader_name,
      total_puzzles: g.puzzles.length,
      accepted_count: acceptedCount,
      last_puzzle_at: g.last_puzzle_at,
      accepted_md_summary,
      puzzles: g.puzzles,
    };
  });

  // 7) 최근 깃발 게시일 내림차순 정렬 (활동순)
  rows.sort((a, b) => b.last_puzzle_at.localeCompare(a.last_puzzle_at));

  const totalLeaders = rows.length;
  const zeroAccept = rows.filter((r) => r.accepted_count === 0 && r.total_puzzles >= 3).length;
  const repeatedMd = rows.filter((r) =>
    r.accepted_md_summary.some((md) => md.count >= 2)
  ).length;

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20 text-white">
      <div className="max-w-3xl mx-auto px-4">
        {/* 헤더 */}
        <div className="flex items-center gap-3 py-5">
          <Link href="/admin" className="text-white">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <ShieldAlert className="w-5 h-5 text-red-400" />
          <h1 className="text-[20px] font-black">어뷰징 조사</h1>
        </div>

        {/* 요약 */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-[#1C1C1E] border border-neutral-800 rounded-xl px-4 py-3">
            <p className="text-[11px] text-neutral-500 font-bold">깃발 게시 유저</p>
            <p className="text-[18px] font-black text-white mt-0.5">{totalLeaders}명</p>
          </div>
          <div className="bg-[#1C1C1E] border border-neutral-800 rounded-xl px-4 py-3">
            <p className="text-[11px] text-neutral-500 font-bold">3건+ 수락 0</p>
            <p className="text-[18px] font-black text-red-400 mt-0.5">{zeroAccept}명</p>
          </div>
          <div className="bg-[#1C1C1E] border border-neutral-800 rounded-xl px-4 py-3">
            <p className="text-[11px] text-neutral-500 font-bold">동일 MD ×2+</p>
            <p className="text-[18px] font-black text-red-400 mt-0.5">{repeatedMd}명</p>
          </div>
        </div>

        <p className="text-[11px] text-neutral-500 mb-3">
          최근 깃발 게시일 내림차순. 클릭 시 게시글 목록 펼침.
        </p>

        <AbuseInvestigationTable rows={rows} />
      </div>
    </div>
  );
}
