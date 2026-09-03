// Migration 550 뷰 4종의 반환 형태.

export interface PartyOverview {
  total_parties: number;
  md_hosted: number;
  user_hosted: number;
  auto_published: number;
  open_count: number;
  selecting_count: number;
  matched_count: number;
  cancelled_count: number;
  expired_count: number;
  parties_with_joiner: number;
  parties_empty: number;
  join_rate: number | null;
  match_rate: number | null;
  churn_rate: number | null;
  clubs_covered: number;
  distinct_hosts: number;
}

export interface PartyWeeklyRow {
  week_start: string;
  published: number;
  auto_published: number;
  with_joiner: number;
  total_joiners: number;
  matched: number;
  still_live: number;
  churned: number;
  join_rate: number | null;
  clubs: number;
}

export interface PartyByClubRow {
  club_id: string | null;
  club_name: string | null;
  area: string;
  published: number;
  auto_published: number;
  with_joiner: number;
  total_joiners: number;
  matched: number;
  join_rate: number | null;
  avg_budget: number | null;
  first_published_at: string;
  last_published_at: string;
}

export interface PartyOfferRow {
  week_start: string;
  offers: number;
  pending: number;
  accepted: number;
  rejected: number;
  withdrawn: number;
  expired: number;
  accept_rate: number | null;
  expire_rate: number | null;
  parties_with_offer: number;
  mds_offering: number;
}

// admin_get_club_party_members RPC (Migration 556 + 628 + 629) 반환 행.
// 629부터 방장 혼자인 빈 파티는 반환되지 않는다.
export interface ClubPartyMemberRow {
  puzzle_id: string;
  puzzle_status: string;
  puzzle_created_at: string;
  event_date: string | null;
  budget_per_person: number | null;
  total_budget: number | null;
  target_count: number | null;
  current_count: number | null;
  msg_count: number;
  last_msg_at: string | null;
  last_msg_sender: string | null;
  user_id: string;
  display_name: string;
  member_status: "참여중" | "나감" | "추방됨";
  reason: string | null;
  event_at: string;
  is_leader: boolean;
}
