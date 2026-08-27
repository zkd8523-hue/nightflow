import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const source_id: string | undefined = body.source_id;
    const target_id: string | undefined = body.target_id;

    if (!source_id || !target_id) {
      return NextResponse.json({ error: "source_id, target_id가 필요합니다." }, { status: 400 });
    }
    if (source_id === target_id) {
      return NextResponse.json({ error: "동일한 아티스트로는 병합할 수 없습니다." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("merge_artists", {
      p_source_id: source_id,
      p_target_id: target_id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(data);
  } catch (e) {
    console.error("[Admin merge_artists] Error:", e);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
