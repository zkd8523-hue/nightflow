import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PuzzleForm } from "@/components/puzzles/PuzzleForm";

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
        <div className="mb-8 pt-12">
          <h1 className="text-2xl font-black text-white tracking-tight">깃발 꽂기</h1>
          <p className="text-neutral-500 text-sm font-medium mt-0.5">여러 MD들의 제안 비교하고, 최고의 조건을 골라봐요</p>
        </div>

        <PuzzleForm userId={user.id} />
      </div>
    </div>
  );
}
