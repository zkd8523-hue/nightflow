import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PuzzleForm } from "@/components/puzzles/PuzzleForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "파티 올리기",
  description: "친구가 모자라도 인당 부담 소액으로 좋은 자리. 파티 등록하고 오퍼 받으세요.",
  alternates: { canonical: "https://nightflow.kr/shares/new" },
  openGraph: {
    title: "파티 올리기 — 파티원 모집",
    description: "파티를 등록하면 친구들이 채팅방에 합류. 클럽에서 오퍼가 옵니다.",
    url: "https://nightflow.kr/shares/new",
    siteName: "나플",
    locale: "ko_KR",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "나플 — 파티 올리기" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "파티 올리기 — 파티원 모집",
    description: "파티를 등록하면 친구들이 채팅방에 합류. 클럽에서 오퍼가 옵니다.",
    images: ["/og-image.png"],
  },
};

// 조각(파티원 모집) 신규 등록 — 깃발과 별개 진입점.
// 밑단은 파티원 모집 배관(puzzles.is_recruiting_party=true) 재사용, 화면만 조각으로 분리.
export default async function ShareNewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  // 조각은 유저 주도 기능 — MD는 등록 대상 아님
  if (profile?.role === "md") redirect("/");

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-lg mx-auto p-6">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-2xl font-black text-foreground tracking-tight">🎉 파티</h1>
          <p className="text-muted-foreground text-sm font-medium mt-0.5 break-keep">
            파티원을 모아 테이블을 예약해요
          </p>
        </div>

        <PuzzleForm userId={user.id} shareMode />
      </div>
    </div>
  );
}
