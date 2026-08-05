import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PuzzleForm } from "@/components/puzzles/PuzzleForm";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PuzzleEditPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/flags/${id}/edit`);

  const { data: puzzle } = await supabase
    .from("puzzles")
    .select("*")
    .eq("id", id)
    .single();

  if (!puzzle) notFound();

  // 운영팀 교정용: 유저가 인원/예산을 잘못 등록한 경우 admin이 대신 고친다 (Migration 474)
  const { data: me } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = me?.role === "admin";

  if (puzzle.leader_id !== user.id && !isAdmin) redirect(`/flags/${id}`);
  if (puzzle.status !== "open") redirect(`/flags/${id}`);

  const { count: pendingOfferCount } = await supabase
    .from("puzzle_offers")
    .select("*", { count: "exact", head: true })
    .eq("puzzle_id", id)
    .eq("status", "pending");

  if ((pendingOfferCount ?? 0) > 0) {
    redirect(`/flags/${id}?edit_blocked=offers`);
  }

  // 방장 외 참가자가 채운 인원. 폼이 current_count를 방장 일행만으로 덮어써
  // 실제 참가자를 지워버리지 않도록 넘긴다.
  const { data: members } = await supabase
    .from("puzzle_members")
    .select("user_id, guest_count")
    .eq("puzzle_id", id);

  const joinedOthers = (members ?? [])
    .filter((m) => m.user_id !== puzzle.leader_id)
    .reduce((sum, m) => sum + 1 + (m.guest_count ?? 0), 0);

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-lg mx-auto p-6">
        <div className="mb-8 pt-6">
          <Link
            href={`/flags/${id}`}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm font-medium mb-4"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>상세로 돌아가기</span>
          </Link>
          <h1 className="text-2xl font-black text-foreground tracking-tight">{puzzle.is_recruiting_party ? "파티 수정" : "깃발 수정"}</h1>
          <p className="text-muted-foreground text-sm font-medium mt-0.5">
            날짜·지역·예산·인원·제목을 수정할 수 있어요
          </p>
        </div>

        <PuzzleForm userId={user.id} puzzle={puzzle} shareMode={puzzle.is_recruiting_party} joinedOthers={joinedOthers} />
      </div>
    </div>
  );
}
