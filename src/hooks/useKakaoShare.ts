"use client";

import { useState, useCallback, useEffect, useRef } from "react";

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

interface UseKakaoShareReturn {
  shareToKakao: (params: {
    clubName: string;
    tableInfo: string;
    startPrice: number;
    auctionUrl: string;
    shareImageUrl: string;
  }) => Promise<boolean>;
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

    const kakaoKey =
      process.env.NEXT_PUBLIC_KAKAO_JS_KEY ||
      process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID;

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
    async (params: {
      clubName: string;
      tableInfo: string;
      startPrice: number;
      auctionUrl: string;
      shareImageUrl: string;
    }): Promise<boolean> => {
      if (!window.Kakao || !window.Kakao.isInitialized()) return false;

      setIsLoading(true);
      try {
        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: `${params.clubName} ${params.tableInfo} 테이블 경매`,
            description: `시작가 ${params.startPrice.toLocaleString()}원 | 지금 입찰하세요!`,
            imageUrl: params.shareImageUrl,
            imageWidth: 1200,
            imageHeight: 630,
            link: {
              mobileWebUrl: params.auctionUrl,
              webUrl: params.auctionUrl,
            },
          },
          buttons: [
            {
              title: "경매 참여하기",
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
