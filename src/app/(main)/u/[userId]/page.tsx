import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PublicProfileView } from "@/components/profile/PublicProfileView";

interface PageProps {
  params: Promise<{ userId: string }>;
}

export default async function PublicProfilePage({ params }: PageProps) {
  const { userId } = await params;
  const supabase = await createClient();

  // 프로필 조회 (공개 필드만)
  const { data: profile, error } = await supabase
    .from("users")
    .select(
      "id, display_name, profile_image, bio, created_at, role, md_unique_slug, md_status, preferred_music_genres, preferred_areas"
    )
    .eq("id", userId)
    .maybeSingle();

  if (error || !profile) {
    notFound();
  }

  // 작성한 리뷰 수 (삭제되지 않은 것만)
  const { count: reviewCount } = await supabase
    .from("club_one_liners")
    .select("id", { count: "exact", head: true })
    .eq("author_id", userId);

  // 공개 프로필 노출용 좋아하는 클럽 (최대 3개, sort_order 순)
  // user_favorite_clubs(찜 기능)와 다른 user_pinned_clubs 사용
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
  const pinnedClubs = (pinnedRows ?? []).map((r) => ({
    id: r.id,
    club_id: r.club_id,
    sort_order: r.sort_order,
    club: clubMap.get(r.club_id) ?? null,
  }));

  // 본인 여부 판단
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const isMe = authUser?.id === userId;

  return (
    <PublicProfileView
      profile={profile}
      reviewCount={reviewCount ?? 0}
      pinnedClubs={(pinnedClubs ?? []) as never}
      isMe={isMe}
    />
  );
}
