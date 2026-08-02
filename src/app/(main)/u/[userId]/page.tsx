import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PublicProfileView } from "@/components/profile/PublicProfileView";

interface PageProps {
  params: Promise<{ userId: string }>;
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
    // 프로필 조회 (공개 필드만)
    supabase
      .from("users")
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
