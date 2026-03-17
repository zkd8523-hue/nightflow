import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { user: null, supabase };
  return { user, supabase };
}

// GET: MD 본인 템플릿 조회
export async function GET() {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("auction_templates")
      .select("*, club:clubs(id, name, area)")
      .eq("md_id", user.id)
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error) {
    logger.error("Templates GET error:", error);
    return NextResponse.json({ error: "템플릿 조회에 실패했습니다." }, { status: 500 });
  }
}

// POST: 템플릿 저장
export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { name, club_id, start_price, buy_now_price, includes, duration_minutes } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "템플릿 이름을 입력해주세요." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("auction_templates")
      .insert({
        md_id: user.id,
        name: name.trim(),
        club_id: club_id || null,
        start_price: start_price || null,
        buy_now_price: buy_now_price || null,
        includes: includes || [],
        duration_minutes: duration_minutes || 15,
      })
      .select()
      .single();

    if (error) {
      if (error.message?.includes("템플릿은 최대")) {
        return NextResponse.json({ error: "템플릿은 최대 5개까지 저장할 수 있습니다." }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    logger.error("Templates POST error:", error);
    return NextResponse.json({ error: "템플릿 저장에 실패했습니다." }, { status: 500 });
  }
}

// PATCH: last_used_at 업데이트 또는 이름 수정
export async function PATCH(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { id, name } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "템플릿 ID가 필요합니다." }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ error: "템플릿 이름을 입력해주세요." }, { status: 400 });
      }
      updateData.name = name.trim();
    } else {
      updateData.last_used_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("auction_templates")
      .update(updateData)
      .eq("id", id)
      .eq("md_id", user.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Templates PATCH error:", error);
    return NextResponse.json({ error: "업데이트에 실패했습니다." }, { status: 500 });
  }
}

// DELETE: 템플릿 삭제
export async function DELETE(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "템플릿 ID가 필요합니다." }, { status: 400 });
    }

    const { error } = await supabase
      .from("auction_templates")
      .delete()
      .eq("id", id)
      .eq("md_id", user.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Templates DELETE error:", error);
    return NextResponse.json({ error: "템플릿 삭제에 실패했습니다." }, { status: 500 });
  }
}
