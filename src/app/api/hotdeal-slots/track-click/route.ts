import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const VALID_TYPES = ["instagram", "openchat", "copy_message"] as const;
type ClickType = (typeof VALID_TYPES)[number];

// 게스트 간판 연락처 클릭 추적 (fire-and-forget)
// 비로그인도 허용. 슬롯 메타(club_id, md_id, week_start)는 서버에서 조회해 비정규화 저장.
export async function POST(req: Request) {
  try {
    const { slotId, clickType } = await req.json();

    if (!slotId || typeof slotId !== "string") {
      return NextResponse.json({ error: "Missing slotId" }, { status: 400 });
    }
    if (!VALID_TYPES.includes(clickType as ClickType)) {
      return NextResponse.json({ error: "Invalid clickType" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const admin = createAdminClient();
    const { data: slot, error: slotErr } = await admin
      .from("weekly_hotdeal_slots")
      .select("id, club_id, md_id, week_start")
      .eq("id", slotId)
      .maybeSingle();

    if (slotErr || !slot) {
      return NextResponse.json({ error: "Slot not found" }, { status: 404 });
    }

    const { error: insertErr } = await admin
      .from("hotdeal_slot_contact_clicks")
      .insert({
        slot_id: slot.id,
        club_id: slot.club_id,
        md_id: slot.md_id,
        week_start: slot.week_start,
        click_type: clickType,
        user_id: user?.id ?? null,
      });

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
