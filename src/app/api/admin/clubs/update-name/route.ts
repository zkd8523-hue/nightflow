import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

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

    const { clubId, name, address, operating_hours, entry_fee_detail, instagram, aliases, drink_menu_url, drink_menu_urls, floor_plan_urls } = await request.json() as {
      clubId: string;
      name?: string;
      address?: string;
      operating_hours?: string | null;
      entry_fee_detail?: string | null;
      instagram?: string | null;
      aliases?: string[];
      drink_menu_url?: string | null;
      drink_menu_urls?: string[];
      floor_plan_urls?: string[];
    };
    if (!clubId) return NextResponse.json({ error: "clubId 누락" }, { status: 400 });

    const patch: Record<string, string | string[] | null> = {};
    if (name?.trim()) patch.name = name.trim();
    if (address?.trim()) patch.address = address.trim();
    if (operating_hours !== undefined) patch.operating_hours = operating_hours?.trim() || null;
    if (entry_fee_detail !== undefined) patch.entry_fee_detail = entry_fee_detail?.trim() || null;
    if (instagram !== undefined) patch.instagram = instagram?.trim() || null;
    if (drink_menu_urls !== undefined) {
      const cleaned = Array.from(new Set((drink_menu_urls || []).map((u) => (u || "").trim()).filter(Boolean)));
      patch.drink_menu_urls = cleaned;
      // 하위 호환: 첫 번째 URL을 drink_menu_url에 미러링 (구 클라이언트 노출 보장)
      patch.drink_menu_url = cleaned[0] ?? null;
      patch.drink_menu_updated_at = cleaned.length > 0 ? new Date().toISOString() : null;
    } else if (drink_menu_url !== undefined) {
      const trimmed = drink_menu_url?.trim() || null;
      patch.drink_menu_url = trimmed;
      patch.drink_menu_urls = trimmed ? [trimmed] : [];
      patch.drink_menu_updated_at = trimmed ? new Date().toISOString() : null;
    }
    if (floor_plan_urls !== undefined) {
      const cleaned = Array.from(new Set((floor_plan_urls || []).map((u) => (u || "").trim()).filter(Boolean)));
      patch.floor_plan_urls = cleaned;
      // 하위 호환: 첫 번째 URL을 floor_plan_url에 미러링
      patch.floor_plan_url = cleaned[0] ?? null;
    }
    if (aliases !== undefined) {
      // 빈 문자열·중복·대소문자 통일
      const cleaned = Array.from(
        new Set(
          (aliases || [])
            .map((a) => (a || "").toLowerCase().trim().replace(/\s+/g, " "))
            .filter((a) => a.length > 0)
        )
      );
      patch.aliases = cleaned;
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ success: true });

    const { error } = await supabaseAdmin.from("clubs").update(patch).eq("id", clubId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/clubs/update-name]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
