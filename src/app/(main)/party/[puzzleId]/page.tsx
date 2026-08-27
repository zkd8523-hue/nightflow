import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PartyChatRoom } from "@/components/messages/PartyChatRoom";
import type { PartyParticipant, PartyRoom } from "@/types/database";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "파티 채팅방",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ puzzleId: string }>;
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  profile_image: string | null;
  /** 방장이 MD면 참여자 목록에서 "파트너" + 클럽명으로 표시한다 */
  role?: string | null;
  /** Migration 594/595: 성별·연령 제한 파티에서 참여자끼리 서로 공개 */
  gender: 'male' | 'female' | null;
  age: number | null;
}

interface MemberRow {
  user_id: string;
  guest_count: number;
  user: ProfileRow | ProfileRow[] | null;
}

function pickUser<T>(u: T | T[] | null | undefined): T | null {
  if (!u) return null;
  return Array.isArray(u) ? u[0] ?? null : u;
}

export default async function PartyChatPage({ params }: PageProps) {
  const { puzzleId } = await params;
  const supabase = await createClient();

  // 오퍼 채팅 킬스위치와 동일 게이트 재사용 (조각 단체채팅도 인앱 채팅 기능군)
  const { data: flag } = await supabase
    .from("app_settings")
    .select("bool_value")
    .eq("key", "offer_chat_enabled")
    .maybeSingle();
  if (!flag?.bool_value) redirect("/");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/party/${puzzleId}`);

  // 본인 프로필의 연락처 필드 — 연락처 남기기 기능용 (DM·MessageRoom과 동일 패턴)
  const { data: myContact } = await supabase
    .from("users")
    .select("instagram, phone, kakao_open_chat_url, preferred_contact_methods")
    .eq("id", user.id)
    .maybeSingle();

  const { data: puzzle } = await supabase
    .from("puzzles")
    .select(
      "id, leader_id, status, area, event_date, target_count, current_count, budget_per_person, total_budget, is_recruiting_party, club:clubs(name), leader:public_user_profiles!puzzles_leader_id_fkey(id, display_name, profile_image, gender, age, role)"
    )
    .eq("id", puzzleId)
    .maybeSingle();

  if (!puzzle) notFound();
  if (!puzzle.is_recruiting_party) redirect(`/flags/${puzzleId}`); // 파티(파티)만 단체채팅

  const { data: memberRows } = await supabase
    .from("puzzle_members")
    .select(
      "user_id, guest_count, user:public_user_profiles!puzzle_members_user_id_fkey(id, display_name, profile_image, gender, age)"
    )
    .eq("puzzle_id", puzzleId);

  const members = (memberRows ?? []) as MemberRow[];

  // 초대된 파트너(MD) 전원 — ⚠️ maybeSingle() 금지: 2명 이상이면 PGRST116으로
  // 페이지 전체가 죽는다 (Migration 589부터 다중 파트너 초대 가능).
  const { data: partyMdRows } = await supabase
    .from("puzzle_party_md")
    .select("md_id, offer_id, consented_at, invited_at, md:public_user_profiles!puzzle_party_md_md_id_fkey(id, display_name, profile_image)")
    .eq("puzzle_id", puzzleId)
    .order("invited_at", { ascending: true });
  const partyMds = partyMdRows ?? [];

  const isLeader = puzzle.leader_id === user.id;
  const isMember = members.some((m) => m.user_id === user.id);
  const myMdRow = partyMds.find((r) => r.md_id === user.id) ?? null;
  const isInvitedMd = !!myMdRow;
  if (!isLeader && !isMember && !isInvitedMd) redirect(`/flags/${puzzleId}`); // 참여자 아님 → 상세로

  // 파트너의 클럽명 — 초대 오퍼 기준, 한 번에 일괄 조회 (건당 쿼리 방지)
  const offerIds = partyMds.map((r) => r.offer_id).filter((id): id is string => !!id);
  const clubByOfferId = new Map<string, string | null>();
  if (offerIds.length > 0) {
    const { data: offerRows } = await supabase
      .from("puzzle_offers")
      .select("id, club:clubs(name)")
      .in("id", offerIds);
    for (const o of offerRows ?? []) {
      const club = Array.isArray(o.club) ? o.club[0] : o.club;
      clubByOfferId.set(o.id, (club as { name?: string } | null)?.name ?? null);
    }
  }

  // 같은 클럽이 2개 이상이면 초대 순서로 번호를 붙인다 ("버뮤다 1", "버뮤다 2")
  const clubNameCounts = new Map<string, number>();
  for (const r of partyMds) {
    const name = r.offer_id ? clubByOfferId.get(r.offer_id) ?? null : null;
    if (name) clubNameCounts.set(name, (clubNameCounts.get(name) ?? 0) + 1);
  }
  const clubNameSeen = new Map<string, number>();
  const rooms: PartyRoom[] = partyMds.map((r) => {
    const mdProfile = pickUser(
      (r as { md?: { id: string; display_name: string | null; profile_image: string | null } | { id: string; display_name: string | null; profile_image: string | null }[] }).md ?? null
    );
    const clubName = r.offer_id ? clubByOfferId.get(r.offer_id) ?? null : null;
    let chipLabel = clubName ?? "파트너";
    if (clubName && (clubNameCounts.get(clubName) ?? 0) > 1) {
      const idx = (clubNameSeen.get(clubName) ?? 0) + 1;
      clubNameSeen.set(clubName, idx);
      chipLabel = `${clubName} ${idx}`;
    }
    return {
      mdId: r.md_id,
      chipLabel,
      clubName,
      displayName: mdProfile?.display_name ?? null,
      profileImage: mdProfile?.profile_image ?? null,
      consented: !!r.consented_at,
    };
  });

  const leader = pickUser(
    (puzzle as { leader?: MemberRow["user"] }).leader ?? null
  );

  // MD 직통 조각은 방장이 곧 파트너(MD)다 — 헤더 제목과 참여자 라벨 모두
  // 지역("홍대")이 아니라 클럽명을 써야 어느 방인지 알아볼 수 있다.
  const puzzleClub = pickUser(
    (puzzle as { club?: { name: string } | { name: string }[] | null }).club ?? null
  );
  const clubName = puzzleClub?.name ?? null;
  const leaderIsMd = leader?.role === "md";

  // 방장도 puzzle_members에 포함됨(PuzzleForm) → 멤버 목록 기준으로 구성 + 중복 제거.
  const participants: PartyParticipant[] = [];
  const seen = new Set<string>();
  for (const m of members) {
    if (seen.has(m.user_id)) continue;
    seen.add(m.user_id);
    const u = pickUser(m.user);
    const rowIsLeader = m.user_id === puzzle.leader_id;
    participants.push({
      id: m.user_id,
      display_name: u?.display_name ?? null,
      profile_image: u?.profile_image ?? null,
      is_leader: rowIsLeader,
      guest_count: m.guest_count ?? 0,
      gender: u?.gender ?? null,
      age: u?.age ?? null,
      ...(rowIsLeader && leaderIsMd ? { is_md: true, club_name: clubName } : {}),
    });
  }
  // 방장이 멤버 목록에 없으면 보강
  if (!seen.has(puzzle.leader_id)) {
    participants.unshift({
      id: puzzle.leader_id,
      display_name: leader?.display_name ?? null,
      profile_image: leader?.profile_image ?? null,
      is_leader: true,
      guest_count: 0,
      gender: leader?.gender ?? null,
      age: leader?.age ?? null,
      ...(leaderIsMd ? { is_md: true, club_name: clubName } : {}),
    });
  }
  // 초대된 파트너 전원 추가.
  // ⚠️ 파트너 본인이 보는 화면엔 "자기 자신"만 MD로 노출한다 — 다른 파트너가
  // participants 배열에 실려 나가면 그 존재가 새어나간다(격리 원칙 위반).
  // 칩 UI에 내려줄 목록도 동일한 필터를 쓴다.
  const visibleRooms = isInvitedMd ? rooms.filter((r) => r.mdId === user.id) : rooms;
  for (const r of visibleRooms) {
    if (seen.has(r.mdId)) continue;
    seen.add(r.mdId);
    participants.push({
      id: r.mdId,
      display_name: r.displayName,
      profile_image: r.profileImage,
      is_leader: false,
      guest_count: 0,
      is_md: true,
      club_name: r.clubName,
    });
  }
  // 정렬: 방장 → MD → 일반 멤버
  const rank = (p: PartyParticipant) => (p.is_leader ? 0 : p.is_md ? 1 : 2);
  participants.sort((a, b) => rank(a) - rank(b));

  // 파트너 본인의 동의 여부 (입장 시 동의 모달 게이트)
  const mdConsented = !!myMdRow?.consented_at;

  const me = participants.find((p) => p.id === user.id) ?? {
    id: user.id,
    display_name: null,
    profile_image: null,
    is_leader: isLeader,
    guest_count: 0,
  };

  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  const ev = puzzle.event_date ? new Date(puzzle.event_date) : null;
  const dateLabel = ev ? `${ev.getMonth() + 1}/${ev.getDate()}(${WD[ev.getDay()]})` : "";
  const perPerson =
    puzzle.budget_per_person ??
    (puzzle.target_count ? Math.round((puzzle.total_budget ?? 0) / puzzle.target_count) : 0);

  return (
    <PartyChatRoom
      puzzleId={puzzle.id}
      me={{
        id: me.id,
        display_name: me.display_name,
        profile_image: me.profile_image,
        instagram: myContact?.instagram,
        phone: myContact?.phone,
        kakao_open_chat_url: myContact?.kakao_open_chat_url,
        preferred_contact_methods: myContact?.preferred_contact_methods,
      }}
      isLeader={isLeader}
      isMd={isInvitedMd}
      myMdId={isInvitedMd ? user.id : null}
      mdConsented={mdConsented}
      puzzleStatus={puzzle.status}
      partyInfo={{
        dateLabel,
        area: puzzle.area,
        clubName,
        perPerson,
        currentCount: puzzle.current_count,
        targetCount: puzzle.target_count,
      }}
      participants={participants}
      rooms={visibleRooms}
    />
  );
}
