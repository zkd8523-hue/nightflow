import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PuzzleReviewClient } from "@/components/puzzles/PuzzleReviewClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PuzzleReviewPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) {
    redirect(`/login?redirect=${encodeURIComponent(`/flags/${id}/review`)}`);
  }

  const { data: puzzle } = await supabase
    .from("puzzles")
    .select("id, leader_id, status, accepted_offer_id, area, event_date, target_count, total_budget, budget_per_person, notes")
    .eq("id", id)
    .single();

  if (!puzzle) notFound();

  // 방장만 리뷰 작성 가능
  if (puzzle.leader_id !== authUser.id) {
    redirect(`/flags/${id}`);
  }
  // 매치된 깃발만 리뷰 가능
  if (puzzle.status !== "accepted") {
    redirect(`/flags/${id}`);
  }

  // 수락된 오퍼 + 클럽 + MD 식별 정보 조회 (방장이라 RLS 통과)
  let acceptedOffer: {
    id: string;
    proposed_price: number;
    club?: { id: string; name: string } | null;
    md?: { id: string; display_name: string | null; profile_image: string | null; instagram: string | null } | null;
  } | null = null;
  if (puzzle.accepted_offer_id) {
    const { data } = await supabase
      .from("puzzle_offers")
      .select(`
        id,
        proposed_price,
        club:clubs(id, name),
        md:public_user_profiles!puzzle_offers_md_id_fkey(id, display_name, profile_image, instagram)
      `)
      .eq("id", puzzle.accepted_offer_id)
      .single();
    if (data) acceptedOffer = data as unknown as typeof acceptedOffer;
  }

  return (
    <PuzzleReviewClient
      puzzle={puzzle}
      acceptedOffer={acceptedOffer}
    />
  );
}
