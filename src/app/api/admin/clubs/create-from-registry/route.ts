import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * /admin/club-discovery 발굴 목록에서 클럽을 즉시 생성.
 * club_name_registry 1건을 받아 clubs에 INSERT하고, registry를
 * matched_club_id로 연결(status='matched') + 해당 club_events.club_id도 채운다.
 *
 * Admin 전용. venue_type='venue'|'other'인 건(공연장 등)은 클럽이 아니므로
 * 클라이언트에서 애초에 버튼을 노출하지 않지만, 서버에서도 재검증한다.
 */
export async function POST(req: Request) {
  try {
    const { registryId, area, instagram } = await req.json();
    if (!registryId || !area) {
      return NextResponse.json({ error: "registryId, area는 필수입니다." }, { status: 400 });
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

    const { data: userRow } = await supabaseAdmin.from("users").select("role").eq("id", authUser.id).single();
    if (!userRow || userRow.role !== "admin") {
      return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
    }

    const { data: registry, error: regErr } = await supabaseAdmin
      .from("club_name_registry")
      .select("*")
      .eq("id", registryId)
      .single();
    if (regErr || !registry) {
      return NextResponse.json({ error: "발굴 항목을 찾을 수 없습니다." }, { status: 404 });
    }
    if (registry.venue_type === "venue" || registry.venue_type === "other") {
      return NextResponse.json({ error: "클럽이 아닌 장소(공연장 등)는 등록할 수 없습니다." }, { status: 400 });
    }
    if (registry.matched_club_id) {
      return NextResponse.json({ error: "이미 클럽에 연결되어 있습니다." }, { status: 400 });
    }

    const handle = (instagram ?? "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "");

    const { data: newClub, error: insErr } = await supabaseAdmin
      .from("clubs")
      .insert({
        name: registry.name_raw,
        area,
        instagram: handle || null,
        status: "approved",
      })
      .select("id")
      .single();
    if (insErr || !newClub) {
      return NextResponse.json({ error: `클럽 생성 실패: ${insErr?.message}` }, { status: 500 });
    }

    await supabaseAdmin
      .from("club_name_registry")
      .update({ matched_club_id: newClub.id, status: "matched", instagram_handle: handle || null })
      .eq("id", registryId);

    await supabaseAdmin
      .from("club_events")
      .update({ club_id: newClub.id })
      .eq("club_name_raw", registry.name_raw)
      .is("club_id", null);

    return NextResponse.json({ success: true, clubId: newClub.id });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
