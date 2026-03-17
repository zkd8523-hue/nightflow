import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";

interface NaverGeocodeResponse {
  status: string;
  meta: {
    totalCount: number;
  };
  addresses: Array<{
    roadAddress: string;
    jibunAddress: string;
    englishAddress: string;
    addressElements: Array<{
      types: string[];
      longName: string;
      shortName: string;
      code: string;
    }>;
    x: string; // 경도
    y: string; // 위도
    distance: number;
  }>;
}

/**
 * 주소를 좌표로 변환 (지오코딩)
 * 요청: POST /api/naver/geocode
 * 본문: { address: "서울시 강남구 테헤란로" }
 */
export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json();

    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400 }
      );
    }

    const clientId = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Naver API credentials not configured" },
        { status: 500 }
      );
    }

    // 네이버 지오코딩 API 호출
    const geocodeResponse = await fetch(
      `https://naveropenapi.apigw.ntruss.com/map-geocoding/v2/geocode?query=${encodeURIComponent(
        address
      )}`,
      {
        method: "GET",
        headers: {
          "X-NCP-APIGW-API-KEY-ID": clientId,
          "X-NCP-APIGW-API-KEY": clientSecret,
        },
      }
    );

    if (!geocodeResponse.ok) {
      logger.error(
        "Naver Geocoding API error:",
        geocodeResponse.status,
        geocodeResponse.statusText
      );
      return NextResponse.json(
        { error: "Failed to geocode address" },
        { status: 500 }
      );
    }

    const data: NaverGeocodeResponse = await geocodeResponse.json();

    if (!data.addresses || data.addresses.length === 0) {
      return NextResponse.json(
        { error: "Address not found" },
        { status: 404 }
      );
    }

    const result = data.addresses[0];
    const lng = parseFloat(result.x);
    const lat = parseFloat(result.y);

    return NextResponse.json({
      address: result.roadAddress || result.jibunAddress,
      lat: parseFloat(lat.toFixed(6)),
      lng: parseFloat(lng.toFixed(6)),
    });
  } catch (error) {
    logger.error("Geocoding API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
