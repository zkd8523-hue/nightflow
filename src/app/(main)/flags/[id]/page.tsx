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
    .select("id, name, display_name, profile_image, phone, instagram, role, strike_count, is_blocked")
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

  return (
    <PuzzleDetailClient
      puzzle={puzzle}
      members={members || []}
      currentUserId={authUser?.id}
      userRole={profile?.role as "user" | "md" | "admin" | undefined}
      leader={profile?.role === "admin" ? leader ?? null : null}
      currentUserKakaoUrl={profile?.kakao_open_chat_url ?? null}
    />
  );
}
