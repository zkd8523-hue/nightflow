import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PuzzleDetailClient, type PuzzleLeaderInfo } from "@/components/puzzles/PuzzleDetailClient";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

// generateMetadata와 페이지 본체가 같은 요청에서 puzzles를 두 번 조회하던 것을 dedupe (React cache).
// notFound/redirect는 각 호출부에 남기고, 여기선 데이터(or null)만 반환.
const getPuzzle = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("puzzles")
    .select("*, club:clubs(id, name, area, thumbnail_url, floor_plan_url, latitude, longitude)")
    .eq("id", id)
    .single();
  return data;
});

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}

const AREA_EN: Record<string, string> = {
  "강남": "Gangnam", "홍대": "Hongdae", "이태원": "Itaewon",
  "서울 어디든": "Anywhere in Seoul", "서울": "Seoul",
  "부산": "Busan", "대구": "Daegu", "인천": "Incheon",
  "광주": "Gwangju", "대전": "Daejeon", "울산": "Ulsan", "세종": "Sejong",
};

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const { lang } = await searchParams;
  const isForeigner = !!lang && lang !== "ko";

  const puzzle = await getPuzzle(id);

  if (!puzzle) {
    notFound(); // HTTP 404 응답 (Soft 404 방지)
  }

  if (isForeigner) {
    const areaEn = AREA_EN[puzzle.area] ?? puzzle.area ?? "Seoul";
    const dateEn = puzzle.event_date
      ? new Date(puzzle.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "";
    return {
      title: { absolute: `NightFlow ${puzzle.is_recruiting_party ? "Share" : "Flag"} · ${areaEn}${dateEn ? ` · ${dateEn}` : ""}` },
      alternates: { canonical: `https://nightflow.kr/flags/${id}` },
    };
  }

  // "서울 어디든" 같은 광역 표기는 공유 미리보기에서 "서울"로 축약
  const rawArea = puzzle.area || "서울";
  const area = /어디든/.test(rawArea) ? "서울" : rawArea;
  const eventDate = puzzle.event_date
    ? new Date(puzzle.event_date).toLocaleDateString("ko-KR", {
        month: "numeric",
        day: "numeric",
        weekday: "short",
      })
    : "";
  const totalBudget =
    puzzle.total_budget ??
    (puzzle.budget_per_person
      ? puzzle.budget_per_person * (puzzle.target_count ?? 1)
      : null);
  const perPerson =
    puzzle.budget_per_person ??
    (totalBudget && puzzle.target_count ? Math.round(totalBudget / puzzle.target_count) : null);

  let title: string;
  let description: string;
  if (puzzle.is_recruiting_party) {
    // 조각: 인앱 카톡 공유 카드와 동일한 톤
    title = `${eventDate ? `${eventDate} ` : ""}${area} 테이블 같이 갈래?`;
    description = perPerson
      ? `인당 ${perPerson.toLocaleString()}원 · 파티원 찾는 중 🔥`
      : "파티원 찾는 중 🔥";
  } else {
    const budgetText = totalBudget ? `총 ${Math.round(totalBudget / 10000)}만원` : "";
    const countText = puzzle.target_count ? `${puzzle.target_count}명` : "";
    title = `나플 깃발 · ${area}${eventDate ? ` · ${eventDate}` : ""}`;
    description = [budgetText, countText].filter(Boolean).join(" · ");
  }

  // 조각은 정적 조각 카드 이미지(1200x630 사전 합성), 깃발은 기존 정적 이미지
  const ogImage = puzzle.is_recruiting_party
    ? "https://nightflow.kr/og-jogak-card.jpg"
    : "/og-flag-moon.png";

  return {
    title,
    description,
    keywords: [
      "깃발",
      "클럽 깃발",
      "클럽 파티",
      "클럽 파티모임",
      "클럽 합석",
      "클럽 일행",
      "클럽 일행 구하기",
      `${area} 클럽 파티`,
      `${area} 클럽 합석`,
      `${area} 클럽 일행`,
      `${area} 클럽 깃발`,
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
          url: ogImage,
          width: 1200,
          height: 630,
          type: "image/png",
          alt: `${area} 클럽 ${puzzle.is_recruiting_party ? "파티" : "깃발"} - 나이트플로우`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function PuzzleDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user: authUser } } = await supabase.auth.getUser();

  // puzzle 먼저 받아서 leader_id 확보 (generateMetadata와 캐시 공유 → DB 왕복 1회)
  const puzzle = await getPuzzle(id);

  if (!puzzle) {
    // 미인증 사용자가 RLS로 막힌 경우 → 로그인 후 돌아오도록
    if (!authUser) redirect(`/login?redirect=${encodeURIComponent(`/flags/${id}`)}`);
    notFound();
  }

  // 나머지 3쿼리는 병렬 실행 (puzzle에 의존)
  // 상담 횟수(consultation_count)는 리더 정보 시트에서만 쓰이므로 크리티컬 패스에서 제외 →
  // 클라이언트에서 시트 열 때 지연 조회 (PuzzleDetailClient). SSR blocking 쿼리 4→3.
  const [{ data: leader }, { data: members }, { data: profile }] = await Promise.all([
    // 공개 뷰 사용 + 실제로 화면에 쓰는 컬럼만 조회.
    // (기존엔 phone/실명/strike_count 등을 select 해놓고 쓰지 않아, 깃발 상세를 여는
    //  모든 사람에게 방장 전화번호가 서버 응답으로 나가고 있었다.)
    supabase
      .from("public_user_profiles")
      .select("id, display_name, profile_image, deal_count_total, deal_amount_total, created_at, gender, last_seen_at")
      .eq("id", puzzle.leader_id)
      .maybeSingle(),
    supabase
      .from("puzzle_members")
      .select(`
        *,
        user:public_user_profiles!puzzle_members_user_id_fkey(id, display_name, profile_image)
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
          name: null, // 실명은 클라이언트로 내려보내지 않음 (표시는 display_name)
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

  // admin 전용 방장 상세 — 실명/전화번호/스트라이크는 admin 모니터링 패널에서만 쓴다.
  // 일반 조회(위 leader)는 공개 뷰라 이 컬럼들이 없으므로, admin일 때만 users를 직접 읽는다.
  // ("Admin can read all users" 정책으로 통과. 비admin은 여기 진입 자체를 안 한다.)
  let adminLeader: PuzzleLeaderInfo | null = null;
  if (profile?.role === "admin" && leader) {
    const [{ data: lastSignInAt }, { data: full }] = await Promise.all([
      supabase.rpc("admin_get_user_last_sign_in_at", { p_user_id: leader.id }),
      supabase
        .from("users")
        .select(
          "id, name, display_name, profile_image, phone, instagram, role, strike_count, is_blocked, last_seen_at, alimtalk_consent, alimtalk_consent_at"
        )
        .eq("id", puzzle.leader_id)
        .maybeSingle(),
    ]);
    if (full) {
      adminLeader = {
        ...(full as Omit<PuzzleLeaderInfo, "last_sign_in_at">),
        last_sign_in_at: (lastSignInAt as string | null) ?? null,
      };
    }
  }

  return (
    <PuzzleDetailClient
      puzzle={puzzleWithLeader}
      members={members || []}
      currentUserId={authUser?.id}
      userRole={profile?.role as "user" | "md" | "admin" | undefined}
      leader={adminLeader}
      currentUserKakaoUrl={profile?.kakao_open_chat_url ?? null}
    />
  );
}
