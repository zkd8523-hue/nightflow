"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PublicProfileView } from "./PublicProfileView";

type ClubLite = {
  id: string;
  name: string;
  area: string | null;
  thumbnail_url: string | null;
};

interface Props {
  userId: string;
}

/**
 * MY 탭 상단에 끼워 넣는 내 공개 프로필.
 * /u/[userId] 서버 페이지와 **완전히 같은 데이터**를 클라이언트에서 조회해
 * PublicProfileView를 그대로 렌더한다 (요약본 아님).
 * MY(/profile)가 클라이언트 페이지라 서버 fetch를 쓸 수 없어 이 래퍼가 필요하다.
 */
export function MyProfileSection({ userId }: Props) {
  const [state, setState] = useState<{
    profile: Parameters<typeof PublicProfileView>[0]["profile"];
    reviewCount: number;
    pinnedClubs: Parameters<typeof PublicProfileView>[0]["pinnedClubs"];
    partnerClubs: ClubLite[];
    partnerReviews: NonNullable<Parameters<typeof PublicProfileView>[0]["partnerReviews"]>;
    partyReputation: NonNullable<Parameters<typeof PublicProfileView>[0]["partyReputation"]>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [
        { data: profile },
        { count: reviewCount },
        { data: pinnedRows },
        { data: partnerships },
        { data: receivedReviews },
        { data: partyReputation },
      ] = await Promise.all([
        supabase
          .from("users")
          .select(
            "id, display_name, profile_image, bio, created_at, role, md_unique_slug, md_status, instagram, preferred_music_genres, preferred_areas, kakao_open_chat_url, contact_public, md_avg_rating, md_review_count"
          )
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("club_word_clouds")
          .select("id", { count: "exact", head: true })
          .eq("author_id", userId),
        supabase
          .from("user_pinned_clubs")
          .select("id, club_id, sort_order")
          .eq("user_id", userId)
          .order("sort_order", { ascending: true })
          .limit(3),
        supabase
          .from("club_partners")
          .select("club:clubs(id, name, area, thumbnail_url)")
          .eq("md_id", userId),
        supabase.rpc("get_md_reviews", { p_md_id: userId, p_limit: 20, p_offset: 0 }),
        supabase.rpc("get_party_reputation", { p_user_id: userId }),
      ]);

      if (cancelled || !profile) return;

      // 선호 클럽 — club 정보는 별도 조회 (JOIN 실패 시에도 thumbnail_url 보장)
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

      if (cancelled) return;
      setState({
        profile: profile as never,
        reviewCount: reviewCount ?? 0,
        pinnedClubs: pinnedClubs as never,
        partnerClubs,
        partnerReviews: (receivedReviews ?? []) as never,
        partyReputation: (partyReputation ?? []) as never,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!state) {
    // 로드 전 자리 유지 — 아래 MY 내용이 위로 튀었다가 밀리는 것 방지
    return <div className="h-64" aria-hidden="true" />;
  }

  return (
    <PublicProfileView
      profile={state.profile}
      reviewCount={state.reviewCount}
      pinnedClubs={state.pinnedClubs}
      partnerClubs={state.partnerClubs}
      partnerReviews={state.partnerReviews}
      partyReputation={state.partyReputation}
      isMe
      embedded
    />
  );
}
