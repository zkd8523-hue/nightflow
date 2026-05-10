import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PuzzleDetailClient } from "@/components/puzzles/PuzzleDetailClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PuzzleDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user: authUser } } = await supabase.auth.getUser();

  const { data: puzzle } = await supabase
    .from("puzzles")
    .select("*")
    .eq("id", id)
    .single();

  if (!puzzle) notFound();

  const { data: leader } = await supabase
    .from("users")
    .select("id, name, display_name, profile_image, phone, instagram, role, strike_count, is_blocked, deal_count_total, created_at")
    .eq("id", puzzle.leader_id)
    .maybeSingle();

  const { data: members } = await supabase
    .from("puzzle_members")
    .select(`
      *,
      user:users(id, name, display_name, profile_image)
    `)
    .eq("puzzle_id", id)
    .order("joined_at", { ascending: true });

  const { data: profile } = authUser
    ? await supabase.from("users").select("role, kakao_open_chat_url").eq("id", authUser.id).single()
    : { data: null };

  // leader 정보를 puzzle에 attach (TrustBadge용 deal_count_total + 신규 유저 판별용 created_at)
  const puzzleWithLeader = leader
    ? {
        ...puzzle,
        leader: {
          id: leader.id,
          name: leader.name,
          display_name: leader.display_name,
          profile_image: leader.profile_image,
          deal_count_total: leader.deal_count_total ?? 0,
          created_at: leader.created_at,
        },
      }
    : puzzle;

  return (
    <PuzzleDetailClient
      puzzle={puzzleWithLeader}
      members={members || []}
      currentUserId={authUser?.id}
      userRole={profile?.role as "user" | "md" | "admin" | undefined}
      leader={profile?.role === "admin" ? leader ?? null : null}
      currentUserKakaoUrl={profile?.kakao_open_chat_url ?? null}
    />
  );
}
