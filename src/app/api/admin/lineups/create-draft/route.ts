import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

// 제보를 파싱 없이(0원) 검토 큐로 보내는 경로 — "직접 입력".
// Vision을 안 태우므로 parsed/normalized는 비운 채 만든다. 편집 화면(DraftEditView)이
// rows=[]로 열려도 "+ 행 추가"로 완전히 손으로 채울 수 있게 이미 되어 있다.
export async function POST(req: NextRequest) {
  let body: { clubId?: unknown; sourceReportId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { clubId, sourceReportId } = body;
  if (typeof clubId !== "string" || !clubId) {
    return NextResponse.json({ error: "clubId required" }, { status: 400 });
  }
  if (sourceReportId !== undefined && sourceReportId !== null && typeof sourceReportId !== "string") {
    return NextResponse.json({ error: "sourceReportId must be a string when provided" }, { status: 400 });
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
  const { data: profile } = await supabaseAdmin.from("users").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "관리자 권한이 필요해요" }, { status: 403 });
  }

  const { data: draft, error: insertError } = await supabaseAdmin
    .from("lineup_drafts")
    .insert({
      club_id: clubId,
      origin: sourceReportId ? "report" : "manual",
      source_report_id: (sourceReportId as string | undefined) ?? null,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !draft) {
    return NextResponse.json({ error: "draft 생성 실패" }, { status: 500 });
  }
  return NextResponse.json({ draftId: draft.id });
}
