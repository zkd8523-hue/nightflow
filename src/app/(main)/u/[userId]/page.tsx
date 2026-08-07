import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PublicProfileView } from "@/components/profile/PublicProfileView";

interface PageProps {
  params: Promise<{ userId: string }>;
}

// ── SEO ──────────────────────────────────────────────────────────────────────
// 검색 수요는 "닉네임"보다 "클럽명 + 파트너/MD"에 있다(그 클럽 가려고 담당자를 찾는 의도).
// 그래서 소속 클럽명을 title에 싣는다. 일반 유저 프로필은 내용이 얇고 검색 수요도 없어
// noindex 처리한다(사이트맵에도 승인 파트너만 싣는다).
const getProfileMeta = cache(async (userId: string) => {
  const supabase = await createClient();
  const [{ data: profile }, { data: partnerships }] = await Promise.all([
    supabase
      .from("public_user_profiles")
      .select("display_name, bio, md_status, md_unique_slug, profile_image")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("club_partners")
      .select("club:clubs(name, area)")
      .eq("md_id", userId),
  ]);
  return { profile, partnerships };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { userId } = await params;
  const { profile, partnerships } = await getProfileMeta(userId);

  if (!profile) return { title: "프로필" };

  const name = profile.display_name || "회원";
  const isPartner = profile.md_status === "approved" && !!profile.md_unique_slug;

  if (!isPartner) {
    // 일반 유저: 검색 노출 대상 아님 (얇은 콘텐츠 + 닉네임 노출 최소화)
    return {
      title: `${name} | 나플`,
      robots: { index: false, follow: true },
    };
  }

  const clubs: Array<{ name: string; area: string | null }> = [];
  for (const row of (partnerships ?? []) as Array<{
    club: { name: string; area: string | null } | { name: string; area: string | null }[] | null;
  }>) {
    const c = Array.isArray(row.club) ? row.club[0] : row.club;
    if (c?.name) clubs.push(c);
  }

  // title이 길면 검색결과에서 잘리므로 클럽은 2곳까지만
  const clubNames = clubs.slice(0, 2).map((c) => c.name).join("·");
  const area = clubs.find((c) => c.area)?.area ?? null;

  // 서비스 용어는 "파트너"지만 검색어는 "MD"다("OO클럽 MD"로 찾지 "OO클럽 파트너"로 안 찾음).
  // 가중치 높은 title 앞쪽에 "클럽명 + MD"를 두고, 브랜드 용어 "파트너"는 뒤쪽·본문에 남긴다.
  const title = clubNames
    ? `${name} - ${clubNames} MD | ${area ? `${area} ` : ""}클럽 파트너·테이블 예약`
    : `${name} - ${area ? `${area} ` : ""}클럽 MD·파트너 | 테이블 예약`;

  const description = clubNames
    ? `${name} - ${clubNames}${area ? ` (${area})` : ""} 클럽 MD. 나이트플로우 공식 파트너로 테이블·게스트 문의를 받습니다. 원하는 예산으로 깃발 꽂으면 조건을 제안받을 수 있어요.`
    : `${name} - ${area ? `${area} ` : ""}클럽 MD. 나이트플로우 공식 파트너로 테이블·게스트 문의를 받습니다. 원하는 예산으로 깃발 꽂으면 조건을 제안받을 수 있어요.`;

  const url = `https://nightflow.kr/u/${userId}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "profile",
      ...(profile.profile_image ? { images: [{ url: profile.profile_image }] } : {}),
    },
  };
}

type ClubLite = {
  id: string;
  name: string;
  area: string | null;
  thumbnail_url: string | null;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// 공개 프로필 노출용 좋아하는 클럽 (최대 3개, sort_order 순)
// user_favorite_clubs(찜 기능)와 다른 user_pinned_clubs 사용.
// pinnedRows → clubsData 내부 의존이 있어 하나의 헬퍼로 묶어 병렬 발사 가능하게 함.
async function fetchPinnedClubs(
  supabase: SupabaseServerClient,
  userId: string
) {
  const { data: pinnedRows } = await supabase
    .from("user_pinned_clubs")
    .select("id, club_id, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .limit(3);

  // 클럽 정보 별도 fetch (JOIN 실패 시에도 thumbnail_url 보장)
  const clubIds = (pinnedRows ?? []).map((r) => r.club_id);
  const { data: clubsData } = clubIds.length
    ? await supabase
        .from("clubs")
        .select("id, name, area, thumbnail_url")
        .in("id", clubIds)
    : { data: [] };

  const clubMap = new Map((clubsData ?? []).map((c) => [c.id, c]));
  return (pinnedRows ?? []).map((r) => ({
    id: r.id,
    club_id: r.club_id,
    sort_order: r.sort_order,
    club: clubMap.get(r.club_id) ?? null,
  }));
}

export default async function PublicProfilePage({ params }: PageProps) {
  const { userId } = await params;
  const supabase = await createClient();

  // 서로 독립적인 쿼리들을 병렬 발사 (직렬 RTT 누적 방지).
  // partnerships는 MD가 아니면 결과를 폐기하지만, club_partners는 md_id 인덱스
  // 조회로 비용이 작아 모든 경로를 동일한 RTT로 통일하는 편이 빠름.
  const [
    { data: profile, error },
    { count: reviewCount },
    pinnedClubs,
    {
      data: { user: authUser },
    },
    { data: partnerships },
    { data: receivedReviews },
    { data: partyReputation },
  ] = await Promise.all([
    // 프로필 조회 (공개 뷰 — 실명/전화번호 등 비공개 컬럼 원천 차단)
    supabase
      .from("public_user_profiles")
      .select(
        "id, display_name, profile_image, bio, created_at, role, md_unique_slug, md_status, instagram, preferred_music_genres, preferred_areas, kakao_open_chat_url, contact_public, md_avg_rating, md_review_count"
      )
      .eq("id", userId)
      .maybeSingle(),
    // 작성한 리뷰 수 (5자 리뷰 워드클라우드 기준)
    supabase
      .from("club_word_clouds")
      .select("id", { count: "exact", head: true })
      .eq("author_id", userId),
    fetchPinnedClubs(supabase, userId),
    // 본인 여부 판단용 현재 사용자
    supabase.auth.getUser(),
    // MD 소속 클럽 (club_partners N:N) — 승인 MD일 때만 사용
    supabase
      .from("club_partners")
      .select("club:clubs(id, name, area, thumbnail_url)")
      .eq("md_id", userId),
    // 파트너가 받은 리뷰 (approved만) — /md 통합. get_md_reviews가 승인 리뷰만 반환.
    supabase.rpc("get_md_reviews", { p_md_id: userId, p_limit: 20, p_offset: 0 }),
    // 파티 평판 (받은 👍 + 태그 집계) — 조각 참가자 상호리뷰
    supabase.rpc("get_party_reputation", { p_user_id: userId }),
  ]);

  if (error || !profile) {
    notFound();
  }

  // MD 소속 클럽 (승인된 MD만)
  const partnerClubs: ClubLite[] = [];
  if (profile.md_status === "approved") {
    for (const row of (partnerships ?? []) as Array<{
      club: ClubLite | ClubLite[] | null;
    }>) {
      const c = Array.isArray(row.club) ? row.club[0] : row.club;
      if (c) partnerClubs.push(c);
    }
  }

  const isMe = authUser?.id === userId;

  return (
    <PublicProfileView
      profile={profile}
      reviewCount={reviewCount ?? 0}
      pinnedClubs={(pinnedClubs ?? []) as never}
      partnerClubs={partnerClubs}
      partnerReviews={(receivedReviews ?? []) as never}
      partyReputation={(partyReputation ?? []) as never}
      isMe={isMe}
    />
  );
}
