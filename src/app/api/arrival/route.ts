// 손님이 예약 확인표에서 "10분 전" / "도착"을 누르면 호출된다.
// 운영자와 담당 MD 양쪽에 SMS를 보낸다 — 운영자를 거쳐 전달하는 게 아니라 병렬로
// 쏜다. 손님이 눌렀는데 운영자가 못 보면 마중이 늦기 때문.
//
// 앱 푸시 대신 SMS인 이유: 한국 앱스토어 심사가 안 끝나 앱 배포가 막혀 있고,
// 알림톡은 템플릿 사전승인(1~3일)이 필요하다. SMS는 즉시 쓸 수 있다.
//
// 외국인 요청과 한국 예약 요청 확인서 모두에서 호출될 수 있다 — request_type으로
// 원본 테이블을 분기한다(2026-09-06, Migration 654).
//
// Body: { request_id: string, request_type?: "foreign" | "korean" (기본 foreign), kind: "soon" | "arrived" }
// 200: { ok: true, notified: { admin, md } }
// 409: 이미 같은 신호를 보냄(중복 클릭)

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/notifications/alimtalk";

// SMS는 실제 손님/MD 폰으로 나가므로 항상 프로덕션 도메인을 쓴다.
// localhost 링크를 보내면 받는 쪽에서 못 연다.
const SITE_ORIGIN = "https://nightflow.kr";

// 운영자 수신 번호. 여러 명이면 콤마로 구분.
const ADMIN_PHONES = (process.env.ARRIVAL_ADMIN_PHONES ?? "01022051052")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export async function POST(req: NextRequest) {
  let body: { request_id?: string; request_type?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const requestId = body.request_id;
  const kind = body.kind;
  if (!requestId || (kind !== "soon" && kind !== "arrived")) {
    return NextResponse.json({ error: "bad_params" }, { status: 400 });
  }
  const requestType = body.request_type === "korean" ? "korean" : "foreign";

  const sb = createAdminClient();

  // 예약 + 담당 MD 정보. foreign_requests는 club_ids(배열), korean_booking_requests는
  // club_id(단일) — 조회 컬럼만 분기하고 이후 로직은 배열로 통일해 다룬다.
  const { data: reqRow, error: reqErr } = await sb
    .from(requestType === "korean" ? "korean_booking_requests" : "foreign_requests")
    .select(`id, guest_name, event_date, group_size, assigned_md_id, status, ${requestType === "korean" ? "club_id" : "club_ids"}`)
    .eq("id", requestId)
    .single();

  if (reqErr || !reqRow) {
    return NextResponse.json({ error: "request_not_found" }, { status: 404 });
  }
  if (reqRow.status === "cancelled") {
    return NextResponse.json({ error: "cancelled_booking" }, { status: 409 });
  }
  const reqRowTyped = reqRow as unknown as {
    id: string;
    guest_name: string | null;
    event_date: string;
    group_size: number;
    assigned_md_id: string | null;
    status: string;
    club_ids?: string[] | null;
    club_id?: string | null;
  };
  const reqClubIds =
    requestType === "korean"
      ? ([reqRowTyped.club_id].filter(Boolean) as string[])
      : (reqRowTyped.club_ids ?? []);

  // 예약 당일(KST)에만 허용 — 클라이언트에서 버튼을 비활성화해도 devtools로
  // 우회 가능하니 서버에서도 같은 기준으로 다시 막는다.
  const todayKst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD
  if (reqRow.event_date !== todayKst) {
    return NextResponse.json({ error: "not_event_day" }, { status: 403 });
  }

  // 5분 쿨다운 — 완전 무제한이면 손님이 연타해 MD 폰에 문자 폭탄이 될 수 있고,
  // 아예 막으면 재확인 차 다시 보내야 할 때 방법이 없다. 같은 kind로 5분 이내
  // 발송 기록이 있으면 거부하고, 지나면 다시 보낼 수 있게 한다.
  const COOLDOWN_MS = 5 * 60 * 1000;
  const { data: recent } = await sb
    .from("arrival_pings")
    .select("created_at")
    .eq("request_type", requestType)
    .eq("request_id", requestId)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent && Date.now() - new Date(recent.created_at).getTime() < COOLDOWN_MS) {
    return NextResponse.json({ ok: true, already: true, cooldown: true }, { status: 409 });
  }

  const { error: insErr } = await sb
    .from("arrival_pings")
    .insert({ request_type: requestType, request_id: requestId, kind });

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // 확정서(booking_confirmations)가 있으면 그쪽 확정 클럽·확정 인원을 우선한다.
  // 요청 원본(group_size, club_ids[0])만 쓰면 어드민에서 확정 인원을 8~15로
  // 바꿔도 SMS에는 신청 당시 인원(10명)이 그대로 나가는 문제가 있었다.
  const { data: conf } = await sb
    .from("booking_confirmations")
    .select("club_id, confirmed_group_size, ref_no, md_token")
    .eq("request_type", requestType)
    .eq("request_id", requestId)
    .maybeSingle();

  const clubId = conf?.club_id ?? reqClubIds[0];
  let clubName = "";
  if (clubId) {
    const { data: club } = await sb
      .from("clubs")
      .select("name")
      .eq("id", clubId)
      .single();
    clubName = club?.name ?? "";
  }

  const guest = reqRowTyped.guest_name?.trim() || "게스트";
  const groupSizeText = conf?.confirmed_group_size ?? `${reqRowTyped.group_size}명`;
  const when = kind === "soon" ? "10분 후 도착 예정" : "도착했습니다";
  const head = clubName ? `${clubName} ` : "";
  const refTag = conf?.ref_no ? ` (${conf.ref_no})` : "";
  const baseText = `[나이트플로우] ${head}${guest}님 ${groupSizeText} ${when}.${refTag}` +
    (kind === "arrived" ? " 입구에서 대기 중입니다." : "");

  // MD에게는 MD용 링크(md_token)를 같이 보낸다 — 그 페이지에 "입장 완료" 버튼이
  // 있어서 문자 받은 그 자리에서 바로 처리할 수 있다.
  const mdText = conf?.md_token
    ? `${baseText}\n확인서: ${SITE_ORIGIN}/booking/md/${conf.md_token}`
    : baseText;

  // 운영자 — 실패해도 MD 발송은 계속한다.
  let notifiedAdmin = false;
  for (const phone of ADMIN_PHONES) {
    try {
      await sendSms(phone, baseText);
      notifiedAdmin = true;
    } catch (e) {
      console.error("[arrival] admin sms 실패", phone, e);
    }
  }

  // 담당 MD — 푸시와 SMS를 함께 보낸다. 앱 푸시 배너는 본문 안의 URL을
  // 클릭 가능한 링크로 바꿔주지 않아서(알림을 직접 탭해야 p_url로 이동),
  // 링크를 눈으로 보고 눌러야 하는 경우 SMS가 필요하다. 그래서 "푸시 있으면
  // SMS 생략" 폴백 대신 둘 다 보낸다 — MD 입장에서 SMS 문자 안에 항상
  // 확인서 링크가 있어야 한다.
  let notifiedMd = false;
  const mdChannels: ("push" | "sms")[] = [];

  if (reqRowTyped.assigned_md_id) {
    const mdId = reqRowTyped.assigned_md_id;

    const { count: tokenCount } = await sb
      .from("push_tokens")
      .select("*", { count: "exact", head: true })
      .eq("user_id", mdId);

    if ((tokenCount ?? 0) > 0) {
      const mdConfUrl = conf?.md_token ? `/booking/md/${conf.md_token}` : "/md/dashboard";
      const { error: pushErr } = await sb.rpc("notify_user_push", {
        p_user_id: mdId,
        p_title: kind === "soon" ? "🚗 곧 도착" : "🎉 손님 도착",
        p_body: baseText.replace("[나이트플로우] ", ""),
        p_data: { type: "arrival", request_id: requestId, kind },
        p_url: mdConfUrl,
        p_category: "transaction",
      });
      if (!pushErr) {
        notifiedMd = true;
        mdChannels.push("push");
      } else {
        console.error("[arrival] md push 실패", pushErr);
      }
    }

    {
      const { data: md } = await sb
        .from("users")
        .select("phone")
        .eq("id", mdId)
        .single();
      if (md?.phone) {
        try {
          await sendSms(md.phone, mdText);
          notifiedMd = true;
          mdChannels.push("sms");
        } catch (e) {
          console.error("[arrival] md sms 실패", e);
        }
      }
    }
  }

  await sb
    .from("arrival_pings")
    .update({
      notified_admin: notifiedAdmin,
      notified_md: notifiedMd,
      note: !reqRowTyped.assigned_md_id
        ? "담당 MD 미지정"
        : mdChannels.length > 0
          ? `MD ${mdChannels.join("+")}`
          : "MD 발송 실패",
    })
    .eq("request_type", requestType)
    .eq("request_id", requestId)
    .eq("kind", kind);

  return NextResponse.json({
    ok: true,
    notified: { admin: notifiedAdmin, md: notifiedMd, md_channels: mdChannels },
  });
}
