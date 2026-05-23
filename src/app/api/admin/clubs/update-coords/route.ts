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

    const { clubId, lat, lng } = await request.json() as { clubId: string; lat: number | null; lng: number | null };
    if (!clubId) return NextResponse.json({ error: "clubId 누락" }, { status: 400 });

    const { error } = await supabaseAdmin
      .from("clubs")
      .update({ latitude: lat, longitude: lng })
      .eq("id", clubId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/clubs/update-coords]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
