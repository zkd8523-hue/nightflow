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
  | "expired"
  | "contacted";
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
  | "new_auction_in_area";
export type NotificationStatus = "pending" | "sent" | "failed";
export type InAppNotificationType = "md_approved" | "md_rejected" | "outbid" | "auction_won" | "contact_deadline_warning" | "noshow_penalty" | "fallback_won" | "feedback_request" | "md_grade_change" | "cancellation_confirmed" | "contact_expired_no_fault" | "contact_expired_user_attempted" | "md_winner_cancelled" | "md_winner_noshow" | "md_new_bid";
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
  name: string;
  phone: string;
  profile_image: string | null;

  // MD 전용
  md_status: MDStatus | null;
  md_rejection_reason: string | null;
  md_unique_slug: string | null;
  bank_account: string | null;
  bank_name: string | null;
  area: string | null;
  default_club_id: string | null;
  verification_club_name: string | null;
  floor_plan_url: string | null;
  instagram: string | null;
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
  /** @deprecated Model A 필드 - blocked_until 대신 banned_until 사용 권장 */
  blocked_until: string | null;
  /** Model B 활성 필드 - 이용 정지 종료일 (스트라이크 제재) */
  banned_until: string | null;
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
  cancel_type: CancellationType | null;
  cancel_reason: string | null;
  is_bin_win: boolean;
  fallback_from_winner_id: string | null;
  feedback_requested_at: string | null;

  chat_interest_count: number;

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
  name: string;
  profile_image: string | null;
  noshow_count: number;
  strike_count: number; // Model B 스트라이크
  is_blocked: boolean;
  total_bids: number;
  won_bids: number;
  win_rate: number;
  avg_bid_amount: number;
  noshow_from_transactions: number;
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

export interface Bid {
  id: string;
  auction_id: string;
  bidder_id: string;
  bid_amount: number;
  status: BidStatus;
  bid_at: string;

  // JOIN
  bidder?: User;
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

export interface AreaNotifySubscription {
  id: string;
  user_id: string;
  area: string;
  phone: string;
  created_at: string;
}

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
  md?: Pick<User, "id" | "name" | "profile_image" | "md_unique_slug">;
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
// Naver Maps API Global Types
// ============================================
declare global {
  interface Window {
    naver: {
      maps: {
        Map: any;
        LatLng: any;
        Marker: any;
        LatLngBounds: any;
        Position: Record<string, number>;
      };
    };
  }
}
