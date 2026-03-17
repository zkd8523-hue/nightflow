/**
 * 네이버맵 API 스크립트 동적 로드
 * 한 번만 로드되도록 캐싱함
 */

import { logger } from "@/lib/utils/logger";

let naverMapScriptLoaded = false;

export async function loadNaverMap(): Promise<void> {
  if (naverMapScriptLoaded) {
    return;
  }

  return new Promise((resolve, reject) => {
    // 이미 로드됨 확인
    if (window.naver && window.naver.maps) {
      naverMapScriptLoaded = true;
      resolve();
      return;
    }

    const clientId = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID;
    if (!clientId) {
      reject(new Error("NEXT_PUBLIC_NAVER_CLIENT_ID is not configured"));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${clientId}&submodules=geocoder`;
    script.async = true;
    script.onload = () => {
      naverMapScriptLoaded = true;
      resolve();
    };
    script.onerror = () => {
      reject(new Error("Failed to load Naver Map API"));
    };

    document.head.appendChild(script);
  });
}

/**
 * 주소를 좌표로 변환 (Geocoding)
 * 서버사이드에서만 사용 가능
 */
export async function geocodeAddress(address: string): Promise<{
  lat: number;
  lng: number;
  name: string;
} | null> {
  try {
    const response = await fetch("/api/naver/geocode", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ address }),
    });

    if (!response.ok) {
      throw new Error("Geocoding failed");
    }

    return await response.json();
  } catch (error) {
    logger.error("Geocoding error:", error);
    return null;
  }
}

/**
 * 클럽 이름으로 검색 (Naver Search API)
 */
export async function searchClub(clubName: string): Promise<{
  lat: number;
  lng: number;
  name: string;
  address: string;
} | null> {
  try {
    const response = await fetch("/api/naver/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: clubName }),
    });

    if (!response.ok) {
      throw new Error("Search failed");
    }

    return await response.json();
  } catch (error) {
    logger.error("Search error:", error);
    return null;
  }
}
