import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PuzzleForm } from "@/components/puzzles/PuzzleForm";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PuzzleNewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "md") redirect("/?tab=puzzle");

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20">
      <div className="max-w-lg mx-auto p-6">
        {/* 헤더 */}
        <div className="flex items-center gap-4 mb-8 pt-12">
          <Link
            href="/?tab=puzzle"
            className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center hover:bg-neutral-800 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-neutral-400" />
          </Link>
          <div className="space-y-0.5">
            <h1 className="text-2xl font-black text-white tracking-tight">퍼즐 모으기</h1>
            <p className="text-neutral-500 text-sm font-medium">날짜·지역·예산을 올리면 MD가 연락해요</p>
          </div>
        </div>

        <PuzzleForm userId={user.id} />
      </div>
    </div>
  );
}
