export type UserRole = "user" | "md" | "admin";
export type ContactMethodType = "dm" | "kakao" | "phone";
export type MDStatus = "pending" | "approved" | "rejected" | "suspended" | "revoked";
export type MDSanctionAction = "warning" | "suspend" | "unsuspend" | "revoke";
export type AuctionStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "won"
  | "unsold"
  | "confirmed"
  | "cancelled"
  | "expired";
export type BidStatus = "active" | "outbid" | "won" | "cancelled";
export type Area = "강남" | "홍대" | "이태원" | "건대" | "부산" | "대구" | "인천" | "광주" | "대전" | "울산" | "세종";
export type TrustLevel = "vip" | "normal" | "caution" | "blocked";
export type ListingType = "auction" | "instant";
export type ClubStatus = "pending" | "approved" | "rejected";
export type NotificationEventType =
  | "auction_started"
  | "auction_won"
  | "visit_confirmed"
  | "outbid"
  | "closing_soon"
  | "noshow_penalty"
  | "contact_deadline_warning"
  | "fallback_won"
  | "feedback_request"
  | "md_grade_change"
  | "md_unresponsive_alert"
  | "cancellation_confirmed"
  | "md_approved";
export type NotificationStatus = "pending" | "sent" | "failed";
export type InAppNotificationType = "md_approved" | "md_rejected" | "outbid" | "auction_won" | "contact_deadline_warning" | "noshow_penalty" | "fallback_won" | "feedback_request" | "md_grade_change" | "cancellation_confirmed" | "contact_expired_no_fault" | "contact_expired_user_attempted" | "md_winner_cancelled" | "md_winner_noshow" | "md_new_bid" | "md_noshow_review" | "noshow_dismissed" | "puzzle_seat_adjusted" | "puzzle_cancelled" | "puzzle_offer_received" | "puzzle_offer_accepted" | "puzzle_offer_rejected" | "puzzle_leader_changed" | "puzzle_member_joined";
export type TableType = "Standard" | "VIP" | "Premium";

export interface TablePosition {
  id: string;
  x: number;  // 0~100 (이미지 대비 퍼센트)
  y: number;  // 0~100
  label: string;  // "B1", "V1" 등
  type: TableType;
}

export interface User {
  id: string;
  role: UserRole;
  kakao_id: string;
  /** 실명. 가입 시점엔 NULL, 첫 PASS 본인인증 시 채워짐 (Migration 114) */
  name: string | null;
  /** 경매 입찰 등 공개 노출용 닉네임. 2-16자, 대소문자 무시 유니크. (Migration 108) */
  display_name: string;
  /** 전화번호. 가입 시점엔 NULL, 첫 PASS 본인인증 시 채워짐 (Migration 114) */
  phone: string | null;
  profile_image: string | null;

  // 본인인증 (Migration 114, PortOne PASS)
  /** 본인인증 CI. 중복 가입 차단 키 (UNIQUE) */
  ci: string | null;
  /** 본인인증 DI. 가맹점 내 식별키 */
  di: string | null;
  /** 본인인증 완료 시각. NULL이면 미인증. */
  identity_verified_at: string | null;
  /** 내외국인 구분. 'LOCAL' | 'FOREIGNER' */
  nationality: "LOCAL" | "FOREIGNER" | null;

  // MD 전용
  md_status: MDStatus | null;
  md_rejection_reason: string | null;
  md_unique_slug: string | null;
  bank_account: string | null;
  bank_name: string | null;
  area: string[] | null;
  default_club_id: string | null;
  verification_club_name: string | null;
  floor_plan_url: string | null;
  instagram: string | null;
  instagram_verify_code: string | null;
  instagram_verified_at: string | null;
  kakao_talk_id: string | null;  // DB 컬럼 유지, UI에서 미사용
  kakao_open_chat_url: string | null;  // 카카오톡 오픈채팅 URL (연락 수단)
  preferred_contact_methods: ContactMethodType[] | null;  // 낙찰자에게 표시할 연락 수단. NULL=전부 표시
  business_card_url: string | null;
  table_positions: TablePosition[];
  md_welcome_shown: boolean;

  // MD 고객 등급 (Migration 051)
  md_customer_grade: MDCustomerGrade;
  md_avg_rating: number;
  md_review_count: number;
  md_response_rate: number;

  // 리뷰어 (고객용)
  review_count: number;
  is_reviewer: boolean;

  // 제재 (Model B: strike_count 사용, 나머지는 레거시)
  /** @deprecated Model A 레거시 필드 - 읽기 전용, 사용하지 마세요 */
  noshow_count: number;
  /** Model B 활성 필드 - 누진 스트라이크 (1회=3일, 2회=14일, 3회=60일, 4회=영구 차단) */
  strike_count: number;
  /** @deprecated Model A 레거시 필드 (결제 중개 폐지) - 읽기 전용, 사용하지 마세요 */
  no_pay_count: number;
  is_blocked: boolean;
  /** Model B 활성 필드 - 이용 정지 종료일 (스트라이크 제재) */
  blocked_until: string | null;
  /** Model B 활성 필드 - 마지막 스트라이크 날짜 */
  last_strike_at: string | null;
  md_suspended_until: string | null; // MD 정지 만료일
  /** @deprecated Pass 시스템 폐지 (Migration 052). DB 마이그레이션 후 제거 예정. */
  pass_expires_at: string | null;
  /** @deprecated Pass 시스템 폐지 (Migration 052). DB 마이그레이션 후 제거 예정. */
  pass_type: 'basic' | 'premium' | null;
  /** @deprecated Pass 시스템 폐지 (Migration 052). DB 마이그레이션 후 제거 예정. */
  strike_waiver_count: number;
  /** 경고 시스템 - 미소진 경고점 합계 (3점 = 1스트라이크) */
  warning_count: number;

  // 신원 정보 (Migration 114부터는 PASS 본인인증 결과로 채워짐)
  birthday: string | null;          // "YYYY-MM-DD"
  gender: "male" | "female" | null;
  age_verified_at: string | null;   // 성인 인증 완료 시각 (PASS 인증 시 갱신)

  // 알림톡
  alimtalk_consent: boolean;
  alimtalk_consent_at: string | null;

  // Referral (백그라운드 추적, 유저에게 비노출)
  referral_code: string | null;
  referred_by: string | null;
  signup_source: string | null;

  created_at: string;
  updated_at: string;
  /** 회원탈퇴 시점 (Soft Delete). null이면 활성 계정. */
  deleted_at: string | null;
}

export type PenaltyAction = 'block_3_days' | 'block_14_days' | 'block_60_days' | 'permanent_block';
export type AppealStatus = 'pending' | 'accepted' | 'rejected';

export interface NoshowHistory {
  id: string;
  user_id: string;
  auction_id: string | null;
  strike_count_at_time: number;
  penalty_action: PenaltyAction;
  blocked_until: string | null;
  created_at: string;
  // joined
  auction?: {
    id: string;
    clubs: { name: string } | null;
    event_date: string | null;
    current_bid: number;
  } | null;
  appeal?: PenaltyAppeal | null;
}

export interface PenaltyAppeal {
  id: string;
  user_id: string;
  noshow_history_id: string;
  reason: string;
  status: AppealStatus;
  admin_id: string | null;
  admin_response: string | null;
  created_at: string;
  reviewed_at: string | null;
  // joined
  noshow_history?: NoshowHistory & {
    user?: Pick<User, 'id' | 'display_name' | 'profile_image'>;
  };
}

export interface AuctionNotifySubscription {
  id: string;
  user_id: string;
  auction_id: string;
  phone: string;
  created_at: string;
}

export interface NotificationLog {
  id: string;
  event_type: NotificationEventType;
  auction_id: string;
  recipient_user_id: string | null;
  recipient_phone: string;
  template_id: string;
  solapi_message_id: string | null;
  status: NotificationStatus;
  error_message: string | null;
  created_at: string;
}

export interface Club {
  id: string;
  md_id: string | null;  // MD who owns this club
  md?: {  // Joined MD info (optional, used in Admin pages)
    id: string;
    name: string;
    phone: string;
    profile_image?: string | null;
    md_status?: string | null;
    area?: string | null;
    instagram?: string | null;
    business_card_url?: string | null;
    verification_club_name?: string | null;
    created_at?: string;
  } | null;
  name: string;
  address: string;
  address_detail: string | null;  // Floor, unit number, etc.
  postal_code: string | null;  // From Naver Maps API
  area: Area;
  latitude: number | null;  // From Naver Maps Geocoding
  longitude: number | null;  // From Naver Maps Geocoding
  phone: string | null;  // Club contact phone
  thumbnail_url: string | null;
  floor_plan_url: string | null;
  table_positions: TablePosition[];
  created_at: string;

  // Club Approval System (Migration 046)
  status: ClubStatus;
  version: number;  // Optimistic Locking
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejected_reason: string | null;
  first_approved_at: string | null;  // 최초 승인 시각
  last_approved_at: string | null;   // 마지막 승인 시각
}

export interface Auction {
  id: string;
  listing_type: ListingType;
  md_id: string;
  club_id: string;

  title: string;
  table_info: string | null;
  thumbnail_url: string | null;
  event_date: string;
  entry_time: string | null;  // HH:mm format, null = 즉시 입장
  includes: string[];
  notes: string | null;

  // 가격
  original_price: number;
  start_price: number;
  reserve_price: number;
  current_bid: number;
  bid_increment: number;

  // 경매 상태
  bid_count: number;
  bidder_count: number;
  status: AuctionStatus;

  // 시간
  auction_start_at: string;
  auction_end_at: string;
  extended_end_at: string | null;
  auto_extend_min: number;
  extension_count: number;
  max_extensions: number;
  duration_minutes: number;

  buy_now_price: number | null;

  // 낙찰
  winner_id: string | null;
  winning_price: number | null;
  won_at: string | null;
  payment_deadline: string | null;
  contact_deadline: string | null; // Model B: MD 연락 마감 시간
  contact_timer_minutes: number | null; // Model B: 적용된 타이머 분(10분 단일)
  contact_attempted_at: string | null; // 낙찰자 연락 시도 시각 (무과실 판정 근거)

  // Post-Auction Journey (Migration 051)
  confirmed_at: string | null;
  confirmed_by: string | null; // 현장 확인 처리한 MD ID
  d_day_checked_in: boolean | null; // 얼리버드 당일 방문 재확인 완료 여부
  cancel_type: CancellationType | null;
  cancel_reason: string | null;
  is_bin_win: boolean;
  fallback_from_winner_id: string | null;
  feedback_requested_at: string | null;

  // Opt-in fallback (Migration 088)
  fallback_offered_to: string | null;   // 현재 제안 받은 차순위 유저 ID
  fallback_offered_at: string | null;   // 제안 시각
  fallback_deadline: string | null;     // 수락 마감 (제안 시각 + 15분)

  chat_interest_count: number;
  view_count: number;

  created_at: string;
  updated_at: string;

  // JOIN 관계
  club?: Club;
  md?: User;
}

export interface MDVipUser {
  id: string;
  md_id: string;
  user_id: string;
  note: string | null;
  created_at: string;
  user?: UserTrustScore;
}

export interface UserTrustScore {
  id: string;
  display_name: string;
  profile_image: string | null;
  noshow_count: number;
  strike_count: number; // Model B 스트라이크
  is_blocked: boolean;
  total_bids: number;
  won_bids: number;
  win_rate: number;
  avg_bid_amount: number;
  confirmed_visits: number;
  trust_level: TrustLevel;
}

// MD 제재 이력
export interface MDSanction {
  id: string;
  md_id: string;
  admin_id: string;
  action: MDSanctionAction;
  reason: string;
  duration_days: number | null;
  suspended_until: string | null;
  active_auctions_cancelled: number;
  created_at: string;
}

// MD Health Score (Admin 모니터링)
export type MDGrade = "S" | "A" | "B" | "C" | "F" | "evaluating";
export type MDHealthStatus = "excellent" | "good" | "attention" | "critical";
export type MDCustomerGrade = "rookie" | "bronze" | "silver" | "gold" | "diamond";
export type CancellationType = "user_immediate" | "user_grace" | "user_late" | "mutual" | "noshow_auto" | "noshow_md";

export interface UserWarning {
  id: string;
  user_id: string;
  auction_id: string;
  warning_points: number;
  cancel_type: CancellationType;
  consumed_by_strike: boolean;
  created_at: string;
}

export interface MDHealthScore {
  md_id: string;
  name: string;
  area: string;
  md_status: string;
  joined_at: string;
  total_auctions: number;
  won_auctions: number;
  cancelled_auctions: number;
  recent_auctions_14d: number;
  last_auction_date: string | null;
  sell_through_rate: number;
  cancel_rate: number;
  avg_bid_ratio_pct: number;
  noshow_count: number;
  noshow_rate: number;
  confirm_rate: number;
  total_won_amount: number;
  noshow_7d: number;
  health_score: number | null;
  grade: MDGrade;
  flag_consecutive_noshow: boolean;
  flag_dormant: boolean;
}

/**
 * public_user_profiles VIEW의 반환 타입 (Migration 109).
 * 익명/일반 유저가 볼 수 있는 공개 컬럼만 포함. 실명(name), 일반 유저의 phone/생일 등은 제외.
 * MD 연락처 컬럼은 role='md' 행에서만 값이 채워지고 일반 유저 행에서는 null.
 */
export interface PublicUserProfile {
  id: string;
  display_name: string;
  profile_image: string | null;
  role: UserRole;
  md_unique_slug: string | null;
  md_customer_grade: MDCustomerGrade | null;
  is_reviewer: boolean | null;
  instagram: string | null;
  kakao_open_chat_url: string | null;
  preferred_contact_methods: ContactMethodType[] | null;
  phone: string | null;
}

export interface Bid {
  id: string;
  auction_id: string;
  bidder_id: string;
  bid_amount: number;
  status: BidStatus;
  bid_at: string;

  // JOIN: 공개 경로에서는 PublicUserProfile, MD/Admin 경로에서는 User
  bidder?: PublicUserProfile | User;
  auction?: Auction;
}

export interface PriceRecommendation {
  sufficient_data: boolean;
  total_auctions: number;
  message?: string;
  successful_auctions?: number;
  success_rate?: number;
  suggested_start_price?: number;
  avg_winning_price?: number;
  p25_winning_price?: number;
  p75_winning_price?: number;
  avg_bid_count?: number;
  fallback?: boolean;
}

export interface InAppNotification {
  id: string;
  user_id: string;
  type: InAppNotificationType;
  title: string;
  message: string;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

// ============================================
// Post-Auction Journey Types (Migration 051)
// ============================================

export interface UserFavoriteClub {
  id: string;
  user_id: string;
  club_id: string;
  created_at: string;
  club?: Club;
}

export interface UserFavoriteMd {
  id: string;
  user_id: string;
  md_id: string;
  created_at: string;
  md?: Pick<PublicUserProfile, "id" | "display_name" | "profile_image" | "md_unique_slug">;
}

export interface ChatInterest {
  id: string;
  auction_id: string;
  user_id: string;
  created_at: string;
}

export interface AuctionReview {
  id: string;
  auction_id: string;
  user_id: string;
  md_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface MDUnresponsiveReport {
  id: string;
  auction_id: string;
  reporter_id: string;
  md_id: string;
  reported_at: string;
  resolved_at: string | null;
  resolution: string | null;
}

export interface MDCustomerGradeScore {
  md_id: string;
  name: string;
  area: string | null;
  avg_rating: number;
  review_count: number;
  completed_auctions: number;
  noshow_auctions: number;
  noshow_rate: number;
  response_rate: number;
  calculated_grade: MDCustomerGrade;
}

// MD 등급 라벨/색상 매핑
export const MD_GRADE_CONFIG: Record<MDCustomerGrade, { label: string; color: string; bgColor: string }> = {
  rookie: { label: "Rookie", color: "text-gray-400", bgColor: "bg-gray-800" },
  bronze: { label: "Bronze", color: "text-amber-700", bgColor: "bg-amber-950" },
  silver: { label: "Silver", color: "text-gray-300", bgColor: "bg-gray-700" },
  gold: { label: "Gold", color: "text-yellow-400", bgColor: "bg-yellow-900" },
  diamond: { label: "Diamond", color: "text-cyan-300", bgColor: "bg-cyan-900" },
};

// ============================================
// Puzzle Types (Migration 097)
// ============================================

export type PuzzleStatus = 'open' | 'matched' | 'cancelled' | 'expired' | 'accepted';
// matched: 대표자가 수동 마감 (MD 추가 결제 차단, 홈에서 숨김)
// accepted: 오퍼 수락 완료 (V2 역경매)

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';

export type GenderPref = 'male_only' | 'female_only' | 'any';
export type AgePref = 'early_20s' | 'late_20s' | '30s' | 'any';
export type VibePref = 'chill' | 'active' | 'any';

export interface Puzzle {
  id: string;
  leader_id: string;
  leader?: Pick<User, 'id' | 'name' | 'display_name' | 'profile_image'>;
  area: Area;
  event_date: string;
  kakao_open_chat_url: string; // 방장/수락된 MD에게만 노출
  gender_pref: GenderPref;
  age_pref: AgePref;
  vibe_pref: VibePref;
  /** V1 호환 필드. 신규 퍼즐은 total_budget 사용 (null이면 이 값 사용) */
  budget_per_person: number;
  /** V2: 총액 고정 예산 (budget_per_person 대체) */
  total_budget: number | null;
  target_count: number;
  current_count: number;
  status: PuzzleStatus;
  notes: string | null;
  expires_at: string;
  accepted_offer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PuzzleOffer {
  id: string;
  puzzle_id: string;
  md_id: string;
  club_id: string | null;
  club?: Pick<Club, 'id' | 'name' | 'area'>;
  md?: Pick<User, 'id' | 'name' | 'profile_image'>;
  table_type: TableType;
  /** 방장 + 해당 MD만 열람 가능 */
  proposed_price: number;
  /** 방장 + 해당 MD만 열람 가능 */
  includes: string[];
  /** 방장 + 해당 MD만 열람 가능 */
  comment: string | null;
  status: OfferStatus;
  created_at: string;
  updated_at: string;
}

export interface PuzzleMember {
  id: string;
  puzzle_id: string;
  user_id: string;
  guest_count: number;
  user?: Pick<User, 'id' | 'name' | 'profile_image' | 'gender' | 'birthday'>;
  joined_at: string;
  /** V2: MD가 방문 확인 시 개별 노쇼 체크 */
  noshow: boolean;
  visited: boolean | null;
}

export interface PuzzleContactUnlock {
  id: string;
  puzzle_id: string;
  md_id: string;
  credits_used: number;
  created_at: string;
}

export interface PuzzleInterest {
  id: string;
  user_id: string;
  puzzle_id: string;
  created_at: string;
  puzzle?: Puzzle;
}

export interface PuzzleReport {
  id: string;
  puzzle_id: string;
  reporter_md_id: string;
  reason: string;
  created_at: string;
}

// ============================================
// Naver Maps API Global Types
// ============================================
declare global {
  interface Window {
    naver: {
      maps: {
        Map: new (element: HTMLElement, options?: Record<string, unknown>) => unknown;
        LatLng: new (lat: number, lng: number) => unknown;
        Marker: new (options: Record<string, unknown>) => unknown;
        LatLngBounds: new (sw: unknown, ne: unknown) => unknown;
        Position: Record<string, number>;
      };
    };
  }
}
