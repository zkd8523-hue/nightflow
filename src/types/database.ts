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
/** Migration 269: 거래 누적 금액 기반 등급 (VIP 100만+ / VVIP 1000만+ / President 5000만+) */
export type DealTier = "vip" | "vvip" | "president";
export type ListingType = "auction" | "instant" | "share";
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
export type InAppNotificationType = "md_approved" | "md_rejected" | "outbid" | "auction_won" | "contact_deadline_warning" | "noshow_penalty" | "fallback_won" | "feedback_request" | "md_grade_change" | "cancellation_confirmed" | "contact_expired_no_fault" | "contact_expired_user_attempted" | "md_winner_cancelled" | "md_winner_noshow" | "md_new_bid" | "md_noshow_review" | "noshow_dismissed" | "puzzle_seat_adjusted" | "puzzle_cancelled" | "puzzle_offer_received" | "puzzle_offer_accepted" | "puzzle_offer_rejected" | "puzzle_leader_changed" | "puzzle_member_joined" | "puzzle_visit_pending" | "puzzle_visit_confirmed" | "puzzle_promoted_to_flag" | "admin_puzzle_expired" | "admin_puzzle_cancelled" | "admin_match_expired" | "admin_match_cancelled";
export type TableType = "Standard" | "VIP" | "Premium";

/** Migration 175 + 198: 깃발 취소 설문 */
export type PuzzleCancelReason =
  | "schedule_change"
  | "no_preferred_venue"
  | "weak_offers"
  | "booked_elsewhere"
  | "mind_change"
  | "forgot_about_it"
  | "other"
  | "no_answer";

export type PuzzleSurveyTrigger = "self_cancelled" | "selecting_expired";

export interface PuzzleCancellationSurvey {
  id: string;
  puzzle_id: string;
  user_id: string;
  trigger_type: PuzzleSurveyTrigger;
  reason_categories: PuzzleCancelReason[];
  reason_text: string | null;
  responded_at: string;
}

export interface PendingCancellationSurvey {
  puzzle_id: string;
  trigger_type: PuzzleSurveyTrigger;
  club_label: string;
  event_date: string;
  occurred_at: string;
}

export interface CancellationSurveyStatRow {
  reason_category: PuzzleCancelReason;
  label: string;
  cnt: number;
  ratio: number;
}

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
  /** ISO 3166-1 alpha-2 국가 코드. 외국인 가입 시 선택 (Migration 320) */
  country_code: string | null;
  /** 알림용 이메일. 외국인 우선, auth.users.email 복사 또는 폴백 입력값 (Migration 331) */
  email: string | null;
  /** Resend bounce 웹훅으로 도달 불가 감지 시 true. 다음 방문에서 재입력 유도 (Migration 331) */
  email_bounced: boolean;

  /** 공개 프로필 자기소개. 최대 160자 (Migration 279) */
  bio: string | null;

  /** 공개 프로필: 좋아하는 음악 장르 코드 (최대 3개). Migration 280 */
  preferred_music_genres: string[] | null;
  /** 공개 프로필: 주로 가는 지역 (최대 3개, AREA_OPTIONS와 동일). Migration 280 */
  preferred_areas: string[] | null;

  // MD 크레딧 잔액 (대화 첫 답장 15 / 수락 등 기능 이용 시 차감)
  md_credits: number | null;

  // MD 전용
  md_status: MDStatus | null;
  md_onboarding_areas_seen: boolean;
  /** 깃발 등록 후 5자 리뷰 유도 팝업 노출 완료 여부 (계정당 1회). Migration 445 */
  flag_review_popup_seen: boolean;
  md_rejection_reason: string | null;
  md_unique_slug: string | null;
  bank_account: string | null;
  bank_name: string | null;
  area: string[] | null;
  default_club_id: string | null;
  verification_club_name: string | null;
  additional_club_names: string[] | null;
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
  /** Migration 146: 누적 거래 카운트 (깃발 visited + 경매 confirmed). */
  deal_count_total: number;
  /** Migration 269: 누적 거래 금액(원). VIP/VVIP/President 등급 기반. */
  deal_amount_total: number;

  // 신원 정보 (Migration 114부터는 PASS 본인인증 결과로 채워짐)
  birthday: string | null;          // "YYYY-MM-DD"
  gender: "male" | "female" | null;
  age_verified_at: string | null;   // 성인 인증 완료 시각 (PASS 인증 시 갱신)

  // 알림톡
  alimtalk_consent: boolean;
  alimtalk_consent_at: string | null;

  // 푸시 카테고리 토글 (Migration 230)
  notify_offer_arrived: boolean;
  notify_new_puzzle: boolean;
  notify_offer_response: boolean;
  notify_marketing: boolean;

  // 방해금지 시간대 (푸시 only)
  quiet_hours_enabled: boolean;
  quiet_hours_start: number | null;  // 0-23
  quiet_hours_end: number | null;    // 0-23
  quiet_hours_scope: 'everyday' | 'weekends' | 'weekdays';

  // Referral (백그라운드 추적, 유저에게 비노출)
  referral_code: string | null;
  referred_by: string | null;
  signup_source: string | null;

  created_at: string;
  updated_at: string;
  /** Migration 201: 마지막 접속 시각. 인증된 사용자가 본인 row만 갱신. */
  last_seen_at: string | null;
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

/**
 * Migration 174: 클럽-MD 다대다 조인 테이블
 * 한 클럽에 여러 MD가 파트너로 참여할 수 있다.
 * Phase 3(Migration 178): 코드/RLS가 club_partners 기반으로 동작.
 * Phase 4(Migration 182): clubs.md_id 컬럼 / 관련 RLS·트리거 제거 완료.
 */
/** Migration 217: 클럽 리뷰 — 긍정 태그 다중선택, 클럽당 유저 1회 */
export interface ClubReview {
  id: string;
  club_id: string;
  user_id: string;
  tags: string[];
  source: "verified" | "self";
  created_at: string;
  updated_at: string;
}

export interface ClubReviewTagCount {
  club_id: string;
  tag: string;
  cnt: number;
  verified_cnt: number;
}

export interface ClubReviewSummary {
  club_id: string;
  total_reviews: number;
  verified_reviews: number;
}

export interface ClubPartner {
  id: string;
  club_id: string;
  md_id: string;
  role: "owner" | "manager" | "partner";
  /** Migration 216: 각 MD가 본인만의 클럽 대표 이미지 (clubs.thumbnail_url과는 무관) */
  thumbnail_url: string | null;
  joined_at: string;
  created_at: string;
  updated_at: string;
}

export interface Club {
  id: string;
  name: string;
  name_en: string | null;  // 외국어 페이지 표시명 (비어있으면 name 그대로 노출)
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

  // Soft Delete (Migration 143)
  deleted_at: string | null;
  deleted_by: string | null;

  // Migration 203: 공식 인스타그램 핸들 (https://instagram.com/{handle})
  instagram: string | null;

  // Migration 462: 공식 홈페이지 URL (풀파티/이벤트 venue용)
  website_url?: string | null;

  // Migration 461: 클럽 가이드/지도 노출 차단 (비-클럽 venue용)
  hidden_from_guide?: boolean;

  // Migration 208: 클럽지도 필터/특징 태그 + 주대표
  tags: string[];  // prefix-grouped: 'genre:hiphop', 'crowd:foreign', etc.
  drink_menu_url: string | null;
  drink_menu_updated_at: string | null;
  /** Migration 298: 주대 사진 다중 등록. drink_menu_url(단일)은 하위호환용. */
  drink_menu_urls?: string[];
  /** Migration 300: 테이블맵 사진 다중 등록. floor_plan_url(단일)은 하위호환용. */
  floor_plan_urls?: string[];

  // Migration 218: 영업시간 자유 텍스트 (예: "금/토 22:00-05:00")
  operating_hours: string | null;

  // Migration 223: 입장료 상세 텍스트 (예: "남 15,000 / 여 10,000")
  entry_fee_detail: string | null;

  // Migration 246: 드레스코드 자유 텍스트 (예: "스니커즈 OK, 슬리퍼 X")
  dresscode: string | null;

  // Migration 231: 검색 별칭 (예: ["에이스", "ace", "club ace"])
  aliases: string[];

  // Migration 244: 좋아요 시드 카운트 (실제 row와 합산해 노출)
  seed_favorite_count?: number | null;

  // Migration 317: 구글 평점 (외국인 /en 추천순 정렬)
  google_place_id: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  google_synced_at: string | null;

  /** Migration 174~182: 조인해서 가져올 때만 채워짐. 멀티 MD 표시 및 상세 정보용. */
  partners?: Array<{
    md_id: string;
    role: ClubPartner["role"];
    user?: {
      id: string;
      name: string | null;
      display_name: string | null;
      phone: string | null;
      profile_image?: string | null;
      md_status?: string | null;
      area?: string | null;
      instagram?: string | null;
      business_card_url?: string | null;
      verification_club_name?: string | null;
      created_at?: string;
    } | null;
  }>;
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
  md_comment: string | null;
  md_message: string | null;

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
  today_view_count: number;

  created_at: string;
  updated_at: string;

  // 조각 (share) 전용 필드 — Migration 172
  total_seats: number | null;
  seats_claimed: number;
  price_per_seat: number | null;
  share_deadline: string | null;
  external_attendees: number;
  external_male: number;   // Migration 189
  external_female: number;
  main_alcohol: string | null;
  share_date: string | null;
  kakao_open_chat_url: string | null; // Migration 187: 조각 오픈채팅 링크
  target_male: number;   // Migration 188: 성별 슬롯
  target_female: number;
  seats_claimed_male: number;   // Migration 202: 인앱 참여자 성별 카운터
  seats_claimed_female: number;
  share_option_id: string | null; // Migration 304: 자동생성 조각의 원본 옵션 (수동 등록은 NULL)

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
  /** 깃발 leader로서 MD에게 "방문" 마킹 받은 횟수 (Migration 144) */
  puzzle_visited_count: number;
  /** Migration 146: 깃발+경매 합산 누적 거래 카운트 */
  deal_count_total: number;
  /** Migration 146: deal_count_total 기반 자동 등급. 0건이면 null */
  deal_tier: DealTier | null;
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
  instagram: string | null;
  phone: string | null;
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
  md_deal_count: number | null;
  /** Migration 146: 누적 거래 카운트 (deal_count_total 그대로 노출) */
  deal_count_total: number | null;
  /** Migration 269: 누적 거래 금액(원). VIP/VVIP/President 등급 기반. */
  deal_amount_total: number | null;
  /** Migration 279: 공개 프로필 자기소개 (최대 160자) */
  bio: string | null;
  /** 가입일. 공개 프로필에서 "2026년 5월 가입" 표시용 */
  created_at: string;
  /** Migration 280: 좋아하는 음악 장르 코드 (최대 3개) */
  preferred_music_genres: string[] | null;
  /** Migration 280: 주로 가는 지역 (최대 3개) */
  preferred_areas: string[] | null;
}

/** Migration 280: 공개 프로필 노출용 좋아하는 클럽 (최대 3개)
 * UserFavoriteClub(찜 기능, Migration 070)와 다름 */
export interface UserPinnedClub {
  id: string;
  user_id: string;
  club_id: string;
  sort_order: number;
  created_at: string;
  club?: Pick<Club, "id" | "name" | "area" | "thumbnail_url">;
}

/** 선호 클럽 피커에서 다루는 클럽 최소 정보 */
export interface ClubLite {
  id: string;
  name: string;
  area: string;
  thumbnail_url: string | null;
}

/**
 * 선호 클럽 피커의 선택 항목.
 *  - kind "club": DB에 있는 실제 클럽 → user_pinned_clubs 저장(프로필 표시)
 *  - kind "wish": DB에 없는 자유입력 → club_requests 저장(영업 리드, Migration 212)
 */
export type PreferredClubItem =
  | { kind: "club"; club: ClubLite }
  | { kind: "wish"; name: string; area: string | null };

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

export type PuzzleStatus = 'open' | 'selecting' | 'matched' | 'cancelled' | 'expired' | 'accepted';
// open: 오퍼 모집 중
// selecting: 오퍼 마감, 유저 검토 중 (Migration 297 — 오후 8시 이후 60분)
// matched: 대표자가 수동 마감 (MD 추가 결제 차단, 홈에서 숨김)
// accepted: 오퍼 수락 완료 (V2 역경매)

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';

export type GenderPref = 'male_only' | 'female_only' | 'any';
// '20s'/'30s' = 조각 3분할용(20대/30대). early_/late_/mid_ = 레거시 backward compat.
export type AgePref = '20s' | '30s' | 'early_20s' | 'late_20s' | 'early_30s' | 'mid_30s' | 'any';
export type VibePref = 'chill' | 'active' | 'any';
// Migration 156: 음악 선호. NULL = 상관없음(필터 시 모두 통과)
export type MusicPref = 'hiphop' | 'edm' | 'any';

export interface Puzzle {
  id: string;
  leader_id: string;
  leader?: Pick<User, 'id' | 'name' | 'display_name' | 'profile_image' | 'deal_count_total' | 'deal_amount_total' | 'created_at' | 'gender' | 'country_code'> & { consultation_count?: number | null };
  area: Area;
  event_date: string;
  kakao_open_chat_url: string | null; // 오퍼 수락 시점에 입력, MD에게만 공개
  gender_pref: GenderPref;
  /** Migration 171: 복수 선택 가능. ['any'] = 전체 허용 */
  age_pref: AgePref[];
  vibe_pref: VibePref;
  /** Migration 156: 음악 선호. NULL = 미지정(상관없음 동일 취급) */
  music_preference: MusicPref | null;
  /** V1 호환 필드. 신규 퍼즐은 total_budget 사용 (null이면 이 값 사용) */
  budget_per_person: number;
  /** V2: 총액 고정 예산 (budget_per_person 대체) */
  total_budget: number | null;
  target_count: number;
  current_count: number;
  /** Migration 184: 성별 슬롯. target_male + target_female = target_count */
  target_male: number;
  target_female: number;
  current_male: number;
  current_female: number;
  /** true: 파티원 추가 모집(조각모음). false: 인원 확정 깃발 (target = current). Migration 125 */
  is_recruiting_party: boolean;
  /** Migration 366: MD 직통 조각 (MD가 직접 올림). true면 카드/상세에 MD·클럽·테이블 표시 */
  host_is_md?: boolean;
  club_id?: string | null;
  /** MD 직통: 주류·구성 */
  includes?: string[];
  /** MD 직통: 테이블 정보 */
  table_info?: string | null;
  /** MD 직통: MD 한마디 (자유 텍스트, notes와 별개) */
  md_comment?: string | null;
  /** MD 직통: 클럽 조인 (host_is_md 카드/상세/공유용) */
  club?: { id: string; name: string; area: string | null; thumbnail_url: string | null; floor_plan_url?: string | null; latitude?: number | null; longitude?: number | null } | null;
  status: PuzzleStatus;
  /** Migration 167: 취소 사유 (admin이 입력 시) */
  cancelled_reason: string | null;
  /** Migration 167: 취소 시각 (admin/방장 공통) */
  cancelled_at: string | null;
  notes: string | null;
  /** Migration 453: 방장이 참여자/파트너에게 남기는 덧붙이는 말 (선택, 최대 200자) */
  leader_comment: string | null;
  expires_at: string;
  /** Migration 170: 오퍼 마감 시각 (NULL = 기존 자정 마감 깃발) */
  offer_deadline: string | null;
  /** Migration 170: 15분 임박 알림 발송 시각 (중복 방지) */
  review_ending_notified_at: string | null;
  accepted_offer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PuzzleOffer {
  id: string;
  puzzle_id: string;
  md_id: string;
  club_id: string | null;
  club?: Pick<Club, 'id' | 'name' | 'area' | 'drink_menu_url' | 'drink_menu_urls' | 'drink_menu_updated_at'>;
  /** 수락 전: md_deal_count만 채워짐. display_name 등 식별 정보는 수락된 오퍼에 한해 별도 조회로 채워짐. */
  md?: Pick<PublicUserProfile,
    'id' | 'display_name' | 'profile_image' | 'md_deal_count' |
    'instagram' | 'phone' | 'kakao_open_chat_url' | 'preferred_contact_methods'
  >;
  table_type: TableType;
  /** 방장 + 해당 MD만 열람 가능 */
  proposed_price: number;
  /** 방장 + 해당 MD만 열람 가능 */
  includes: string[];
  /** 방장 + 해당 MD만 열람 가능 */
  comment: string | null;
  status: OfferStatus;
  /** Migration 144: MD가 마킹한 방문 결과 */
  visit_result: 'visited' | 'noshow' | null;
  /** Migration 144: 마킹 시각. NULL이면 미평가 */
  visit_marked_at: string | null;
  /** Migration 144: admin이 strike 적용한 시각. NULL이면 미처리 큐 */
  strike_applied_at: string | null;
  /** Migration 144: strike 처리한 admin id */
  strike_applied_by: string | null;
  /** Migration 146: 거래확정 신청자 id (md_id 또는 leader_id). NULL이면 미신청 */
  visit_requested_by: string | null;
  /** Migration 146: 신청 시각. 7일 무응답 자동 만료 기준 */
  visit_requested_at: string | null;
  /** Migration 332: 방장이 이 오퍼 채팅을 마지막으로 읽은 시각 (카톡 "1") */
  leader_read_at: string | null;
  /** Migration 332: MD가 이 오퍼 채팅을 마지막으로 읽은 시각 (카톡 "1") */
  md_read_at: string | null;
  /** Migration 332: 방장이 이 오퍼에 첫 메시지를 보낸 시각 = 상담 시작 ("상담중"·슬롯 기준) */
  leader_chat_started_at: string | null;
  created_at: string;
  updated_at: string;
  /** 클라이언트 전용(admin): 오퍼 채팅 메타데이터. Migration 417 RPC로 채움(내용 없이 건수/시각/마지막 발신자만). */
  chat_meta?: OfferChatMeta;
}

/** Migration 417: admin 모니터링용 오퍼 채팅 메타데이터 (내용 미포함) */
export interface OfferChatMeta {
  /** 방장이 보낸 메시지 수 */
  leader: number;
  /** MD가 보낸 메시지 수 */
  md: number;
  /** MD가 1건이라도 답했는지 */
  replied: boolean;
  /** 마지막 메시지 시각 (ISO) */
  last_at: string | null;
  /** 마지막으로 보낸 쪽 */
  last_by: "leader" | "md" | "other" | null;
}

/** Migration 332: 깃발 오퍼 1:1 채팅 메시지 */
export interface OfferMessage {
  id: string;
  offer_id: string;
  sender_id: string;
  content: string;
  media: ChatMediaItem[];
  is_deleted: boolean;
  edited_at?: string | null;
  created_at: string;
  // joined
  sender?: { id: string; display_name: string | null; profile_image: string | null };
}

/** Migration 349: 조각(파티) 단체채팅 메시지. sender_id=null 이면 시스템 메시지. */
export interface PartyMessage {
  id: string;
  puzzle_id: string;
  sender_id: string | null;
  content: string;
  media: ChatMediaItem[];
  is_system: boolean;
  is_deleted: boolean;
  created_at: string;
  /** Migration 356: 답글(인용) 대상 메시지 id */
  reply_to?: string | null;
  /** Migration 357: 채팅에 공유된 오퍼 id ("이거 어때요?" 카드) */
  shared_offer_id?: string | null;
  // joined
  sender?: { id: string; display_name: string | null; profile_image: string | null } | null;
}

/** Migration 349: 조각 단체방 참여자 (방장 + 합류 멤버) */
export interface PartyParticipant {
  id: string;
  display_name: string | null;
  profile_image: string | null;
  is_leader: boolean;
  guest_count: number;
  /** Migration 352: 초대되어 단체방에 들어온 MD */
  is_md?: boolean;
  /** MD의 클럽명 (is_md일 때) */
  club_name?: string | null;
}

/** Migration 352: 조각 단체방 오퍼 리스트 항목 (get_party_offers RPC) */
export interface PartyOffer {
  offer_id: string;
  md_id: string;
  club_id: string | null;
  club_name: string | null;
  table_type: string | null;
  proposed_price: number;
  includes: string[];
  comment: string | null;
  status: OfferStatus;
  created_at: string;
  like_count: number;
  dislike_count: number;
  my_vote: 'like' | 'dislike' | null;
  is_invited: boolean;
}

/** Migration 349: 나의 채팅 조각 탭 단체방 요약 (get_party_chats RPC) */
export interface PartyChatSummary {
  puzzle_id: string;
  area: string;
  notes: string | null;
  event_date: string;
  budget: number | null;
  member_count: number;
  target_count: number;
  /** MD 직통 조각의 클럽 대표 이미지. 없으면 프론트에서 지역 첫 글자 폴백 (Migration 412) */
  club_thumbnail: string | null;
  is_leader: boolean;
  puzzle_status: string;
  last_content: string;
  last_at: string;
  last_sender_id: string | null;
  unread: boolean;
}

// 고객 문의 1:1 채팅 (유저 ↔ admin 운영팀) — Migration 337
export interface SupportMessage {
  id: string;
  thread_user_id: string;
  sender_id: string | null;
  sender_role: "user" | "admin";
  body: string;
  created_at: string;
}

export interface SupportThreadSummary {
  user_id: string;
  user_name: string;
  profile_image: string | null;
  last_message_at: string | null;
  last_message_body: string | null;
  last_sender_role: "user" | "admin" | null;
  unread: boolean;
}

export interface PuzzleMember {
  id: string;
  puzzle_id: string;
  user_id: string;
  guest_count: number;
  /** Migration 184: 합류 시점 users.gender 스냅샷 (guest도 동성으로 카운트) */
  gender: 'male' | 'female' | null;
  user?: Pick<User, 'id' | 'name' | 'display_name' | 'profile_image' | 'gender' | 'birthday'>;
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

// ============================================================
// 조각 (share) 관련 타입 — Migration 172/173
// ============================================================

export interface ShareClaim {
  id: string;
  auction_id: string;
  user_id: string;
  claimed_at: string;
  cancelled_at: string | null;
  cancellation_count: number;
  kicked_by_md: boolean;
  gender: 'male' | 'female' | null;   // Migration 202
  user?: User;
}

export type ShareClaimError =
  | "NOT_SHARE_LISTING"
  | "OWN_LISTING"
  | "NOT_OPEN"
  | "EXPIRED"
  | "FULL"
  | "MD_CHAT_UNAVAILABLE"
  | "ALREADY_CLAIMED"
  | "KICKED_BY_MD"
  | "MAX_CANCELLATIONS"
  | "CLAIM_NOT_FOUND"
  | "NOT_OWNER"
  | "NEGATIVE_NOT_ALLOWED"
  | "EXCEEDS_TOTAL_SEATS"
  | "INVALID_PARTY_SIZE";

export interface AuctionTemplate {
  id: string;
  md_id: string;
  name: string;
  club_id: string | null;
  table_type: string | null;
  // share 전용
  total_seats: number | null;
  price_per_seat: number | null;
  main_alcohol: string | null;
  includes: string[];
  md_comment: string | null;
  created_at: string;
  updated_at: string;
  club?: Club;
}

// 주류 정보 카드 (Migration 446) — 깃발 오퍼 주류 배지 탭 시 이미지/설명/가격대 표시
export interface LiquorProduct {
  id: string;
  name: string;
  category: string;
  aliases: string[];
  image_url: string | null;
  description: string | null;
  origin: string | null;
  abv: number | null;
  accolade: string | null;
  price_min: number | null;
  price_max: number | null;
  is_active: boolean;
  source: "club_menu" | "external" | "manual";
  created_at: string;
  updated_at: string;
}

// MD 오퍼 세트/프리셋 (Migration 437) — 깃발 오퍼 구성 원클릭 채움
export interface MdOfferPreset {
  id: string;
  md_id: string;
  name: string;
  club_id: string | null;
  includes: string[];
  comment: string | null;
  /** 'flag' = 깃발(고정가) 오퍼, 'share' = 조각(파티원 모집) 오퍼 — Migration 464 */
  offer_kind: "flag" | "share";
  created_at: string;
  club?: Pick<Club, "name" | "area"> | null;
}

// 핫딜 템플릿 (Migration 242)
export interface HotdealTemplate {
  id: string;
  md_id: string;
  name: string;
  club_id: string | null;
  description: string | null;
  price: number | null;
  original_price: number | null;
  walk_minutes: number | null;
  nearest_station: string | null;
  table_info: string | null;
  table_features: string[];
  liquor_includes: string[];
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  club?: Pick<Club, "id" | "name" | "area">;
}

// ============================================================================
// HOT DEAL 슬롯 (Migration 234, week 단위로 Migration 236에서 재정의)
// ============================================================================
export type HotdealDow = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type HotdealBenefitTag = 'free_entry' | 'free_drink' | string;

/** 시간대별 혜택 슬롯. until=null이면 영업종료까지 */
export interface HotdealTimeSlot {
  /** "HH:00" 또는 null (영업종료) */
  until: string | null;
  /** 시작 시각 "HH:00" 또는 null/undefined (지정 안 함). 이 시각 전에는 "HH:00부터"로 예고, 지나면 문구에서 뗌 */
  from?: string | null;
  /** MD가 자유롭게 입력하는 멘트 (예: 입구에서 "나플" 무료입장) */
  text: string;
  /** 혜택 태그 (무료입장/프리드링크/기타 직접입력) */
  benefits?: string[];
}

/**
 * 요일별 혜택. 신규 저장은 HotdealTimeSlot[].
 * 레거시 string은 클라이언트 normalize 단계에서 [{until:null, text}]로 변환.
 */
export type HotdealBenefitsByDow = Partial<Record<HotdealDow, HotdealTimeSlot[] | string>>;

export interface WeeklyHotdealSlot {
  id: string;
  club_id: string;
  md_id: string;
  /** "YYYY-MM-DD" — 그 주의 월요일 (KST) */
  week_start: string;
  /** 요일별 혜택 텍스트 */
  benefits_by_dow: HotdealBenefitsByDow;
  /** ISO timestamp — week_start + 7일 00:00 KST */
  expires_at: string;
  claimed_at: string;
  updated_at: string;
}

// ============================================================================
// weekly_share_slots (Migration 299) — 조각(share) 주 단위 선점 슬롯
//   게스트 간판과 독립. 클럽×주=MD 1명. 이 슬롯을 선점한 MD만 조각 등록 가능.
// ============================================================================
export interface WeeklyShareSlot {
  id: string;
  club_id: string;
  md_id: string;
  /** "YYYY-MM-DD" — 그 주의 월요일 (KST) */
  week_start: string;
  /** ISO timestamp — week_start + 7일 18:00 KST */
  expires_at: string;
  claimed_at: string;
  updated_at: string;
}

// ============================================================================
// 조각 상시 세팅 (Migration 302~305)
//   share_options(옵션/프리셋) + share_weekday_plan(요일표) → cron 자동 생성
// ============================================================================
export type ShareDow = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface ShareOption {
  id: string;
  md_id: string;
  club_id: string;
  /** MD용 식별 라벨 "메인","일반" (선택) */
  label: string | null;
  table_info: string;
  total_seats: number;
  price_per_seat: number;
  includes: string[];
  md_message: string | null;
  is_active: boolean;
  /** 조각 마감 시각: 행사일 익일 N시(KST). 기본 3 = 익일 새벽 3시. 0 = 당일 자정. (Mig 306) */
  deadline_hour: number;
  created_at: string;
  updated_at: string;
}

export interface ShareWeekdayPlan {
  id: string;
  md_id: string;
  club_id: string;
  dow: ShareDow;
  option_id: string;
  sort_order: number;
  created_at: string;
}

// ============================================================================
// daily_hotdeals (Migration 238) — 당일 특가/핫딜 카드
// ============================================================================
export type DailyHotdealStatus = 'active' | 'cancelled' | 'expired';

export interface DailyHotdeal {
  id: string;
  club_id: string;
  md_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  price: number | null;
  original_price: number | null;
  walk_minutes: number | null;
  nearest_station: string | null;
  starts_at: string;
  ends_at: string;
  status: DailyHotdealStatus;
  table_info: string | null;
  table_features: string[];
  liquor_includes: string[];
  table_zone: HotdealTableZone | null;
  created_at: string;
  updated_at: string;
  // joined
  club?: Pick<Club, 'id' | 'name' | 'area' | 'thumbnail_url'>;
  md?: { id: string; display_name: string; instagram: string | null; profile_image: string | null };
}

export type HotdealTableZone = 'bar' | 'bar_aisle' | 'sub_main' | 'main' | 'prime';

// ============================================================================
// 클럽 변경 이력 (Migration 245) — 파트너 MD/admin 의 clubs.tags / operating_hours 변경 자동 로깅
// ============================================================================
export interface ClubChangeLog {
  id: string;
  club_id: string;
  changed_by: string | null;
  field: 'tags' | 'operating_hours' | 'dresscode' | string;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
  // joined
  club?: Pick<Club, 'id' | 'name' | 'area'>;
  changer?: { id: string; display_name: string | null; name: string | null };
}

// ============================================================================
// 클럽 한 줄 리뷰 (Migration 275)
// ============================================================================
// 클럽 워드클라우드 5자 리뷰 (Migration 313, club_one_liners 대체)
export interface ClubWordCloud {
  id: string;
  club_id: string;
  author_id: string;
  words: string[]; // 1~2개, 정규화 전 원본 표기 (각 5자 이내)
  created_at: string;
  updated_at: string;
}

// ============================================================================
// 실시간 채팅 (Migration 284)
// ============================================================================
// Migration 421: 광역 채팅방 + 레거시 코드
export type ChatRoomCode =
  | 'sudogwon' | 'gyeongsang' | 'jeolla'
  | 'all' | 'gangnam' | 'hongdae' | 'itaewon' | 'other';
/** LIVE GPS 인증 지역 (채팅방과 별개) */
export type VerifiableArea = 'gangnam' | 'hongdae' | 'itaewon';

export type ChatMediaType = 'image' | 'video' | 'location';

export interface ChatMediaItem {
  type: ChatMediaType;
  /** image/video: 파일 URL. location: 지도 앱으로 여는 링크 */
  url: string;
  width?: number;
  height?: number;
  duration?: number; // 초 (동영상)
  // ── location 전용 (기존 media JSONB에 그대로 실림 — 마이그레이션 불필요) ──
  lat?: number;
  lng?: number;
  /** 역지오코딩한 주소. 실패 시 없을 수 있음 */
  label?: string;
}

export interface ChatMessage {
  id: string;
  room: ChatRoomCode;
  author_id: string;
  content: string;
  /** 첨부 미디어 (이미지/동영상, 최대 4개). Migration 287 */
  media: ChatMediaItem[];
  /** 작성 시점의 작성자 활성 인증 지역. Migration 285에서 자동 채움. */
  author_area: VerifiableArea | null;
  /** 답글 부모 ID. NULL이면 최상위 와글 (Migration 291) */
  parent_id: string | null;
  /** 답글 수 캐시 (Migration 291) */
  reply_count: number;
  /** 본문에 포함된 #클럽 해시태그의 클럽 ID 배열 (Migration 313) */
  club_tags: string[];
  /** 인용 공유의 원본 메시지 ID (Migration 314). NULL이면 일반 메시지. */
  quoted_message_id: string | null;
  /** joined: 인용된 원본 메시지 (요약 정보만) */
  quoted_message?: {
    id: string;
    room: ChatRoomCode;
    author_id: string;
    content: string;
    media: ChatMediaItem[];
    author_area: VerifiableArea | null;
    is_deleted: boolean;
    created_at: string;
    author?: { id: string; display_name: string | null; profile_image: string | null };
  } | null;
  is_deleted: boolean;
  created_at: string;
  // joined
  author?: { id: string; display_name: string | null; profile_image: string | null };
  /** 클라 계산: 이모지별 카운트 + 내가 누른 이모지 */
  reactions?: ChatReactionSummary;
}

/** 와글 이모지 반응 (Migration 291) */
export type ChatReactionEmoji = '❤️' | '👍' | '🔥' | '😂' | '😮' | '🍻';

export const CHAT_REACTION_EMOJIS: ChatReactionEmoji[] = [
  '❤️', '👍', '🔥', '😂', '😮', '🍻',
];

export interface ChatReactionRow {
  message_id: string;
  user_id: string;
  emoji: ChatReactionEmoji;
  created_at: string;
}

export interface ChatReactionSummary {
  /** 이모지별 카운트 */
  counts: Record<ChatReactionEmoji, number>;
  /** 내가 누른 이모지 set */
  mine: Set<ChatReactionEmoji>;
}

export interface AreaVerification {
  user_id: string;
  area: VerifiableArea;
  verified_at: string;
  expires_at: string;
}

export type ChatReportReason = 'spam' | 'abuse' | 'advertising' | 'other';

export interface ChatMessageReport {
  id: string;
  message_id: string;
  reporter_id: string;
  reason: ChatReportReason;
  message: string | null;
  status: 'pending' | 'resolved' | 'rejected';
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/** Migration 415 — 인스타식 텍스트 오버레이 (미디어 위 좌표 기반) */
export interface TextOverlay {
  id: string;
  text: string;
  /** 미디어 대비 위치 (0~100 %) */
  xPct: number;
  yPct: number;
  /** hex 색상 (#ffffff) */
  color: string;
  /** 기준 폰트 대비 배율 (0.5~3.0) */
  fontScale: number;
  /** 회전 deg (기본 0) */
  rotation?: number;
}

/** Migration 422 — 삽입 이미지 스티커 (드래그+리사이즈) */
export interface ImageOverlay {
  id: string;
  /** 업로드된 이미지 URL (게시 시 확정) */
  url: string;
  /** 중심 좌표 % */
  xPct: number;
  yPct: number;
  /** 스테이지 대비 너비 % (10~90) */
  widthPct: number;
  /** 회전 deg */
  rotation?: number;
}

/** Migration 422 — 설문 옵션 */
export interface PollOption {
  id: string;
  text: string;
}

/** Migration 422 — 설문 (샷당 1개) */
export interface ShotPoll {
  id: string;
  question: string;
  options: PollOption[];
  /** 배치 좌표 % (기본 50/70) */
  xPct?: number;
  yPct?: number;
  /** 핀치 확대/축소 배율 (기본 1) */
  scale?: number;
}

/**
 * 와글 LIVE (Migration 413) — 유저의 휘발성 미디어 (12시간)
 * 게시 자유. 노출은 잡담방 + 지역방 + 클럽 페이지
 */
export interface ChatShot {
  id: string;
  /** Migration 404 — NULL 허용 (클럽 미지정). 클럽 지정 LIVE는 인증 area */
  area: VerifiableArea | null;
  /** Migration 341 — 지정 시 LIVE. 클럽 페이지 노출 대상 */
  club_id: string | null;
  author_id: string;
  media_type: 'image' | 'video';
  media_url: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  caption: string | null;
  /** Migration 415 — 텍스트 오버레이 배열 (재생 시 좌표로 렌더) */
  text_overlays?: TextOverlay[];
  /** Migration 422 — 삽입 이미지 스티커 배열 */
  image_overlays?: ImageOverlay[];
  /** Migration 422 — 설문 (1개/샷, 없으면 null) */
  poll?: ShotPoll | null;
  /** 클라이언트: shot_poll_results 집계 (option_id → 표 수) */
  poll_counts?: Record<string, number>;
  /** 클라이언트: 내가 투표한 option_id (없으면 null) */
  my_poll_vote?: string | null;
  /** Migration 316 — 좋아요 캐시 */
  like_count: number;
  /** Migration 325 — 댓글 캐시 */
  comment_count: number;
  created_at: string;
  expires_at: string;
  author?: { id: string; display_name: string | null; profile_image: string | null; role?: string | null; kakao_open_chat_url?: string | null };
  /** 클럽 정보 (club_id join) — LIVE의 지역/클럽명 표시 + 광역 정렬용 */
  club?: { id: string; name: string; area: string | null } | null;
  /** 클라이언트 측에서 chat_shot_likes 조회 후 채움 */
  liked_by_me?: boolean;
  /** 작성자가 이 club_id의 파트너(club_partners)인지 — 파트너 배지 + 문의 버튼 노출 조건.
   *  클라이언트에서 club_partners 조회 후 채움. club_id 없으면 항상 false. */
  author_is_club_partner?: boolean;
}

/** Migration 325 — SHOT 댓글 */
export interface ChatShotComment {
  id: string;
  shot_id: string;
  author_id: string;
  content: string;
  is_deleted: boolean;
  created_at: string;
  author?: { id: string; display_name: string | null; profile_image: string | null };
}


