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

    const { error } = await supabaseAdmin.rpc("restore_user_account", {
      p_user_id: user.id,
    });

    if (error) {
      const msg = error.message || "";
      console.error("[RestoreAccount] restore_user_account error:", msg);

      if (msg.includes("만료")) {
        return NextResponse.json({ error: msg }, { status: 410 });
      }
      if (msg.includes("탈퇴 처리되지 않은")) {
        return NextResponse.json({ error: msg }, { status: 400 });
      }

      return NextResponse.json(
        { error: "계정 복구 중 오류가 발생했습니다" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RestoreAccount] Unexpected error:", error);
    return NextResponse.json(
      { error: "복구 처리 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
