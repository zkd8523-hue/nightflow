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
        ? `${params.clubName} ${isInstant ? "오늘특가" : "테이블 경매"}`
        : isInstant
          ? `${params.clubName} 특가 떴다!`
          : `${dateStr} ${params.clubName} 같이 갈래?`;

      const description = isInstant
        ? (isMD ? `${price}원 | 지금 바로 예약 가능!` : `${price}원 | 이 가격에 오늘 바로!`)
        : (isMD ? `시작가 ${price}원 | 지금 입찰하세요!` : `시작가 ${price}원 | 입찰 진행 중!`);

      const buttonTitle = isInstant
        ? (isMD ? "예약하러 가기" : "예약 보러 가기")
        : (isMD ? "입찰하러 가기" : "경매 보러 가기");

      setIsLoading(true);
      try {
        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title,
            description,
            imageUrl: params.thumbnailUrl || fallbackImage,
            link: {
              mobileWebUrl: params.auctionUrl,
              webUrl: params.auctionUrl,
            },
          },
          buttons: [
            {
              title: buttonTitle,
              link: {
                mobileWebUrl: params.auctionUrl,
                webUrl: params.auctionUrl,
              },
            },
          ],
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
