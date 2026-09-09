// 이탈 이벤트(foreign_page_exit) 전용 수집 엔드포인트.
//
// 왜 Supabase REST로 바로 안 쏘나: 이탈 시점엔 navigator.sendBeacon만 전송이
// 보장되는데, 크롬은 다른 도메인으로 가는 sendBeacon에 application/json Blob을
// 붙이면 SecurityError를 던진다(CORS 안전 목록 밖 Content-Type은 preflight가
// 필요한데 페이지가 죽는 시점이라 못 기다림). 그래서 sendBeacon 전환(b853c35d)
// 후에도 foreign_page_exit이 계속 0건이었다(2026-09-09 확인, 843건 중 0).
//
// 같은 도메인(/api/track)이면 CORS 자체가 없다. 본문은 text/plain 문자열로
// 받아 여기서 JSON 파싱 후 service role로 user_events에 넣는다.
//
// Body(text/plain): JSON 문자열 — trackUserEventBeacon()이 만드는 형태 그대로
// 204: 저장됨 / 400: 형식 오류 / 403: 허용되지 않은 이벤트명

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 이 경로는 인증이 없으므로 아무 이벤트나 꽂히지 않게 이름을 제한한다.
// 이탈 계측 외에 필요해지면 여기에 추가.
const ALLOWED_EVENTS = new Set(["foreign_page_exit"]);
const MAX_BODY_BYTES = 8 * 1024;

const str = (v: unknown, max = 512): string | null =>
  typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;

export async function POST(req: NextRequest) {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "unreadable" }, { status: 400 });
  }
  if (!raw || raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "bad_size" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const eventName = str(body.event_name, 64);
  const anonId = str(body.anon_id, 128);
  const sessionId = str(body.session_id, 128);
  if (!eventName || !anonId || !sessionId) {
    return NextResponse.json({ error: "bad_params" }, { status: 400 });
  }
  if (!ALLOWED_EVENTS.has(eventName)) {
    return NextResponse.json({ error: "event_not_allowed" }, { status: 403 });
  }

  const properties =
    body.properties && typeof body.properties === "object" && !Array.isArray(body.properties)
      ? (body.properties as Record<string, unknown>)
      : {};

  const sb = createAdminClient();
  const { error } = await sb.from("user_events").insert({
    anon_id: anonId,
    user_id: null,
    session_id: sessionId,
    event_name: eventName,
    utm_source: str(body.utm_source, 64),
    utm_medium: str(body.utm_medium, 64),
    utm_campaign: str(body.utm_campaign, 128),
    referrer: str(body.referrer, 1024),
    landing_path: str(body.landing_path, 512),
    path: str(body.path, 512),
    device_type: str(body.device_type, 16),
    lang: str(body.lang, 8),
    properties,
  });

  if (error) {
    // 계측 실패는 조용히 — 호출 쪽(sendBeacon)은 응답을 안 읽는다
    console.error("[api/track] insert failed:", error.message);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
