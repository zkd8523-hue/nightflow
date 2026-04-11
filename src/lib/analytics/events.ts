'use client';

import { trackEvent as trackMixpanel } from "@/lib/analytics";

/**
 * GA4 및 Mixpanel 통합 이벤트 추적을 위한 유틸리티 함수
 */
export const trackEvent = (eventName: string, params: Record<string, any> = {}) => {
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
}) => {
  const eventName = action === 'start' ? 'begin_bid' : 'complete_bid';
  trackEvent(eventName, {
    auction_id: params.id,
    club_name: params.clubName,
    value: params.amount,
    currency: 'KRW',
  });
};

/**
 * 유저를 식별하기 위한 함수 (ID와 프로퍼티 설정)
 */
export const identifyUser = (userId: string, params: Record<string, any> = {}) => {
  // 1. GA4 User ID 설정
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('config', process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID!, {
      'user_id': userId,
    });
  }

  // 2. Mixpanel 유저 식별 및 프로퍼티 설정
  const { identifyUser: identifyMixpanel } = require("@/lib/analytics");
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
  
  const { resetAnalytics } = require("@/lib/analytics");
  resetAnalytics();
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Analytics Reset] User identity cleared`);
  }
};
