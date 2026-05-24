import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * 좌표(latitude/longitude)가 NULL인 클럽 전체에 대해
 * 주소 → 좌표 변환을 일괄 수행하고 저장.
 *
 * Admin 전용. Kakao Local Search API 사용.
 * Rate limit 고려해 순차 처리 + 각 호출 사이 100ms.
 */
export async function POST() {
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
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !authUser)
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
    if (!userRow || userRow.role !== "admin")
      return NextResponse.json(
        { error: "관리자 권한이 필요합니다." },
        { status: 403 }
      );

    const key = process.env.KAKAO_REST_API_KEY;
    if (!key)
      return NextResponse.json(
        { error: "KAKAO_REST_API_KEY 미설정" },
        { status: 500 }
      );

    // 좌표 비어있는 클럽만
    const { data: clubs, error: fetchError } = await supabaseAdmin
      .from("clubs")
      .select("id, name, address")
      .is("deleted_at", null)
      .or("latitude.is.null,longitude.is.null");

    if (fetchError)
      return NextResponse.json(
        { error: fetchError.message },
        { status: 500 }
      );

    type Result = {
      id: string;
      name: string;
      status: "ok" | "no_address" | "not_found" | "error";
      source?: "address" | "keyword";
      error?: string;
    };

    const results: Result[] = [];

    for (const club of clubs ?? []) {
      const addr = (club.address ?? "").trim();
      if (!addr) {
        results.push({ id: club.id, name: club.name, status: "no_address" });
        continue;
      }

      try {
        const coord = await geocodeWithKakao(addr, key);
        if (!coord) {
          results.push({ id: club.id, name: club.name, status: "not_found" });
        } else {
          const { error: updateError } = await supabaseAdmin
            .from("clubs")
            .update({ latitude: coord.lat, longitude: coord.lng })
            .eq("id", club.id);
          if (updateError) {
            results.push({
              id: club.id,
              name: club.name,
              status: "error",
              error: updateError.message,
            });
          } else {
            results.push({
              id: club.id,
              name: club.name,
              status: "ok",
              source: coord.source,
            });
          }
        }
      } catch (err) {
        results.push({
          id: club.id,
          name: club.name,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Kakao API rate limit 완충 (10 req/sec)
      await sleep(120);
    }

    const summary = {
      total: results.length,
      ok: results.filter((r) => r.status === "ok").length,
      not_found: results.filter((r) => r.status === "not_found").length,
      no_address: results.filter((r) => r.status === "no_address").length,
      error: results.filter((r) => r.status === "error").length,
    };

    return NextResponse.json({ success: true, summary, results });
  } catch (err) {
    console.error("[admin/clubs/geocode-missing]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

async function geocodeWithKakao(
  address: string,
  key: string
): Promise<{ lat: number; lng: number; source: "address" | "keyword" } | null> {
  // 1차: 주소 검색
  const addrUrl = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`;
  const addrRes = await fetch(addrUrl, {
    headers: { Authorization: `KakaoAK ${key}` },
  });
  if (addrRes.ok) {
    const j = (await addrRes.json()) as {
      documents?: Array<{ x: string; y: string }>;
    };
    if (j.documents && j.documents.length > 0) {
      const d = j.documents[0];
      return { lat: Number(d.y), lng: Number(d.x), source: "address" };
    }
  }

  // 2차: 키워드 fallback
  const kwUrl = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(address)}`;
  const kwRes = await fetch(kwUrl, {
    headers: { Authorization: `KakaoAK ${key}` },
  });
  if (kwRes.ok) {
    const j = (await kwRes.json()) as {
      documents?: Array<{ x: string; y: string }>;
    };
    if (j.documents && j.documents.length > 0) {
      const d = j.documents[0];
      return { lat: Number(d.y), lng: Number(d.x), source: "keyword" };
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
