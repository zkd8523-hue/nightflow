'use client';

import { trackEvent as trackMixpanel, identifyUser as identifyMixpanel, resetAnalytics } from "@/lib/analytics";
import { trackUserEvent } from "@/lib/analytics/userEvents";

/**
 * GA4 및 Mixpanel 통합 이벤트 추적을 위한 유틸리티 함수
 */
/**
 * 현재 유저의 언어 트랙(ko/en/ja/zh) 감지.
 * 우선순위: URL 경로 세그먼트(/en, /ja, /zh) > ?lang= 쿼리 > "ko"
 * 외국인 이탈퍼널 분석 시 이 lang 속성 하나로 트랙 전체 필터 가능.
 */
const detectLang = (): 'ko' | 'en' | 'ja' | 'zh' | 'zh-tw' => {
  if (typeof window === 'undefined') return 'ko';
  const path = window.location.pathname;
  if (path.startsWith('/en/') || path === '/en') return 'en';
  if (path.startsWith('/ja/') || path === '/ja') return 'ja';
  // zh-tw를 zh보다 먼저 판정 (/zh-tw는 /zh startsWith에도 매칭됨)
  if (path.startsWith('/zh-tw/') || path === '/zh-tw') return 'zh-tw';
  if (path.startsWith('/zh/') || path === '/zh') return 'zh';
  const q = new URLSearchParams(window.location.search).get('lang');
  if (q === 'en' || q === 'ja' || q === 'zh' || q === 'zh-tw') return q;
  return 'ko';
};

export const trackEvent = (eventName: string, params: Record<string, unknown> = {}) => {
  try {
    // 모든 이벤트에 lang 자동 부착 (외국인 이탈퍼널 필터용).
    // 호출부에서 명시적으로 lang을 넘겼으면 그걸 우선.
    const enriched = { lang: detectLang(), ...params };

    // 1. GA4 추적
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', eventName, {
        ...enriched,
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Mixpanel 추적
    trackMixpanel(eventName, enriched);

    // 3. user_events 테이블 raw 저장 (Claude가 SQL로 유저 여정 조회하는 용도)
    //    fire-and-forget. Supabase 통신 실패해도 GA4·Mixpanel엔 이미 감.
    void trackUserEvent(eventName, enriched);

    // 개발 모드 로그 확인
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Analytics Event] ${eventName}:`, enriched);
    }
  } catch (e) {
    // 분석 툴 에러가 메인 로직을 중단시키지 않도록 방어
    console.warn(`[Analytics Error] Failed to track ${eventName}`, e);
  }
};

/**
 * 특정 경매 상세 조회를 추적하는 도우미 함수
 */
export const trackViewAuction = (params: {
  id: string;
  clubName: string;
  area: string;
  listingType: string;
  price: number;
}) => {
  trackEvent('view_auction', {
    auction_id: params.id,
    club_name: params.clubName,
    area: params.area,
    listing_type: params.listingType,
    value: params.price,
    currency: 'KRW',
  });
};

/**
 * 카카오톡 공유를 추적하는 도우미 함수
 */
export const trackShareKakao = (params: {
  id: string;
  clubName: string;
  listingType: string;
}) => {
  trackEvent('share_kakao', {
    auction_id: params.id,
    club_name: params.clubName,
    listing_type: params.listingType,
    method: 'kakao_share',
  });
};

/**
 * 입찰 행동을 추적하는 도우미 함수
 */
export const trackBid = (action: 'start' | 'complete', params: {
  id: string;
  clubName: string;
  amount?: number;
  [key: string]: unknown;
}) => {
  const { id, clubName, amount, ...rest } = params;
  const eventName = action === 'start' ? 'begin_bid' : 'complete_bid';
  trackEvent(eventName, {
    auction_id: id,
    club_name: clubName,
    value: amount,
    currency: 'KRW',
    ...rest,
  });
};

/**
 * 조각(share) 매물 관련 이벤트 추적 도우미
 *
 * 이벤트 명세:
 * - share_tab_view: 홈 "조각" 탭 진입
 * - share_listing_created: MD가 조각 매물 등록 완료
 * - share_card_click: 홈/리스트에서 조각 카드 클릭
 * - share_view: 조각 상세 진입
 * - share_join_attempt: 참여하기 버튼 클릭 (RPC 호출 직전)
 * - share_join_success: 좌석 점유 성공
 * - share_join_fail: 좌석 점유 실패 (error 코드 포함)
 * - share_cancel: 참여 취소 (성공)
 * - share_gender_gate_open: 성별 게이트 시트 노출
 * - share_gender_set: 성별 저장 완료
 * - share_kakao_open: 카카오 오픈채팅 입장 클릭
 * - share_full_reached: 모집 마감(만석) 도달 (옵션)
 */
export const trackShareEvent = (
  eventName:
    | 'share_tab_view'
    | 'share_listing_created'
    | 'share_card_click'
    | 'share_view'
    | 'share_join_attempt'
    | 'share_join_success'
    | 'share_join_fail'
    | 'share_cancel'
    | 'share_gender_gate_open'
    | 'share_gender_set'
    | 'share_kakao_open'
    | 'share_full_reached'
    | 'share_card_share_click',
  params: {
    auction_id?: string;
    club_id?: string | null;
    club_name?: string;
    area?: string | null;
    price_per_seat?: number;
    total_seats?: number;
    seats_filled?: number;
    seats_left?: number;
    [key: string]: unknown;
  } = {},
) => {
  trackEvent(eventName, {
    listing_type: 'share',
    ...params,
  });
};

/**
 * 외국인 트랙(/en, /ja, /zh) 이탈퍼널 이벤트.
 *
 * 퍼널 단계 (SEO 랜딩 → 깃발 제출):
 *   1. foreign_clubs_view          — /{lang}/clubs 또는 /{lang}/clubs/{area} 랜딩
 *   2. foreign_club_card_click     — 지역 카드(썸네일) 탭 → 시트 오픈
 *   3. foreign_book_at_club_click  — 시트 안 "🚩 예약하기" CTA 탭 → /flags/new 이동
 *   3'. foreign_plant_flag_click   — 하단 CTA "🚩 Plant your flag" 탭 → /flags/new 이동
 *   4. foreign_login_view          — 로그인 페이지 노출 (redirect=/flags/new 로 왔을 때)
 *   5. foreign_login_success       — 로그인 성공 (auth/callback 이후)
 *   6. puzzle_form_view (기존)     — /flags/new 폼 노출 (lang 자동 첨부)
 *   7. puzzle_created (기존)       — 깃발 등록 완료 (lang 자동 첨부)
 *
 * 이탈률 = 1 - (다음 단계 이벤트 수 / 현재 단계 이벤트 수), lang별 group by.
 * 상세 분석 SOP: .claude/plans/foreign-funnel-analysis-sop.md
 */
export const trackForeignEvent = (
  eventName:
    | 'foreign_clubs_view'
    | 'foreign_club_card_click'
    | 'foreign_book_at_club_click'
    | 'foreign_plant_flag_click'
    | 'foreign_login_view'
    | 'foreign_login_success'
    | 'foreign_request_form_view'
    | 'foreign_request_submitted'
    | 'foreign_club_saved'
    | 'foreign_saved_club_added'
    // 외국어 홈 진입 (Admin 인사이트가 이 이름들로 집계)
    | 'en_home_view'
    | 'ja_home_view'
    | 'zh_home_view'
    | 'zh_tw_home_view',
  params: {
    area?: string | null;
    club_id?: string;
    club_name?: string;
    source?: string;
    [key: string]: unknown;
  } = {},
) => {
  trackEvent(eventName, {
    funnel: 'foreign',
    ...params,
  });
};

/**
 * 안드로이드 앱 다운로드(Play Store) CTA 클릭을 추적하는 도우미 함수.
 * GA4에서 event_name = 'app_download_click', location으로 노출 위치 구분.
 *
 * location:
 * - 'banner': 하단 플로팅 배너
 * - 'footer': 푸터 상시 버튼
 * - 'flag_created_sheet': 깃발 꽂은 직후 1회성 팝업
 */
export const trackAppDownloadClick = (
  location: 'banner' | 'footer' | 'flag_created_sheet',
  params: Record<string, unknown> = {},
) => {
  trackEvent('app_download_click', {
    platform: 'android',
    store: 'play_store',
    location,
    ...params,
  });
};

/**
 * 유저를 식별하기 위한 함수 (ID와 프로퍼티 설정)
 */
export const identifyUser = (userId: string, params: Record<string, unknown> = {}) => {
  // 1. GA4 User ID 설정
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('config', process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID!, {
      'user_id': userId,
    });
  }

  // 2. Mixpanel 유저 식별 및 프로퍼티 설정
  identifyMixpanel(userId, params);

  if (process.env.NODE_ENV === 'development') {
    console.log(`[Analytics Identify] ${userId}:`, params);
  }
};

/**
 * 로그아웃 시 유저 식별 정보를 초기화하는 함수
 */
export const resetUser = () => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('set', 'user_id', null);
  }

  resetAnalytics();

  if (process.env.NODE_ENV === 'development') {
    console.log(`[Analytics Reset] User identity cleared`);
  }
};
