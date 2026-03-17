import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    const { error } = await supabaseAdmin.rpc("soft_delete_user", {
      p_user_id: user.id,
    });

    if (error) {
      const msg = error.message || "";
      console.error("[DeleteAccount] soft_delete_user error:", msg);

      if (msg.includes("관리자")) {
        return NextResponse.json({ error: msg }, { status: 403 });
      }
      if (msg.includes("활성 경매") || msg.includes("낙찰")) {
        return NextResponse.json({ error: msg }, { status: 409 });
      }
      if (msg.includes("이미 탈퇴")) {
        return NextResponse.json({ error: msg }, { status: 400 });
      }

      return NextResponse.json(
        { error: "계정 삭제 중 오류가 발생했습니다. 고객 문의로 연락해주세요." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DeleteAccount] Unexpected error:", error);
    return NextResponse.json(
      { error: "탈퇴 처리 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
