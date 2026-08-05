import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PartyChatRoom } from "@/components/messages/PartyChatRoom";
import type { PartyParticipant } from "@/types/database";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "파티 채팅방",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ puzzleId: string }>;
}

interface MemberRow {
  user_id: string;
  guest_count: number;
  user:
    | { id: string; display_name: string | null; profile_image: string | null }
    | { id: string; display_name: string | null; profile_image: string | null }[]
    | null;
}

function pickUser(u: MemberRow["user"]) {
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

  const { data: puzzle } = await supabase
    .from("puzzles")
    .select(
      "id, leader_id, status, area, event_date, target_count, current_count, budget_per_person, total_budget, is_recruiting_party, leader:public_user_profiles!puzzles_leader_id_fkey(id, display_name, profile_image)"
    )
    .eq("id", puzzleId)
    .maybeSingle();

  if (!puzzle) notFound();
  if (!puzzle.is_recruiting_party) redirect(`/flags/${puzzleId}`); // 파티(파티)만 단체채팅

  const { data: memberRows } = await supabase
    .from("puzzle_members")
    .select(
      "user_id, guest_count, user:public_user_profiles!puzzle_members_user_id_fkey(id, display_name, profile_image)"
    )
    .eq("puzzle_id", puzzleId);

  const members = (memberRows ?? []) as MemberRow[];

  // 초대된 MD (조각당 1명)
  const { data: partyMd } = await supabase
    .from("puzzle_party_md")
    .select("md_id, offer_id, consented_at, md:public_user_profiles!puzzle_party_md_md_id_fkey(id, display_name, profile_image)")
    .eq("puzzle_id", puzzleId)
    .maybeSingle();
  const invitedMdId = partyMd?.md_id ?? null;
  // MD가 아직 상담(크레딧 사용)에 동의하지 않았으면 입장 시 동의 모달 노출
  const mdConsented = !!(partyMd as { consented_at?: string | null } | null)?.consented_at;

  // MD의 클럽명 (초대 오퍼 기준)
  let invitedMdClub: string | null = null;
  if (partyMd?.offer_id) {
    const { data: off } = await supabase
      .from("puzzle_offers")
      .select("club:clubs(name)")
      .eq("id", partyMd.offer_id)
      .maybeSingle();
    const club = off ? (Array.isArray(off.club) ? off.club[0] : off.club) : null;
    invitedMdClub = (club as { name?: string } | null)?.name ?? null;
  }

  const isLeader = puzzle.leader_id === user.id;
  const isMember = members.some((m) => m.user_id === user.id);
  const isInvitedMd = invitedMdId === user.id;
  if (!isLeader && !isMember && !isInvitedMd) redirect(`/flags/${puzzleId}`); // 참여자 아님 → 상세로

  const leader = pickUser(
    (puzzle as { leader?: MemberRow["user"] }).leader ?? null
  );

  // 방장도 puzzle_members에 포함됨(PuzzleForm) → 멤버 목록 기준으로 구성 + 중복 제거.
  const participants: PartyParticipant[] = [];
  const seen = new Set<string>();
  for (const m of members) {
    if (seen.has(m.user_id)) continue;
    seen.add(m.user_id);
    const u = pickUser(m.user);
    participants.push({
      id: m.user_id,
      display_name: u?.display_name ?? null,
      profile_image: u?.profile_image ?? null,
      is_leader: m.user_id === puzzle.leader_id,
      guest_count: m.guest_count ?? 0,
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
    });
  }
  // 초대된 MD 추가
  if (invitedMdId && !seen.has(invitedMdId)) {
    const mdProfile = pickUser((partyMd as { md?: MemberRow["user"] }).md ?? null);
    participants.push({
      id: invitedMdId,
      display_name: mdProfile?.display_name ?? null,
      profile_image: mdProfile?.profile_image ?? null,
      is_leader: false,
      guest_count: 0,
      is_md: true,
      club_name: invitedMdClub,
    });
  }
  // 정렬: 방장 → MD → 일반 멤버
  const rank = (p: PartyParticipant) => (p.is_leader ? 0 : p.is_md ? 1 : 2);
  participants.sort((a, b) => rank(a) - rank(b));

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
      me={{ id: me.id, display_name: me.display_name, profile_image: me.profile_image }}
      isLeader={isLeader}
      isMd={isInvitedMd}
      mdConsented={mdConsented}
      puzzleStatus={puzzle.status}
      partyInfo={{
        dateLabel,
        area: puzzle.area,
        perPerson,
        currentCount: puzzle.current_count,
        targetCount: puzzle.target_count,
      }}
      participants={participants}
    />
  );
}
