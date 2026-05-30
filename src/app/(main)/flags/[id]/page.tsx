import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PuzzleDetailClient } from "@/components/puzzles/PuzzleDetailClient";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: puzzle } = await supabase
    .from("puzzles")
    .select("area, event_date, target_count, current_count, budget_per_person, is_recruiting_party, status")
    .eq("id", id)
    .single();

  if (!puzzle) {
    return { title: "퍼즐을 찾을 수 없습니다" };
  }

  const area = puzzle.area || "서울";
  const eventDate = puzzle.event_date
    ? new Date(puzzle.event_date).toLocaleDateString("ko-KR", {
        month: "numeric",
        day: "numeric",
        weekday: "short",
      })
    : "";
  const budgetText = puzzle.budget_per_person
    ? `${Math.round(puzzle.budget_per_person / 10000)}만원`
    : "";
  const remaining = Math.max(
    (puzzle.target_count ?? 0) - (puzzle.current_count ?? 0),
    0
  );
  const recruiting = puzzle.is_recruiting_party && remaining > 0;
  const mode = recruiting ? `${remaining}명 추가 모집` : `${puzzle.target_count}명 확정`;

  const title = `${area} 클럽 퍼즐 ${mode}${eventDate ? ` · ${eventDate}` : ""}${budgetText ? ` · ${budgetText}` : ""}`;
  const description = `${area} 클럽 조각·합석 일행 모집. ${eventDate ? `${eventDate} ` : ""}${puzzle.target_count}명${budgetText ? ` ${budgetText}` : ""} 퍼즐${recruiting ? " 진행 중" : " 확정"}. 나이트플로우(나플)에서 안전하게 일행을 찾으세요.`;

  return {
    title,
    description,
    keywords: [
      "퍼즐",
      "클럽 퍼즐",
      "클럽 조각",
      "클럽 조각모임",
      "클럽 합석",
      "클럽 일행",
      "클럽 일행 구하기",
      `${area} 클럽 조각`,
      `${area} 클럽 합석`,
      `${area} 클럽 일행`,
      `${area} 클럽 퍼즐`,
      "나이트플로우",
      "나플",
    ],
    alternates: { canonical: `https://nightflow.kr/flags/${id}` },
    openGraph: {
      title,
      description,
      url: `https://nightflow.kr/flags/${id}`,
      siteName: "NightFlow",
      locale: "ko_KR",
      type: "article",
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: `${area} 클럽 퍼즐 - 나이트플로우`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.png"],
    },
  };
}

export default async function PuzzleDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user: authUser } } = await supabase.auth.getUser();

  // puzzle 먼저 받아서 leader_id 확보
  const { data: puzzle } = await supabase
    .from("puzzles")
    .select("*")
    .eq("id", id)
    .single();

  if (!puzzle) {
    // 미인증 사용자가 RLS로 막힌 경우 → 로그인 후 돌아오도록
    if (!authUser) redirect(`/login?redirect=${encodeURIComponent(`/flags/${id}`)}`);
    notFound();
  }

  // 나머지 3쿼리는 병렬 실행 (puzzle에 의존)
  const [{ data: leader }, { data: members }, { data: profile }] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, display_name, profile_image, phone, instagram, role, strike_count, is_blocked, deal_count_total, deal_amount_total, created_at, gender, last_seen_at")
      .eq("id", puzzle.leader_id)
      .maybeSingle(),
    supabase
      .from("puzzle_members")
      .select(`
        *,
        user:users(id, name, display_name, profile_image)
      `)
      .eq("puzzle_id", id)
      .order("joined_at", { ascending: true }),
    authUser
      ? supabase.from("users").select("role, kakao_open_chat_url").eq("id", authUser.id).single()
      : Promise.resolve({ data: null }),
  ]);

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
          deal_amount_total: (leader as { deal_amount_total?: number | null }).deal_amount_total ?? 0,
          created_at: leader.created_at,
          gender: leader.gender,
          last_seen_at: (leader as { last_seen_at?: string | null }).last_seen_at ?? null,
        },
      }
    : puzzle;

  // admin이면 leader의 마지막 접속(auth.last_sign_in_at) 추가 조회
  let leaderLastSeenAt: string | null = null;
  if (profile?.role === "admin" && leader) {
    const { data } = await supabase.rpc("admin_get_user_last_sign_in_at", {
      p_user_id: leader.id,
    });
    leaderLastSeenAt = (data as string | null) ?? null;
  }

  return (
    <PuzzleDetailClient
      puzzle={puzzleWithLeader}
      members={members || []}
      currentUserId={authUser?.id}
      userRole={profile?.role as "user" | "md" | "admin" | undefined}
      leader={
        profile?.role === "admin"
          ? leader
            ? { ...leader, last_sign_in_at: leaderLastSeenAt }
            : null
          : null
      }
      currentUserKakaoUrl={profile?.kakao_open_chat_url ?? null}
    />
  );
}
