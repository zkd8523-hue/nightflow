import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PuzzleNoshowQueue } from "@/components/admin/PuzzleNoshowQueue";

export default async function PuzzleNoshowsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: adminUser } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (adminUser?.role !== "admin") redirect("/");

  // 노쇼 확정됐지만 strike 미처리인 오퍼 (146: visit_marked_at IS NOT NULL — 신청 단계 'noshow' 제외)
  const { data: pendingNoshows } = await supabase
    .from("puzzle_offers")
    .select(`
      id, proposed_price, table_type, visit_marked_at, strike_applied_at,
      md:users!puzzle_offers_md_id_fkey(id, display_name, name, instagram),
      puzzle:puzzles!puzzle_offers_puzzle_id_fkey(id, event_date, area, leader_id,
        leader:users!puzzles_leader_id_fkey(id, display_name, name, strike_count, is_blocked, blocked_until)
      )
    `)
    .eq("visit_result", "noshow")
    .not("visit_marked_at", "is", null)
    .is("strike_applied_at", null)
    .order("visit_marked_at", { ascending: true });

  // 처리 완료된 오퍼 (최근 30건)
  const { data: processedNoshows } = await supabase
    .from("puzzle_offers")
    .select(`
      id, proposed_price, table_type, visit_marked_at, strike_applied_at,
      md:users!puzzle_offers_md_id_fkey(id, display_name, name),
      puzzle:puzzles!puzzle_offers_puzzle_id_fkey(id, event_date, area,
        leader:users!puzzles_leader_id_fkey(id, display_name, name, strike_count)
      )
    `)
    .eq("visit_result", "noshow")
    .not("strike_applied_at", "is", null)
    .order("strike_applied_at", { ascending: false })
    .limit(30);

  return (
    <PuzzleNoshowQueue
      pendingNoshows={(pendingNoshows as never[]) || []}
      processedNoshows={(processedNoshows as never[]) || []}
    />
  );
}
