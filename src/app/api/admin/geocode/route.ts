import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

/**
 * 주소 → 좌표 변환 (Kakao Local Search API 프록시)
 * Admin 전용. REST 키 서버 보관.
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll(c) { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
        },
      }
    );

    const { data: { user: authUser }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !authUser) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: userRow } = await supabaseAdmin.from("users").select("role").eq("id", authUser.id).single();
    if (!userRow || userRow.role !== "admin") return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

    const { address } = await request.json() as { address?: string };
    if (!address?.trim()) return NextResponse.json({ error: "address 누락" }, { status: 400 });

    const key = process.env.KAKAO_REST_API_KEY;
    if (!key) return NextResponse.json({ error: "KAKAO_REST_API_KEY 미설정" }, { status: 500 });

    // 1차: 주소 검색
    const addrUrl = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address.trim())}`;
    const addrRes = await fetch(addrUrl, { headers: { Authorization: `KakaoAK ${key}` } });
    if (!addrRes.ok) return NextResponse.json({ error: `kakao ${addrRes.status}` }, { status: 502 });
    const addrJson = await addrRes.json() as { documents?: Array<{ x: string; y: string }> };

    if (addrJson.documents && addrJson.documents.length > 0) {
      const d = addrJson.documents[0];
      return NextResponse.json({ lat: Number(d.y), lng: Number(d.x), source: "address" });
    }

    // 2차: 키워드 검색 (도로명/지번 인식 실패 시 매장명/장소명 fallback)
    const kwUrl = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(address.trim())}`;
    const kwRes = await fetch(kwUrl, { headers: { Authorization: `KakaoAK ${key}` } });
    if (!kwRes.ok) return NextResponse.json({ error: `kakao keyword ${kwRes.status}` }, { status: 502 });
    const kwJson = await kwRes.json() as { documents?: Array<{ x: string; y: string }> };

    if (kwJson.documents && kwJson.documents.length > 0) {
      const d = kwJson.documents[0];
      return NextResponse.json({ lat: Number(d.y), lng: Number(d.x), source: "keyword" });
    }

    return NextResponse.json({ error: "좌표를 찾을 수 없습니다" }, { status: 404 });
  } catch (err) {
    console.error("[admin/geocode]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
