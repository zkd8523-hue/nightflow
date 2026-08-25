// Migration 549 뷰 3종의 반환 형태.

export interface CouponOverview {
  total_issues: number;
  active_issues: number;
  cancelled_issues: number;
  soldout_issues: number;
  expired_issues: number;
  clubs_issuing: number;
  mds_issuing: number;
  total_claims: number;
  unique_claimers: number;
  total_redeems: number;
  revoked_claims: number;
  expired_claims: number;
  redeem_rate: number | null;
  zero_claim_issues: number;
}

export interface CouponFunnelRow {
  issue_id: string;
  title: string;
  benefit_type: string;
  status: string;
  club_id: string;
  club_name: string | null;
  club_area: string | null;
  md_id: string;
  md_name: string | null;
  total_count: number | null;
  created_at: string;
  starts_at: string;
  redeem_ends_at: string;
  claims: number;
  redeems: number;
  revoked: number;
  expired_unused: number;
  claim_rate: number | null;
  redeem_rate: number | null;
  first_claim_at: string | null;
  last_claim_at: string | null;
  claim_span_hours: number | null;
  redeem_fail_total: number;
}

export interface CouponDailyRow {
  day: string;
  issues_created: number;
  claims: number;
  unique_claimers: number;
  redeems: number;
}

/** 발행물 행을 펼쳤을 때 보여줄 "누가 받았나" 목록.
 *  users 직접 조인은 RLS 락다운(533/537)으로 빈 결과라 public_user_profiles를 쓴다. */
export interface CouponClaimRow {
  id: string;
  issue_id: string;
  user_id: string;
  display_name: string | null;
  is_test: boolean;
  claimed_at: string;
  redeemed_at: string | null;
  status: string;
  redeem_nonce: string | null;
  admin_voided_at: string | null;
}
