'use client';

import { trackEvent as trackMixpanel, identifyUser as identifyMixpanel, resetAnalytics } from "@/lib/analytics";

/**
 * GA4 및 Mixpanel 통합 이벤트 추적을 위한 유틸리티 함수
 */
export const trackEvent = (eventName: string, params: Record<string, unknown> = {}) => {
  try {
    // 1. GA4 추적
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', eventName, {
        ...params,
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Mixpanel 추적
    trackMixpanel(eventName, params);

    // 개발 모드 로그 확인
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Analytics Event] ${eventName}:`, params);
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
    | 'share_full_reached',
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
