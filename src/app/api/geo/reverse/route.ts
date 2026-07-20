import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

/**
 * 좌표 → 주소 (Kakao Local coord2address 프록시)
 * 채팅 "내 위치 보내기"에서 사용. REST 키는 서버에만 둔다.
 * 로그인 사용자만 호출 가능 (키 남용 방지).
 */
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(c) {
          c.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { latitude, longitude } = (await request.json()) as {
    latitude?: number;
    longitude?: number;
  };
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return NextResponse.json({ error: "좌표 누락" }, { status: 400 });
  }

  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "KAKAO_REST_API_KEY 미설정" },
      { status: 500 }
    );
  }

  const url = `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${longitude}&y=${latitude}`;
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${key}` },
  });
  if (!res.ok) {
    return NextResponse.json({ error: `kakao ${res.status}` }, { status: 502 });
  }
  const json = (await res.json()) as {
    documents?: Array<{
      road_address?: { address_name?: string } | null;
      address?: { address_name?: string } | null;
    }>;
  };
  const doc = json.documents?.[0];
  const address =
    doc?.road_address?.address_name ?? doc?.address?.address_name ?? null;

  return NextResponse.json({ address });
}
