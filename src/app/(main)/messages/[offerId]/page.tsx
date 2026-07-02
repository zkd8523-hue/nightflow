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
      "id, md_id, club_id, table_type, proposed_price, includes, status, puzzle:puzzles!puzzle_offers_puzzle_id_fkey(id, leader_id, status, area, event_date, target_count, current_count, total_budget, budget_per_person, is_recruiting_party)"
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
    supabase
      .from("public_user_profiles")
      .select("id, display_name, profile_image")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("public_user_profiles")
      .select("id, display_name, profile_image, deal_count_total, deal_amount_total")
      .eq("id", counterpartId)
      .maybeSingle(),
  ]);

  // 오퍼가 제안한 클럽명 (오퍼 요약 바에 표시)
  let clubName: string | null = null;
  if (offer.club_id) {
    const { data: club } = await supabase
      .from("clubs")
      .select("name")
      .eq("id", offer.club_id)
      .maybeSingle();
    clubName = club?.name ?? null;
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
        tableType: offer.table_type as string,
        price: offer.proposed_price as number,
        includes: (offer.includes as string[]) ?? [],
      }}
    />
  );
}
