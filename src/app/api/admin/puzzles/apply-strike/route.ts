import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: adminUser } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!adminUser || adminUser.role !== "admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const { offerId } = await req.json();
    if (!offerId) {
      return NextResponse.json({ error: "offerId는 필수입니다" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("admin_apply_puzzle_strike", {
      p_offer_id: offerId,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const result = data as { success: boolean; error?: string };
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
