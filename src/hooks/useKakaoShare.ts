"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dayjs from "dayjs";
import "dayjs/locale/ko";

declare global {
  interface Window {
    Kakao?: {
      init: (key: string) => void;
      isInitialized: () => boolean;
      Share: {
        sendDefault: (params: {
          objectType: "feed";
          content: {
            title: string;
            description: string;
            imageUrl: string;
            imageWidth?: number;
            imageHeight?: number;
            link: { mobileWebUrl: string; webUrl: string };
          };
          buttons: Array<{
            title: string;
            link: { mobileWebUrl: string; webUrl: string };
          }>;
        }) => void;
      };
    };
  }
}

interface KakaoShareParams {
  clubName: string;
  tableInfo: string;
  startPrice: number;
  auctionUrl: string;
  thumbnailUrl?: string;
  listingType?: "auction" | "instant";
  isFromMD?: boolean;
  eventDate?: string;
  area?: string;
}

interface UseKakaoShareReturn {
  shareToKakao: (params: KakaoShareParams) => Promise<boolean>;
  isLoading: boolean;
  isAvailable: boolean;
}

export function useKakaoShare(): UseKakaoShareReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const initAttempted = useRef(false);

  useEffect(() => {
    if (initAttempted.current) return;
    initAttempted.current = true;

    const rawKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY || process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID || "";
    const kakaoKey = rawKey.replace(/\\n/g, '').replace(/\n/g, '').replace(/[\r\n"']/g, '').trim();

    if (!kakaoKey) return;

    // 이미 로드된 경우
    if (window.Kakao) {
      if (!window.Kakao.isInitialized()) {
        window.Kakao.init(kakaoKey);
      }
      setIsAvailable(true);
      return;
    }

    // 동적 로딩
    const script = document.createElement("script");
    script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";
    script.async = true;
    script.onload = () => {
      if (window.Kakao && !window.Kakao.isInitialized()) {
        window.Kakao.init(kakaoKey);
      }
      setIsAvailable(true);
    };
    script.onerror = () => {
      setIsAvailable(false);
    };
    document.head.appendChild(script);
  }, []);

  const shareToKakao = useCallback(
    async (params: KakaoShareParams): Promise<boolean> => {
      if (!window.Kakao || !window.Kakao.isInitialized()) return false;

      const isInstant = params.listingType === "instant";
      const isMD = params.isFromMD === true;
      const price = params.startPrice.toLocaleString();
      const fallbackImage = typeof window !== "undefined"
        ? `${window.location.origin}/nightflow-share-fallback.svg`
        : "";

      const dateStr = params.eventDate
        ? dayjs(params.eventDate).locale("ko").format("M/D(dd)")
        : "";

      const title = isMD
        ? `${params.area ? `[${params.area}] ` : ""}${!isInstant && dateStr ? `${dateStr} ` : ""}${params.clubName} ${isInstant ? "오늘특가" : "테이블 경매"}`
        : isInstant
          ? `오늘 ${params.clubName} 어때?`
          : `${dateStr} ${params.clubName} 같이 갈래?`;

      const description = isInstant
        ? (isMD ? `${price}원 | 지금 바로 예약 가능!` : `${price}원 | 나플 특가! 웨이팅 없이 바로 고?`)
        : (isMD ? `시작가 ${price}원 | 경매 시작! 최저가 선점에 도전하세요.` : `${price}원 | 남들보다 싸게 잡을 기회! 지금 비딩 같이 가보자.`);

      const buttonTitle = isInstant
        ? (isMD ? "예약하러 가기" : "예약 정보 확인")
        : (isMD ? "테이블 쟁탈전 참여" : "경매 보러 가기");

      // 유입 경로 추적을 위한 UTM 파라미터 추가
      let trackingUrl = params.auctionUrl;
      try {
        const url = new URL(params.auctionUrl);
        url.searchParams.set("utm_source", "kakao");
        url.searchParams.set("utm_medium", "share");
        url.searchParams.set("utm_campaign", isInstant ? "instant_deal" : "earlybird_auction");
        trackingUrl = url.toString();
      } catch (e) {
        console.error("URL parsing error:", e);
      }

      setIsLoading(true);
      try {
        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title,
            description,
            imageUrl: params.thumbnailUrl || fallbackImage,
            link: {
              mobileWebUrl: trackingUrl,
              webUrl: trackingUrl,
            },
          },
          buttons: [
            {
              title: buttonTitle,
              link: {
                mobileWebUrl: trackingUrl,
                webUrl: trackingUrl,
              },
            },
          ],
        });

        // GA4 이벤트 추적
        const { trackShareKakao } = await import("@/lib/analytics/events");
        trackShareKakao({
          id: params.clubName, // 혹은 auctionId가 params에 있다면 그것을 사용
          clubName: params.clubName,
          listingType: params.listingType || (isInstant ? "instant" : "auction"),
        });

        return true;
      } catch {
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return { shareToKakao, isLoading, isAvailable };
}
