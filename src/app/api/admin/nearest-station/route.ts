import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

/**
 * 클럽 좌표 기준 가장 가까운 지하철역 + 도보 분.
 * Kakao Local API (category_group_code=SW8) 사용.
 * 도보 분 = 직선거리 / 67m/min (보행 속도 대략치).
 *
 * MD/admin 인증 필요 (핫딜 등록 흐름에서 사용).
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
          setAll(c) {
            c.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { user: authUser },
    } = await supabaseAuth.auth.getUser();
    if (!authUser)
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", authUser.id)
      .single();
    if (!userRow || (userRow.role !== "md" && userRow.role !== "admin"))
      return NextResponse.json(
        { error: "파트너 권한이 필요합니다." },
        { status: 403 }
      );

    const { clubId } = (await request.json()) as { clubId?: string };
    if (!clubId)
      return NextResponse.json({ error: "clubId 누락" }, { status: 400 });

    const { data: club, error: clubErr } = await supabaseAdmin
      .from("clubs")
      .select("latitude, longitude")
      .eq("id", clubId)
      .single();
    if (clubErr || !club || !club.latitude || !club.longitude)
      return NextResponse.json(
        { error: "클럽 좌표가 등록되지 않았어요" },
        { status: 404 }
      );

    const key = process.env.KAKAO_REST_API_KEY;
    if (!key)
      return NextResponse.json(
        { error: "KAKAO_REST_API_KEY 미설정" },
        { status: 500 }
      );

    // 카카오 Local API — 카테고리 검색 (SW8 = 지하철역)
    const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=SW8&x=${club.longitude}&y=${club.latitude}&radius=1500&sort=distance`;
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${key}` },
    });
    if (!res.ok)
      return NextResponse.json(
        { error: `kakao ${res.status}` },
        { status: 502 }
      );

    type KakaoDoc = {
      place_name: string;
      distance: string; // 미터, 문자열
    };
    const json = (await res.json()) as { documents?: KakaoDoc[] };
    const first = json.documents?.[0];
    if (!first)
      return NextResponse.json(
        { error: "1.5km 안에 지하철역을 찾을 수 없어요" },
        { status: 404 }
      );

    // "강남역" → "강남" (역 글자 제거)
    const station = first.place_name.replace(/역$/, "");
    const meters = Number(first.distance);
    const walkMinutes = Math.max(1, Math.round(meters / 67));

    return NextResponse.json({
      station,
      walk_minutes: walkMinutes,
      distance_m: meters,
    });
  } catch (err) {
    console.error("[admin/nearest-station]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
