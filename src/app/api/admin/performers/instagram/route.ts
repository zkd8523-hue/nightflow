import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * DJ / 아티스트의 인스타그램 핸들 저장.
 *
 * 클럽 레지던트 DJ는 공개 DB(RA·나무위키)에 정리된 곳이 없고 웹 검색으로도
 * 동명 브랜드가 섞여 나온다 — 결국 사람이 확인해서 넣는 게 가장 정확하다.
 * 이 라우트는 그 수동 입력 경로다. 자동 수집(캡션 @태그)과 공존한다.
 *
 * kind: "dj" → djs 테이블 / "artist" → artists 테이블
 * instagram 이 빈 문자열이면 연결 해제(null)로 처리한다.
 */
export async function POST(req: Request) {
  try {
    const { kind, id, instagram } = await req.json();
    if (!id || (kind !== "dj" && kind !== "artist")) {
      return NextResponse.json({ error: "kind, id는 필수입니다." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll(c) {
            c.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          },
        },
      }
    );
    const {
      data: { user: authUser },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !authUser) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", authUser.id)
      .single();
    if (!userRow || userRow.role !== "admin") {
      return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
    }

    // URL 통째로 붙여넣어도 핸들만 뽑아 저장한다 (clubs.instagram 규약과 동일)
    const handle = String(instagram ?? "")
      .trim()
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
      .replace(/^@/, "")
      .replace(/[/?#].*$/, "")
      .trim();

    const table = kind === "dj" ? "djs" : "artists";
    const { error } = await supabaseAdmin
      .from(table)
      .update({ instagram: handle || null })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, instagram: handle || null });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
