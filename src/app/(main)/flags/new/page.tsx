import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PuzzleForm } from "@/components/puzzles/PuzzleForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { lang } = await searchParams;
  if (lang && lang !== "ko") {
    return { title: { absolute: "Get VIP offers | NightFlow" } };
  }
  return { title: "깃발 꽂기" };
}

export default async function PuzzleNewPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const isForeigner = !!lang && lang !== "ko";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 비로그인 → 로그인 후 깃발 등록으로 복귀(redirect 보존). 외국인은 lang(en/ja/zh) 유지.
  if (!user) {
    redirect(
      isForeigner
        ? `/login?lang=${lang}&redirect=${encodeURIComponent(`/flags/new?lang=${lang}`)}`
        : "/login"
    );
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "md") redirect("/?tab=puzzle");

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20">
      <div className="max-w-lg mx-auto p-6">
        {/* 외국인은 글로벌 헤더가 숨겨지므로 폼 자체에 /en 복귀 링크 제공 */}
        {isForeigner && (
          <Link
            href={`/en?lang=${lang}`}
            aria-label="Back"
            className="inline-flex items-center gap-1 -ml-1 mb-4 px-2 py-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-[14px] font-bold">Back</span>
          </Link>
        )}

        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-2xl font-black text-white tracking-tight">
            {isForeigner ? "Tell us your night" : "🚩 깃발 꽂기"}
          </h1>
          <p className="text-neutral-500 text-sm font-medium mt-0.5 break-keep">
            {isForeigner
              ? "Set your budget — Seoul's clubs send you private VIP offers"
              : "예산만 정하면 클럽에서 시크릿오퍼를 제안해요"}
          </p>
        </div>

        <PuzzleForm userId={user.id} />
      </div>
    </div>
  );
}
