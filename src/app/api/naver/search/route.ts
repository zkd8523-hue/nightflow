import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";

/**
 * 주소 검색 API (Kakao Local API 사용)
 * 요청: POST /api/naver/search
 * 본문: { query: "강남역" }
 */
export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID;

    if (!kakaoKey) {
      return NextResponse.json(
        { error: "Kakao API key not configured" },
        { status: 500 }
      );
    }

    const response = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}&size=10`,
      {
        method: "GET",
        headers: {
          Authorization: `KakaoAK ${kakaoKey}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Kakao Address API error:", response.status, errorText);
      return NextResponse.json(
        { error: "Failed to search address" },
        { status: 500 }
      );
    }

    const data = await response.json();

    if (!data.documents || data.documents.length === 0) {
      // 주소 검색 결과 없으면 키워드 검색으로 fallback
      return await searchByKeyword(query, kakaoKey);
    }

    interface KakaoAddressDoc {
      address?: { address_name?: string };
      address_name?: string;
      road_address?: { address_name?: string; zone_no?: string };
      x: string;
      y: string;
    }
    const results = (data.documents as KakaoAddressDoc[]).map((doc) => ({
      address: doc.address?.address_name || doc.address_name,
      roadAddress: doc.road_address?.address_name || doc.address_name,
      zipcode: doc.road_address?.zone_no || "",
      x: parseFloat(doc.x),
      y: parseFloat(doc.y),
    }));

    return NextResponse.json(results);
  } catch (error) {
    logger.error("Search API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * 키워드 검색 fallback (건물명, 장소명 등)
 */
async function searchByKeyword(query: string, kakaoKey: string) {
  const response = await fetch(
    `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=10`,
    {
      method: "GET",
      headers: {
        Authorization: `KakaoAK ${kakaoKey}`,
      },
    }
  );

  if (!response.ok) {
    return NextResponse.json([]);
  }

  const data = await response.json();

  if (!data.documents || data.documents.length === 0) {
    return NextResponse.json([]);
  }

  interface KakaoKeywordDoc {
    address_name?: string;
    road_address_name?: string;
    x: string;
    y: string;
  }
  const results = (data.documents as KakaoKeywordDoc[]).map((doc) => ({
    address: doc.address_name,
    roadAddress: doc.road_address_name || doc.address_name,
    zipcode: "",
    x: parseFloat(doc.x),
    y: parseFloat(doc.y),
  }));

  return NextResponse.json(results);
}
