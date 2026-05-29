import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Result = "success" | "fail" | "gender_gate" | "login_required";
const ALLOWED: Result[] = ["success", "fail", "gender_gate", "login_required"];

export async function POST(req: Request) {
  let body: { auction_id?: string; result?: Result; error_code?: string; client_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const { auction_id, result, error_code, client_id } = body;
  if (!auction_id || !result || !ALLOWED.includes(result)) {
    return NextResponse.json({ ok: false, error: "INVALID_PARAMS" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const user_agent = req.headers.get("user-agent")?.slice(0, 500) ?? null;

  const { error } = await supabase.from("share_join_clicks").insert({
    auction_id,
    user_id: user?.id ?? null,
    client_id: client_id ?? null,
    result,
    error_code: error_code ?? null,
    user_agent,
  });

  if (error) {
    // 분석 로그가 본 흐름을 깨면 안 됨 — 200으로 silently 처리
    console.error("[share/click] insert failed:", error.message);
    return NextResponse.json({ ok: false, logged: false });
  }

  return NextResponse.json({ ok: true });
}
