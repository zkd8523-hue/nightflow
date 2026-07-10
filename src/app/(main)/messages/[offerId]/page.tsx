import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { MessageRoom } from "@/components/messages/MessageRoom";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "대화",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ offerId: string }>;
}

interface PuzzleRel {
  id: string;
  leader_id: string;
  status: string;
  area: string;
  event_date: string;
  target_count: number;
  current_count: number;
  total_budget: number | null;
  budget_per_person: number | null;
  is_recruiting_party: boolean | null;
}

export default async function OfferChatPage({ params }: PageProps) {
  const { offerId } = await params;
  const supabase = await createClient();

  // Kill Switch — 꺼져 있으면 기능 없음
  const { data: flag } = await supabase
    .from("app_settings")
    .select("bool_value")
    .eq("key", "offer_chat_enabled")
    .maybeSingle();
  if (!flag?.bool_value) redirect("/");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/messages/${offerId}`);

  const { data: offer } = await supabase
    .from("puzzle_offers")
    .select(
      "id, md_id, club_id, table_type, proposed_price, includes, status, md_contact_unlocked_at, puzzle:puzzles!puzzle_offers_puzzle_id_fkey(id, leader_id, status, area, event_date, target_count, current_count, total_budget, budget_per_person, is_recruiting_party)"
    )
    .eq("id", offerId)
    .maybeSingle();

  if (!offer) notFound();

  const puzzle = (
    Array.isArray(offer.puzzle) ? offer.puzzle[0] : offer.puzzle
  ) as PuzzleRel | undefined;
  if (!puzzle) notFound();

  // 조각(파티)은 1:1 오퍼 채팅 폐지 → 단체채팅으로 통합. 옛 링크는 단체방으로.
  if (puzzle.is_recruiting_party) redirect(`/party/${puzzle.id}`);

  const isLeader = puzzle.leader_id === user.id;
  const isMd = offer.md_id === user.id;
  if (!isLeader && !isMd) notFound(); // 참여자 아님

  const myRole: "leader" | "md" = isLeader ? "leader" : "md";
  const counterpartId = isLeader ? offer.md_id : puzzle.leader_id;

  const [{ data: meProfile }, { data: cpProfile }] = await Promise.all([
    // 본인 프로필은 public_user_profiles 뷰(role='md'만 연락처 노출) 대신 users 테이블에서
    // 직접 조회 — RLS "본인 행은 전체 조회 가능" 정책으로 role 마스킹 없이 연락처를 가져옴.
    // (연락처 첨부 기능이 role='md'가 아닌 계정에서도 본인이 등록한 값이면 동작해야 함)
    supabase
      .from("users")
      .select("id, display_name, profile_image, instagram, phone, kakao_open_chat_url, preferred_contact_methods")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("public_user_profiles")
      .select("id, display_name, profile_image, deal_count_total, deal_amount_total")
      .eq("id", counterpartId)
      .maybeSingle(),
  ]);

  // 오퍼가 제안한 클럽명·주소 (오퍼 요약 바 표시 + "주소 보내기" 카드용)
  let clubName: string | null = null;
  let clubAddress: string | null = null;
  if (offer.club_id) {
    const { data: club } = await supabase
      .from("clubs")
      .select("name, address")
      .eq("id", offer.club_id)
      .maybeSingle();
    clubName = club?.name ?? null;
    clubAddress = club?.address ?? null;
  }

  // 깃발 정보 (날짜·인원·금액)
  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  const ev = puzzle.event_date ? new Date(puzzle.event_date) : null;
  const dateLabel = ev
    ? `${ev.getMonth() + 1}/${ev.getDate()}(${WD[ev.getDay()]})`
    : "";
  const budget =
    puzzle.total_budget ??
    (puzzle.budget_per_person ?? 0) * (puzzle.target_count ?? 1);
  const budgetText = budget ? `${Math.round(budget / 10000)}만원` : "";
  const perPerson =
    puzzle.budget_per_person ??
    (puzzle.target_count ? Math.round((puzzle.total_budget ?? 0) / puzzle.target_count) : 0);

  return (
    <MessageRoom
      offerId={offerId}
      me={
        meProfile ?? { id: user.id, display_name: null, profile_image: null }
      }
      myRole={myRole}
      counterpart={
        cpProfile ?? {
          id: counterpartId,
          display_name: null,
          profile_image: null,
        }
      }
      puzzleStatus={puzzle.status}
      offerStatus={offer.status as string}
      mdContactUnlocked={!!offer.md_contact_unlocked_at}
      puzzleId={puzzle.id}
      puzzleInfo={{
        dateLabel,
        area: puzzle.area,
        targetCount: puzzle.target_count,
        currentCount: puzzle.current_count,
        perPerson,
        budgetText,
        isRecruitingParty: !!puzzle.is_recruiting_party,
      }}
      offerSummary={{
        clubName,
        clubAddress,
        tableType: offer.table_type as string,
        price: offer.proposed_price as number,
        includes: (offer.includes as string[]) ?? [],
      }}
    />
  );
}
