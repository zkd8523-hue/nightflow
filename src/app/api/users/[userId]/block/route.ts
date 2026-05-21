import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type RouteContext = { params: Promise<{ userId: string }> };

const VALID_REASONS = [
  "inappropriate_content",
  "scam_suspect",
  "harassment",
  "spam",
  "other",
] as const;
type BlockReason = (typeof VALID_REASONS)[number];

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all) =>
          all.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { userId: targetId } = await params;
  const supabase = await getSupabase();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (targetId === user.id) {
    return NextResponse.json({ error: "자기 자신을 차단할 수 없습니다" }, { status: 400 });
  }

  // 이미 차단 중이면 해제 (토글)
  const { data: existing } = await supabase
    .from("user_blocks")
    .select("id")
    .eq("blocker_id", user.id)
    .eq("blocked_id", targetId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("user_blocks")
      .delete()
      .eq("id", existing.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ blocked: false });
  }

  // 신규 차단 — 사유 필수
  let reason: BlockReason = "other";
  let memo: string | null = null;
  try {
    const body = await req.json();
    if (body?.reason && VALID_REASONS.includes(body.reason)) {
      reason = body.reason as BlockReason;
    } else if (body?.reason) {
      return NextResponse.json({ error: "유효하지 않은 사유입니다" }, { status: 400 });
    }
    if (typeof body?.memo === "string" && body.memo.trim()) {
      memo = body.memo.trim().slice(0, 500);
    }
  } catch {
    // body 없음 — 기본값 사용
  }

  if (reason === "other" && !memo) {
    return NextResponse.json({ error: "기타 사유는 메모가 필요합니다" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_blocks")
    .insert({ blocker_id: user.id, blocked_id: targetId, reason, memo });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ blocked: true });
}

// 현재 차단 상태 조회
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { userId } = await params;
  const supabase = await getSupabase();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ blocked: false });

  const { data } = await supabase
    .from("user_blocks")
    .select("id")
    .eq("blocker_id", user.id)
    .eq("blocked_id", userId)
    .maybeSingle();

  return NextResponse.json({ blocked: !!data });
}
