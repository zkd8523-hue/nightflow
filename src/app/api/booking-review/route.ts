// 손님이 확인서 페이지에서 리뷰를 남길 때 호출된다. 로그인 없이 public_token으로만
// 본인 예약임을 확인한다 — 확인서 링크를 아는 사람만 리뷰를 남길 수 있다.
//
// 외국인 요청과 한국 예약 요청 확인서 모두에서 호출될 수 있다 — booking_confirmations
// 의 request_type으로 원본 테이블을 분기한다(2026-09-06, Migration 654).
//
// 입장 완료(arrival_pings) 여부와 무관하게 항상 리뷰를 받는다. MD가 "입장 완료"를
// 안 눌러도 실제 방문은 끝났을 수 있어서, 이 확인을 리뷰 작성의 필수 조건으로
// 걸면 안 된다.
//
// Body: { public_token: string, rating: number, comment?: string }
// 200: { ok: true }

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  let body: { public_token?: string; rating?: number; comment?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { public_token, rating, comment } = body;
  if (!public_token || !rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "bad_params" }, { status: 400 });
  }

  const sb = createAdminClient();

  const { data: conf, error: confErr } = await sb
    .from("booking_confirmations")
    .select("request_id, club_id, request_type")
    .eq("public_token", public_token)
    .maybeSingle();

  if (confErr || !conf) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: req_ } = await sb
    .from(conf.request_type === "korean" ? "korean_booking_requests" : "foreign_requests")
    .select("assigned_md_id")
    .eq("id", conf.request_id)
    .single();

  const { error: upsertErr } = await sb.from("booking_reviews").upsert(
    {
      request_type: conf.request_type,
      request_id: conf.request_id,
      club_id: conf.club_id,
      md_id: req_?.assigned_md_id ?? null,
      rating,
      comment: comment?.trim() || null,
    },
    { onConflict: "request_type,request_id" }
  );

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
