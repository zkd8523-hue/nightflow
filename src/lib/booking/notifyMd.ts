// 담당 MD(파트너)에게 제안서/확정서 알림을 보낸다 — 앱 푸시가 있으면 푸시, 없으면
// 링크를 SMS로. 어드민 "제안서 보내기/확정서 보내기"(/api/admin/notify-md)와 손님의
// "다시 요청"(/api/booking-rerequest)이 같이 쓴다(2026-09-30).
//
// 아무 채널도 없으면 no_channel — 부르는 쪽이 운영자에게 "직접 보내라"고 알려야 한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSms } from "@/lib/notifications/alimtalk";

// SMS 링크는 운영 도메인으로 고정한다 — 로컬에서 보내도 MD가 받는 링크는 열려야 한다.
const SITE = "https://nightflow.kr";
const DOW = "일월화수목금토";

export type NotifyMdResult =
  | { ok: true; channel: "push" | "sms" }
  | { ok: false; error: "not_found" | "cancelled" | "md_required" | "no_confirmation" | "no_channel"; status: number };

export async function notifyAssignedMd(
  sb: SupabaseClient,
  opts: {
    requestType: "foreign" | "korean";
    requestId: string;
    kind: "proposal" | "confirmation";
    /** 손님이 조건을 바꿔 다시 요청한 제안서 — 제목·문구를 "수정된 제안"으로 */
    revised?: boolean;
  }
): Promise<NotifyMdResult> {
  const { requestType, requestId, kind, revised } = opts;
  const table = requestType === "korean" ? "korean_booking_requests" : "foreign_requests";

  const { data: rawReq } = await sb
    .from(table)
    .select(
      `id, guest_name, event_date, group_size, status, assigned_md_id, proposal_token, selected_menu_total, ${
        requestType === "korean" ? "club_id" : "club_ids, budget"
      }`
    )
    .eq("id", requestId)
    .maybeSingle();
  if (!rawReq) return { ok: false, error: "not_found", status: 404 };
  const r = rawReq as unknown as {
    id: string;
    guest_name: string | null;
    event_date: string;
    group_size: number;
    status: string;
    assigned_md_id: string | null;
    proposal_token: string | null;
    selected_menu_total: number | null;
    budget?: number | null;
    club_id?: string | null;
    club_ids?: string[] | null;
  };
  if (r.status === "cancelled") return { ok: false, error: "cancelled", status: 409 };
  if (!r.assigned_md_id) return { ok: false, error: "md_required", status: 400 };

  const { data: conf } = await sb
    .from("booking_confirmations")
    .select("ref_no, md_token, club_id, total_price, confirmed_group_size")
    .eq("request_type", requestType)
    .eq("request_id", r.id)
    .maybeSingle();

  let path: string;
  if (kind === "proposal") {
    if (!r.proposal_token) return { ok: false, error: "not_found", status: 404 };
    path = `/booking/proposal/${r.proposal_token}`;
  } else {
    if (!conf?.md_token) return { ok: false, error: "no_confirmation", status: 404 };
    path = `/booking/md/${conf.md_token}`;
  }

  // 알림 문구 — 잠금화면에서 열지 않고도 무슨 건인지 알 수 있게 클럽·날짜·인원·금액을 담는다.
  const clubId = conf?.club_id ?? (requestType === "korean" ? r.club_id : r.club_ids?.[0]) ?? null;
  const { data: club } = clubId
    ? await sb.from("clubs").select("name").eq("id", clubId).maybeSingle()
    : { data: null };
  const d = new Date(r.event_date + "T00:00:00");
  const dateText = `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;
  const rawSize = ((kind === "confirmation" ? conf?.confirmed_group_size : null) ?? String(r.group_size)).trim();
  const sizeText = /^\d+$/.test(rawSize) ? `${rawSize}명` : rawSize;
  const amount = kind === "confirmation" ? conf?.total_price : (r.selected_menu_total ?? r.budget ?? null);
  const parts = [
    `${requestType === "foreign" ? "[외국인] " : ""}${club?.name ?? "클럽 미정"}`,
    dateText,
    sizeText,
    amount ? `${amount.toLocaleString("ko-KR")}원` : null,
  ].filter(Boolean);
  const title =
    kind === "confirmation"
      ? "✅ 예약 확정서가 나왔어요"
      : revised
      ? "📩 손님이 조건을 바꿔 다시 요청했어요"
      : "📩 예약 제안이 왔어요";
  const text =
    kind === "proposal"
      ? `${parts.join(" · ")} — 가능 여부를 알려주세요`
      : `${parts.join(" · ")} — ${conf?.ref_no ?? ""} 확정서를 확인해 주세요`;

  const mdId = r.assigned_md_id;
  const { count: tokenCount } = await sb
    .from("push_tokens")
    .select("*", { count: "exact", head: true })
    .eq("user_id", mdId);

  if ((tokenCount ?? 0) > 0) {
    const { error } = await sb.rpc("notify_user_push", {
      p_user_id: mdId,
      p_title: title,
      p_body: text,
      p_data: { type: kind === "proposal" ? "booking_proposal" : "booking_confirmation", request_id: r.id },
      p_url: path,
      p_category: "transaction",
    });
    if (!error) return { ok: true, channel: "push" };
    console.error("[notifyAssignedMd] push 실패", mdId, error);
  }

  const { data: md } = await sb.from("users").select("phone").eq("id", mdId).single();
  if (md?.phone) {
    try {
      await sendSms(md.phone, `[나이트플로우] ${title.replace(/^\S+\s/, "")}\n${text}\n${SITE}${path}`);
      return { ok: true, channel: "sms" };
    } catch (e) {
      console.error("[notifyAssignedMd] sms 실패", e);
    }
  }
  return { ok: false, error: "no_channel", status: 422 };
}
