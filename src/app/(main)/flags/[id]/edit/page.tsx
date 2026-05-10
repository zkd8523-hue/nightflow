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
  if (puzzle.leader_id !== user.id) redirect(`/flags/${id}`);
  if (puzzle.status !== "open") redirect(`/flags/${id}`);

  const { count: pendingOfferCount } = await supabase
    .from("puzzle_offers")
    .select("*", { count: "exact", head: true })
    .eq("puzzle_id", id)
    .eq("status", "pending");

  if ((pendingOfferCount ?? 0) > 0) {
    redirect(`/flags/${id}?edit_blocked=offers`);
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20">
      <div className="max-w-lg mx-auto p-6">
        <div className="mb-8 pt-6">
          <Link
            href={`/flags/${id}`}
            className="inline-flex items-center gap-1.5 text-neutral-400 hover:text-white text-sm font-medium mb-4"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>상세로 돌아가기</span>
          </Link>
          <h1 className="text-2xl font-black text-white tracking-tight">깃발 수정</h1>
          <p className="text-neutral-500 text-sm font-medium mt-0.5">
            날짜·지역·예산·인원·제목을 수정할 수 있어요
          </p>
        </div>

        <PuzzleForm userId={user.id} puzzle={puzzle} />
      </div>
    </div>
  );
}
