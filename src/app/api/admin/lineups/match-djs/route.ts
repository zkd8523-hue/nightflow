import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { normalizeDjName } from "@/lib/lineups/djName";

// 포스터 원문 DJ 표기 배열 → dj_aliases 매칭. 검토 큐/편집기에서 DJ 목록이
// 바뀔 때마다(재검색, 별칭 추가 직후 재확인 등) 호출한다.

export async function POST(req: NextRequest) {
  let body: { names?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const names = body.names;
  if (!Array.isArray(names) || names.some((n) => typeof n !== "string")) {
    return NextResponse.json({ error: "names must be a string array" }, { status: 400 });
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
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "인증이 필요해요" }, { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "관리자 권한이 필요해요" }, { status: 403 });
  }

  const normalizedNames = names.map((n: string) => normalizeDjName(n));
  const { data: aliasRows, error: queryError } = await supabaseAdmin
    .from("dj_aliases")
    .select("normalized, dj_id, djs(display_name)")
    .in("normalized", normalizedNames.filter(Boolean));

  if (queryError) {
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }

  const aliasMap = new Map(
    (aliasRows ?? []).map((a) => [
      a.normalized,
      { djId: a.dj_id as string, displayName: (a.djs as unknown as { display_name: string } | null)?.display_name ?? null },
    ])
  );

  const results = names.map((raw: string, i: number) => {
    const match = aliasMap.get(normalizedNames[i]);
    return {
      raw,
      normalized: normalizedNames[i],
      djId: match?.djId ?? null,
      displayName: match?.displayName ?? null,
    };
  });

  return NextResponse.json({ results }, { status: 200 });
}
