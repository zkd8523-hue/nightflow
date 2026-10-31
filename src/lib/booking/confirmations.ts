// 예약 확인서 저장 공용(2026-11-01) — 운영자 저장(/api/admin/booking)과 자동 발급(손님 자리 선택 →
// 담당자 재확인, 당일 배정 승인, 밀림 유지)이 같은 규칙으로 확인서를 만든다.
//
// 이미 확인서가 있으면 ref_no·토큰을 유지한다(손님에게 이미 보낸 번호가 바뀌면 안 된다).
// 금액·자리·구성이 바뀌면 변경 이력(booking_confirmation_changes, Migration 704)을 남기고
// 손님 확인서에 "Updated" 안내 문장(last_change_note)을 붙인다 — 예전엔 조용히 덮어써져 이전 가격이 사라졌다.

import type { SupabaseClient } from "@supabase/supabase-js";

// 클럽명 단어별 첫 글자 이니셜 (예: "Club Ace" → "CA"). "Club"으로 시작하는
// 클럽이 8개나 있어 앞 2자 그대로 쓰면("CL") 전부 겹친다. 단어가 1개뿐이면
// 그 단어 앞 2자를 쓴다(예: "Fountain" → "FO"). 영문 이니셜을 못 뽑으면(한글
// 이름) NF로 폴백한다.
export function clubPrefix(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const initials = words.map((w) => w.replace(/[^A-Za-z]/g, "")[0] ?? "").join("");
  if (initials.length >= 2) return initials.slice(0, 2).toUpperCase();

  const ascii = name.replace(/[^A-Za-z]/g, "");
  if (ascii.length >= 2) return ascii.slice(0, 2).toUpperCase();
  return "NF";
}

export type ConfirmationFields = {
  club_id: string | null;
  table_info: string | null;
  capacity_note?: string | null;
  confirmed_group_size: string | null;
  includes: string[];
  total_price: number | null;
  arrival_time?: string | null;
  guest_request?: string | null;
  internal_memo?: string | null;
};

export type SavedConfirmation = { ref_no: string; public_token: string; md_token: string; changed: boolean };

const TRACKED = ["table_info", "total_price", "includes"] as const;

export async function saveConfirmation(
  sb: SupabaseClient,
  o: {
    requestType: "foreign" | "korean";
    requestId: string;
    fields: ConfirmationFields;
    createdBy: string | null;
    /** 변경 이력 출처 — admin(운영자 수정) | bump_kept(밀림 유지) | auto(자동 발급) */
    source: "admin" | "bump_kept" | "auto";
    /** 바뀌었을 때 손님 확인서에 붙일 안내 문장(영어/한국어는 호출부가 고른다) */
    changeNote?: string | null;
    changeReason?: string | null;
  },
): Promise<SavedConfirmation> {
  const { requestType, requestId, fields } = o;

  let clubName = "";
  if (fields.club_id) {
    const { data: club } = await sb.from("clubs").select("name").eq("id", fields.club_id).single();
    clubName = club?.name ?? "";
  }

  const { data: existing } = await sb
    .from("booking_confirmations")
    .select("id, ref_no, public_token, md_token, table_info, total_price, includes")
    .eq("request_type", requestType)
    .eq("request_id", requestId)
    .maybeSingle();

  const refNo =
    existing?.ref_no ?? `${clubPrefix(clubName || "NightFlow")}-${String(Math.floor(1000 + Math.random() * 9000))}`;

  // 바뀐 칸이 있는지 — 처음 발급은 변경이 아니다.
  const before = existing
    ? { table_info: existing.table_info ?? null, total_price: existing.total_price ?? null, includes: existing.includes ?? [] }
    : null;
  const after = { table_info: fields.table_info, total_price: fields.total_price, includes: fields.includes };
  const changed =
    !!before &&
    TRACKED.some((k) => JSON.stringify((before as Record<string, unknown>)[k] ?? null) !== JSON.stringify((after as Record<string, unknown>)[k] ?? null));

  const payload: Record<string, unknown> = {
    request_type: requestType,
    request_id: requestId,
    club_id: fields.club_id,
    ref_no: refNo,
    table_info: fields.table_info,
    capacity_note: fields.capacity_note ?? null,
    confirmed_group_size: fields.confirmed_group_size,
    includes: fields.includes ?? [],
    total_price: fields.total_price,
    arrival_time: fields.arrival_time ?? null,
    guest_request: fields.guest_request ?? null,
    internal_memo: fields.internal_memo ?? null,
    created_by: o.createdBy,
  };
  if (changed) {
    payload.last_changed_at = new Date().toISOString();
    payload.last_change_note = o.changeNote ?? null;
  }

  const { data: saved, error } = await sb
    .from("booking_confirmations")
    .upsert(payload, { onConflict: "request_type,request_id" })
    .select("ref_no, public_token, md_token")
    .single();
  if (error || !saved) throw new Error(error?.message ?? "save_failed");

  if (changed) {
    const { error: hErr } = await sb.from("booking_confirmation_changes").insert({
      request_type: requestType,
      request_id: requestId,
      source: o.source,
      before,
      after,
      reason: o.changeReason ?? null,
    });
    if (hErr) console.error("[saveConfirmation] 변경 이력 기록 실패", hErr);
  }

  // 확인서가 나왔으면 원본 요청도 "완료(done)"로 — 이미 done/cancelled면 건드리지 않는다
  // (취소된 걸 되살리면 안 되고, 재확정 때 중복 알림(DB 트리거 679)도 막는다).
  const table = requestType === "korean" ? "korean_booking_requests" : "foreign_requests";
  const { data: statusRow } = await sb.from(table).select("status").eq("id", requestId).single();
  if (statusRow?.status !== "done" && statusRow?.status !== "cancelled") {
    await sb.from(table).update({ status: "done", updated_at: new Date().toISOString() }).eq("id", requestId);
  }

  return { ref_no: saved.ref_no, public_token: saved.public_token, md_token: saved.md_token, changed };
}
