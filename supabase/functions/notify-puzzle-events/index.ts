// Edge Function: notify-puzzle-events
// 퍼즐 V2 알림톡 5가지 트리거를 단일 함수에서 처리
// 크론: 매 5분 (*/5 * * * *)
//
// 트리거:
//   #1 첫 오퍼 도착     → 방장에게 1회
//   #2 방장 위임        → 새 방장에게 1회
//   #3 매칭 성사        → 조각원 전원에게
//   #4 MD 낙찰          → 낙찰 MD에게
//   #5 D-2 오퍼 리마인더 → 방장에게 1회 (19:00 KST)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { solapiSendAlimtalk } from "../_shared/solapi.ts";
import { resendSend } from "../_shared/resend.ts";
import {
  emailFirstOffer,
  emailMatched,
  emailReminder,
  formatDateEn,
  areaEn,
} from "../_shared/puzzleEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_URL = Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://nightflow.kr";

// 알림톡 템플릿 ID
const TPL = {
  PUZZLE_FIRST_OFFER:       Deno.env.get("ALIMTALK_TPL_PUZZLE_FIRST_OFFER") || "",
  PUZZLE_DEADLINE_REMINDER: Deno.env.get("ALIMTALK_TPL_PUZZLE_DEADLINE_REMINDER") || "",
  PUZZLE_LEADER_CHANGED:    Deno.env.get("ALIMTALK_TPL_PUZZLE_LEADER_CHANGED") || "",
  PUZZLE_MATCHED:           Deno.env.get("ALIMTALK_TPL_PUZZLE_MATCHED") || "",
  PUZZLE_OFFER_WON:         Deno.env.get("ALIMTALK_TPL_PUZZLE_OFFER_WON") || "",
  PUZZLE_OFFER_REMINDER:    Deno.env.get("ALIMTALK_TPL_PUZZLE_OFFER_REMINDER") || "",
  PUZZLE_OFFER_DEADLINE:    Deno.env.get("ALIMTALK_TPL_PUZZLE_OFFER_DEADLINE") || "",
};

// KST(YYYY-MM-DD) → "M/D" 포맷 (Deno native)
function formatEventDate(eventDate: string): string {
  const [, m, d] = eventDate.split("-").map(Number);
  return `${m}/${d}`;
}

function puzzleUrl(puzzleId: string) {
  return `${APP_URL}/flags/${puzzleId}`;
}

// notification_logs 중복 체크
async function alreadySent(
  supabase: ReturnType<typeof createClient>,
  eventType: string,
  puzzleId: string,
  recipientUserId?: string
): Promise<boolean> {
  const query = supabase
    .from("notification_logs")
    .select("id")
    .eq("event_type", eventType)
    .eq("puzzle_id", puzzleId)
    .eq("status", "sent");

  if (recipientUserId) {
    query.eq("recipient_user_id", recipientUserId);
  }

  const { data } = await query.limit(1);
  return !!(data && data.length > 0);
}

// notification_logs에 발송 기록
async function logSent(
  supabase: ReturnType<typeof createClient>,
  eventType: string,
  puzzleId: string,
  recipientUserId: string,
  phone: string,
  templateId: string
) {
  await supabase.from("notification_logs").insert({
    event_type: eventType,
    puzzle_id: puzzleId,
    recipient_user_id: recipientUserId,
    recipient_phone: phone,
    template_id: templateId,
    status: "sent",
  });
}

// 알림톡 발송 + 로그 (phone 없으면 skip)
async function sendAndLog(
  supabase: ReturnType<typeof createClient>,
  eventType: string,
  puzzleId: string,
  user: { id: string; phone: string | null },
  templateId: string,
  vars: Record<string, string>
) {
  if (!user.phone) {
    console.log(`⚠️ phone 없음 — skip (userId=${user.id}, event=${eventType})`);
    return;
  }
  try {
    await solapiSendAlimtalk(user.phone, templateId, vars);
    await logSent(supabase, eventType, puzzleId, user.id, user.phone, templateId);
    console.log(`✅ 알림톡 발송 (event=${eventType}, userId=${user.id})`);
  } catch (e) {
    console.error(`❌ 알림톡 실패 (event=${eventType}, userId=${user.id}):`, e);
    await supabase.from("notification_logs").insert({
      event_type: eventType,
      puzzle_id: puzzleId,
      recipient_user_id: user.id,
      recipient_phone: user.phone,
      template_id: templateId,
      status: "failed",
      error_message: String(e),
    });
  }
}

// 외국인 판별: 이메일이 있고 bounce 안 났고, (국가코드 있거나 phone 없음)
// → 카카오 알림톡 대신 이메일로 발송.
type LeaderRow = {
  id: string;
  phone: string | null;
  email?: string | null;
  email_bounced?: boolean | null;
  country_code?: string | null;
};

function useEmailChannel(leader: LeaderRow): boolean {
  return (
    !!leader.email &&
    !leader.email_bounced &&
    (!!leader.country_code || !leader.phone)
  );
}

// 이메일 발송 + notification_logs 기록 (알림톡 sendAndLog의 이메일 버전)
async function sendEmailAndLog(
  supabase: ReturnType<typeof createClient>,
  eventType: string,
  puzzleId: string,
  leader: LeaderRow,
  content: { subject: string; html: string },
) {
  if (!leader.email) return;
  try {
    await resendSend({ to: leader.email, subject: content.subject, html: content.html });
    await supabase.from("notification_logs").insert({
      event_type: eventType,
      puzzle_id: puzzleId,
      recipient_user_id: leader.id,
      recipient_phone: leader.email, // 이메일 채널: 수신자 식별자로 email 저장
      template_id: "email",
      status: "sent",
    });
    console.log(`✅ 이메일 발송 (event=${eventType}, userId=${leader.id})`);
  } catch (e) {
    console.error(`❌ 이메일 실패 (event=${eventType}, userId=${leader.id}):`, e);
    await supabase.from("notification_logs").insert({
      event_type: eventType,
      puzzle_id: puzzleId,
      recipient_user_id: leader.id,
      recipient_phone: leader.email,
      template_id: "email",
      status: "failed",
      error_message: String(e),
    });
  }
}

// 퍼즐 예산 → "₩500,000" 포맷
function budgetText(p: { total_budget: number | null; budget_per_person: number; target_count: number }): string {
  const total = p.total_budget ?? p.budget_per_person * p.target_count;
  return `₩${total.toLocaleString("en-US")}`;
}

// ============================================================
// #1 첫 오퍼 도착
// ============================================================
async function handleFirstOffer(supabase: ReturnType<typeof createClient>) {
  // pending 오퍼가 있는 open 퍼즐 조회
  // puzzles!inner 조인이 FK 관계명 불일치로 실패할 수 있어 2단계로 분리
  const { data: offers, error: offersErr } = await supabase
    .from("puzzle_offers")
    .select("puzzle_id")
    .eq("status", "pending");

  console.log(`[firstOffer] offers=${offers?.length ?? 0}, error=${offersErr?.message ?? "none"}`);

  if (!offers || offers.length === 0) return;

  // 해당 퍼즐들의 상태 확인 (이메일용 필드 포함)
  const puzzleIds = [...new Set(offers.map(o => o.puzzle_id))];
  const { data: openPuzzles } = await supabase
    .from("puzzles")
    .select("id, leader_id, status, event_date, area, total_budget, budget_per_person, target_count")
    .in("id", puzzleIds)
    .eq("status", "open");

  console.log(`[firstOffer] openPuzzles=${openPuzzles?.length ?? 0}`);

  if (!openPuzzles || openPuzzles.length === 0) return;

  type OpenPuzzle = {
    id: string; leader_id: string; status: string;
    event_date: string; area: string;
    total_budget: number | null; budget_per_person: number; target_count: number;
  };

  // puzzle_id 별 offer count + 퍼즐 매핑
  const countMap: Record<string, { puzzle: OpenPuzzle; count: number }> = {};
  for (const o of offers) {
    const puzzle = (openPuzzles as OpenPuzzle[]).find(p => p.id === o.puzzle_id);
    if (!puzzle) continue;
    if (!countMap[o.puzzle_id]) countMap[o.puzzle_id] = { puzzle, count: 0 };
    countMap[o.puzzle_id].count++;
  }

  for (const [puzzleId, { puzzle, count }] of Object.entries(countMap)) {
    // count !== 1 가드는 제거: cron이 5분 간격이라 그 사이 두 번째 오퍼가 도착하면
    // count가 2가 되어 영영 안 발송됐던 버그. alreadySent 만으로 중복 발송 충분히 방지.
    if (await alreadySent(supabase, "puzzle_first_offer", puzzleId)) continue;

    const { data: leader } = await supabase
      .from("users")
      .select("id, phone, email, email_bounced, country_code")
      .eq("id", puzzle.leader_id)
      .single();

    if (!leader) continue;

    if (useEmailChannel(leader as LeaderRow)) {
      // 외국인: 이메일 발송
      await sendEmailAndLog(
        supabase,
        "puzzle_first_offer",
        puzzleId,
        leader as LeaderRow,
        emailFirstOffer({
          dateEn: formatDateEn(puzzle.event_date),
          areaEn: areaEn(puzzle.area),
          budget: budgetText(puzzle),
          headcount: `${puzzle.target_count} ppl`,
          offerCount: count,
          url: puzzleUrl(puzzleId),
        }),
      );
    } else {
      await sendAndLog(supabase, "puzzle_first_offer", puzzleId, leader, TPL.PUZZLE_FIRST_OFFER, {
        puzzleUrl: puzzleUrl(puzzleId),
      });
    }
  }
}

// handleDeadlineReminder 제거됨 (D-2 리마인더 handleOfferReminder로 대체)

// ============================================================
// #2 오퍼 마감 (20:00 KST = 11:00 UTC)
// status=open AND offer_deadline <= now() AND expires_at > now()
// → status='selecting'로 전환 + 방장에게 알림톡/in-app 알림
// ============================================================
async function handleOfferDeadline(supabase: ReturnType<typeof createClient>) {
  const nowIso = new Date().toISOString();

  // 마감 시각 도래한 깃발 조회.
  // 'selecting'도 포함한다: 상태 전환(open→selecting)은 됐지만 알림톡 발송이
  // 실패한 깃발이 다음 cron에서 재시도되도록 하기 위함. (중복 발송은 alreadySent로 차단)
  const { data: puzzles, error } = await supabase
    .from("puzzles")
    .select("id, leader_id, area, event_date, status")
    .in("status", ["open", "selecting"])
    .not("offer_deadline", "is", null)
    .lte("offer_deadline", nowIso)
    .gt("expires_at", nowIso);

  console.log(`[offerDeadline] 마감 대상=${puzzles?.length ?? 0}, error=${error?.message ?? "none"}`);

  if (!puzzles || puzzles.length === 0) return;

  for (const puzzle of puzzles as Array<{ id: string; leader_id: string; area: string; event_date: string; status: string }>) {
   try {
    // 1) 상태 전환: open → selecting (race 방지: status='open' 조건 재확인)
    //    이미 'selecting'인 깃발은 전환을 건너뛰고 알림 단계로 진행한다.
    //    (이전 실행에서 전환만 되고 알림톡이 실패했을 수 있으므로 — alreadySent로 중복은 차단)
    if (puzzle.status === "open") {
      const { data: updated, error: updateErr } = await supabase
        .from("puzzles")
        .update({ status: "selecting" })
        .eq("id", puzzle.id)
        .eq("status", "open")
        .select("id")
        .maybeSingle();

      if (updateErr) {
        console.log(`[offerDeadline] 전환 실패 ${puzzle.id} (updateErr=${updateErr.message})`);
        continue;
      }
      // updated가 null이면 동시에 다른 실행이 selecting으로 바꾼 것 — 정상, 알림 단계로 계속 진행
    }

    // 2) 중복 발송 가드 — in-app/푸시/알림톡 전체를 1회로 묶는다.
    //    조회에 'selecting'을 포함시켰으므로(재시도 목적) 이 가드가 없으면
    //    매 cron마다 in-app 알림이 중복 INSERT된다.
    if (await alreadySent(supabase, "puzzle_offer_deadline", puzzle.id)) continue;

    // 3) pending 오퍼 수 집계
    const { count: offerCount } = await supabase
      .from("puzzle_offers")
      .select("id", { count: "exact", head: true })
      .eq("puzzle_id", puzzle.id)
      .eq("status", "pending");

    // 4) 방장 정보 로드
    const { data: leader } = await supabase
      .from("users")
      .select("id, display_name, phone")
      .eq("id", puzzle.leader_id)
      .single();

    if (!leader) continue;

    // 5) in-app 알림 INSERT (알림톡과 별개로 항상 발송)
    //    오퍼 개수에 따라 문구 분기: 0개면 '오퍼 없이 마감' 결과 통보,
    //    1개 이상이면 '검토 시작 · 선택하세요' 안내.
    const hasOffers = (offerCount ?? 0) > 0;
    await supabase.from("in_app_notifications").insert({
      user_id: puzzle.leader_id,
      type: "puzzle_offer_deadline",
      title: hasOffers ? "오퍼 마감 · 검토 시작" : "오퍼 마감 · 결과 안내",
      message: hasOffers
        ? `${puzzle.area} ${formatEventDate(puzzle.event_date)} 깃발의 MD 오퍼가 마감됐어요. 오후 9시까지 선택해주세요.`
        : `${puzzle.area} ${formatEventDate(puzzle.event_date)} 깃발이 들어온 오퍼 없이 마감됐어요. 다음에 다시 깃발을 꽂아보세요.`,
      action_url: `/flags/${puzzle.id}`,
    });

    // 5-1) FCM 푸시 — 오퍼 개수에 따라 문구 분기 (in-app과 동일).
    //      0개면 '오퍼 없이 마감' 결과 통보, 1개+면 '검토 시간 · 선택' 안내.
    try {
      await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/push-dispatch`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            user_id: puzzle.leader_id,
            title: hasOffers ? "🍾 깃발 오퍼가 마감됐어요!" : "오퍼 마감 · 결과 안내",
            body: hasOffers
              ? `시크릿오퍼 ${offerCount}개 💌\n60분 동안 더 고민할 수 있어요.`
              : `${puzzle.area} ${formatEventDate(puzzle.event_date)} 깃발이 오퍼 없이 마감됐어요`,
            data: {
              type: hasOffers ? "puzzle_review_started" : "puzzle_offer_deadline_empty",
              puzzle_id: puzzle.id,
            },
            url: `/flags/${puzzle.id}`,
          }),
        }
      );
      console.log(`📲 FCM 푸시 발송 (puzzle=${puzzle.id}, leader=${puzzle.leader_id}, hasOffers=${hasOffers})`);
    } catch (e) {
      console.error(`❌ FCM 푸시 실패 (puzzle=${puzzle.id}):`, e);
    }

    // 5-2) pending 오퍼 0개 → 알림톡은 발송 안 함 (in-app/푸시로 이미 결과 통보됨,
    //      알림톡은 사전승인 템플릿이라 '오퍼 없이 마감' 전용 문구를 못 보냄).
    //      단, logSent로 'sent' 로그는 남겨 이 깃발을 '처리 완료'로 마킹한다.
    //      이게 없으면 다음 cron에서 alreadySent를 통과해 in-app 알림이 매번 중복 INSERT된다.
    //      (조회에 'selecting'이 포함되어 이 깃발이 계속 재조회되기 때문 — 위 2) 주석 참조)
    const leaderTyped = leader as { id: string; display_name?: string | null; phone: string | null };
    if ((offerCount ?? 0) === 0) {
      await logSent(
        supabase,
        "puzzle_offer_deadline",
        puzzle.id,
        leaderTyped.id,
        leaderTyped.phone ?? "",
        TPL.PUZZLE_OFFER_DEADLINE || "skipped:no-offers",
      );
      console.log(`[offerDeadline] pending 오퍼 0개 — 알림톡 skip + 처리완료 마킹 (puzzle=${puzzle.id})`);
      continue;
    }

    // 5-3) 알림톡 발송 (template/phone 없으면 sendAndLog가 skip).
    //      중복 가드는 위 2)에서 이미 처리됨.
    if (!TPL.PUZZLE_OFFER_DEADLINE) {
      console.log(`⚠️ ALIMTALK_TPL_PUZZLE_OFFER_DEADLINE 미설정 — 알림톡 skip (puzzle=${puzzle.id})`);
      continue;
    }

    await sendAndLog(supabase, "puzzle_offer_deadline", puzzle.id, leaderTyped, TPL.PUZZLE_OFFER_DEADLINE, {
      userName: leaderTyped.display_name ?? "방장",
      area: puzzle.area,
      eventDate: formatEventDate(puzzle.event_date),
      offerCount: String(offerCount ?? 0),
      puzzleUrl: puzzleUrl(puzzle.id),
    });
   } catch (e) {
     // 한 깃발 처리 실패가 나머지 깃발 발송을 막지 않도록 격리
     console.error(`❌ [offerDeadline] 깃발 처리 실패 (puzzle=${puzzle.id}):`, e);
   }
  }
}

// ============================================================
// #3 방장 위임
// ============================================================
async function handleLeaderChanged(supabase: ReturnType<typeof createClient>) {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data: puzzles } = await supabase
    .from("puzzles")
    .select("id, leader_id")
    .not("leader_changed_at", "is", null)
    .gte("leader_changed_at", tenMinutesAgo)
    .in("status", ["open", "accepted"]);

  if (!puzzles || puzzles.length === 0) return;

  for (const puzzle of puzzles as Array<{ id: string; leader_id: string }>) {
    if (await alreadySent(supabase, "puzzle_leader_changed", puzzle.id, puzzle.leader_id)) continue;

    const { data: leader } = await supabase
      .from("users")
      .select("id, phone")
      .eq("id", puzzle.leader_id)
      .single();

    if (!leader) continue;

    await sendAndLog(supabase, "puzzle_leader_changed", puzzle.id, leader, TPL.PUZZLE_LEADER_CHANGED, {
      puzzleUrl: puzzleUrl(puzzle.id),
    });
  }
}

// ============================================================
// #6 D-2 오퍼 리마인더 (19:00~19:09 KST = 10:00~10:09 UTC)
// 이벤트 2일 전, 미수락 오퍼 1건 이상인 방장에게 1회 발송
// ============================================================
async function handleOfferReminder(supabase: ReturnType<typeof createClient>) {
  if (!TPL.PUZZLE_OFFER_REMINDER) return;

  const nowUtc = new Date();
  const kstHour = (nowUtc.getUTCHours() + 9) % 24;
  const kstMinute = nowUtc.getUTCMinutes();

  // 19:00~19:09 KST 시간대에만 실행
  // 테스트 시 TEST_BYPASS_TIME=true 로 시간 체크 우회 가능
  const bypassTime = Deno.env.get("TEST_BYPASS_TIME") === "true";
  if (!bypassTime && (kstHour !== 19 || kstMinute >= 10)) return;

  // D+2 KST 날짜 계산
  const kstNow = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
  const targetDate = new Date(kstNow.getTime() + 2 * 24 * 60 * 60 * 1000);
  const targetDateStr = targetDate.toISOString().slice(0, 10);

  // D+2 이벤트이고 open 상태인 퍼즐 조회
  const { data: puzzles } = await supabase
    .from("puzzles")
    .select("id, leader_id")
    .eq("status", "open")
    .eq("event_date", targetDateStr)
    .gt("expires_at", nowUtc.toISOString());

  console.log(`[offerReminder] D-2 퍼즐=${puzzles?.length ?? 0} (event_date=${targetDateStr})`);

  if (!puzzles || puzzles.length === 0) return;

  for (const puzzle of puzzles as Array<{ id: string; leader_id: string }>) {
    if (await alreadySent(supabase, "puzzle_offer_reminder", puzzle.id)) continue;

    // 미수락 오퍼 수 확인
    const { count } = await supabase
      .from("puzzle_offers")
      .select("id", { count: "exact", head: true })
      .eq("puzzle_id", puzzle.id)
      .eq("status", "pending");

    if (!count || count === 0) continue;

    const { data: leader } = await supabase
      .from("users")
      .select("id, display_name, phone")
      .eq("id", puzzle.leader_id)
      .single();

    if (!leader) continue;

    await sendAndLog(supabase, "puzzle_offer_reminder", puzzle.id, leader, TPL.PUZZLE_OFFER_REMINDER, {
      userName: leader.display_name ?? "방장",
      offerCount: String(count),
      puzzleUrl: puzzleUrl(puzzle.id),
    });
  }
}

// ============================================================
// 외국인 전용 D-7 / D-1 이메일 리마인더 (이탈 방지 + 기대치 관리)
// 한국 유저는 D-2 알림톡(handleOfferReminder)이 담당. 외국인은 이메일.
// 19:00~19:09 KST 1회. 오퍼 마감이 당일이라 "오퍼는 당일 도착" 기대치 세팅 톤.
// (오퍼 도착 메일은 handleFirstOffer가 깃발당 1회 — 여긴 일정 리마인더만)
// ============================================================
async function handleForeignerReminders(supabase: ReturnType<typeof createClient>) {
  const nowUtc = new Date();
  const kstHour = (nowUtc.getUTCHours() + 9) % 24;
  const kstMinute = nowUtc.getUTCMinutes();
  const bypassTime = Deno.env.get("TEST_BYPASS_TIME") === "true";
  if (!bypassTime && (kstHour !== 19 || kstMinute >= 10)) return;

  const kstNow = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);

  for (const daysLeft of [7, 1]) {
    const eventType = `puzzle_reminder_d${daysLeft}`;
    const target = new Date(kstNow.getTime() + daysLeft * 24 * 60 * 60 * 1000);
    const targetDateStr = target.toISOString().slice(0, 10);

    const { data: puzzles } = await supabase
      .from("puzzles")
      .select("id, leader_id, event_date, area, total_budget, budget_per_person, target_count")
      .eq("status", "open")
      .eq("event_date", targetDateStr)
      .gt("expires_at", nowUtc.toISOString());

    console.log(`[foreignerReminder] D-${daysLeft} 퍼즐=${puzzles?.length ?? 0} (event_date=${targetDateStr})`);

    if (!puzzles || puzzles.length === 0) continue;

    for (const puzzle of puzzles as Array<{
      id: string; leader_id: string; event_date: string; area: string;
      total_budget: number | null; budget_per_person: number; target_count: number;
    }>) {
      if (await alreadySent(supabase, eventType, puzzle.id)) continue;

      const { data: leader } = await supabase
        .from("users")
        .select("id, phone, email, email_bounced, country_code")
        .eq("id", puzzle.leader_id)
        .single();

      // 외국인만 (한국 방장은 D-2 알림톡으로 충분)
      if (!leader || !useEmailChannel(leader as LeaderRow)) continue;

      await sendEmailAndLog(
        supabase,
        eventType,
        puzzle.id,
        leader as LeaderRow,
        emailReminder({
          daysLeft,
          dateEn: formatDateEn(puzzle.event_date),
          areaEn: areaEn(puzzle.area),
          budget: budgetText(puzzle),
          headcount: `${puzzle.target_count} ppl`,
          url: puzzleUrl(puzzle.id),
        }),
      );
    }
  }
}

// ============================================================
// #7 당일 12시 푸시 리마인더 (방장)
// 이벤트(=마감) 당일 12:00~12:09 KST, pending 오퍼 1건 이상인 open 깃발 방장에게 1회.
// "오늘 밤 준비됐어요? 오퍼 미리 둘러보세요" 사전 알림 (당일 20시 마감 알림과 별개).
// ============================================================
async function handleDeadlineEve(supabase: ReturnType<typeof createClient>) {
  const nowUtc = new Date();
  const kstHour = (nowUtc.getUTCHours() + 9) % 24;
  const kstMinute = nowUtc.getUTCMinutes();

  const bypassTime = Deno.env.get("TEST_BYPASS_TIME") === "true";
  if (!bypassTime && (kstHour !== 12 || kstMinute >= 10)) return;

  // 당일(D) KST 날짜 계산
  const kstNow = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
  const targetDateStr = kstNow.toISOString().slice(0, 10);

  const { data: puzzles } = await supabase
    .from("puzzles")
    .select("id, leader_id")
    .eq("status", "open")
    .eq("event_date", targetDateStr)
    .gt("expires_at", nowUtc.toISOString());

  console.log(`[deadlineEve] 당일 퍼즐=${puzzles?.length ?? 0} (event_date=${targetDateStr})`);

  if (!puzzles || puzzles.length === 0) return;

  for (const puzzle of puzzles as Array<{ id: string; leader_id: string }>) {
    if (await alreadySent(supabase, "puzzle_deadline_eve", puzzle.id)) continue;

    // pending 오퍼 1건 이상일 때만 (검토할 오퍼가 있어야 의미)
    const { count } = await supabase
      .from("puzzle_offers")
      .select("id", { count: "exact", head: true })
      .eq("puzzle_id", puzzle.id)
      .eq("status", "pending");

    if (!count || count === 0) continue;

    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/push-dispatch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          user_id: puzzle.leader_id,
          title: "🎉 오늘 밤 준비되셨어요?",
          body: "도착한 오퍼, 미리 둘러보세요 👀",
          data: { type: "puzzle_deadline_eve", puzzle_id: puzzle.id },
          url: `/flags/${puzzle.id}`,
        }),
      });
      // 중복 방지 로그 (푸시 전용 — phone 없이 마킹)
      await logSent(supabase, "puzzle_deadline_eve", puzzle.id, puzzle.leader_id, "", "push");
      console.log(`📲 마감 전날 리마인드 푸시 (puzzle=${puzzle.id}, leader=${puzzle.leader_id})`);
    } catch (e) {
      console.error(`❌ [deadlineEve] 푸시 실패 (puzzle=${puzzle.id}):`, e);
    }
  }
}

// ============================================================
// #4 매칭 성사 (조각원 전원) + #5 MD 낙찰
// ============================================================
async function handleMatched(supabase: ReturnType<typeof createClient>) {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data: puzzles } = await supabase
    .from("puzzles")
    .select("id, leader_id, accepted_offer_id, event_date, area, total_budget, budget_per_person, target_count, puzzle_offers!accepted_offer_id(md_id, table_type, clubs(name))")
    .eq("status", "accepted")
    .not("accepted_offer_id", "is", null)
    .gte("updated_at", tenMinutesAgo);

  if (!puzzles || puzzles.length === 0) return;

  for (const puzzle of puzzles as Array<{
    id: string;
    leader_id: string;
    accepted_offer_id: string;
    event_date: string;
    area: string;
    total_budget: number | null;
    budget_per_person: number;
    target_count: number;
    puzzle_offers: { md_id: string; table_type: string; clubs: { name: string } | null } | null;
  }>) {
    const clubName = puzzle.puzzle_offers?.clubs?.name ?? "클럽";
    const tableType = puzzle.puzzle_offers?.table_type ?? "";
    const mdId = puzzle.puzzle_offers?.md_id;

    // 외국인 방장: 매칭 이메일 (클럽 연락 안내). 조각원 알림(아래)과 별개.
    // 한국 방장은 수락 당사자라 기존대로 알림 없음.
    if (!(await alreadySent(supabase, "puzzle_matched", puzzle.id, puzzle.leader_id))) {
      const { data: leader } = await supabase
        .from("users")
        .select("id, phone, email, email_bounced, country_code")
        .eq("id", puzzle.leader_id)
        .single();
      if (leader && useEmailChannel(leader as LeaderRow)) {
        await sendEmailAndLog(
          supabase,
          "puzzle_matched",
          puzzle.id,
          leader as LeaderRow,
          emailMatched({
            dateEn: formatDateEn(puzzle.event_date),
            areaEn: areaEn(puzzle.area),
            budget: budgetText(puzzle),
            headcount: `${puzzle.target_count} ppl`,
            clubName: clubName === "클럽" ? "the club" : clubName,
            url: puzzleUrl(puzzle.id),
          }),
        );
      }
    }

    // #4 조각원 전원 (방장 제외 — 본인이 수락한 당사자, 멤버별 개별 중복 체크)
    const { data: members } = await supabase
      .from("puzzle_members")
      .select("users!inner(id, phone)")
      .eq("puzzle_id", puzzle.id)
      .neq("user_id", puzzle.leader_id);

    if (members) {
      for (const m of members as Array<{ users: { id: string; phone: string | null } }>) {
        if (await alreadySent(supabase, "puzzle_matched", puzzle.id, m.users.id)) continue;
        await sendAndLog(supabase, "puzzle_matched", puzzle.id, m.users, TPL.PUZZLE_MATCHED, {
          clubName,
          tableType,
          puzzleUrl: puzzleUrl(puzzle.id),
        });
      }
    }

    // #5 낙찰 MD
    if (mdId && !(await alreadySent(supabase, "puzzle_offer_won", puzzle.id))) {
      const { data: md } = await supabase
        .from("users")
        .select("id, phone")
        .eq("id", mdId)
        .single();

      if (md) {
        await sendAndLog(supabase, "puzzle_offer_won", puzzle.id, md, TPL.PUZZLE_OFFER_WON, {
          puzzleUrl: puzzleUrl(puzzle.id),
        });
      }
    }
  }
}

// ============================================================
// Main
// ============================================================
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    console.log("🔔 notify-puzzle-events 시작");

    const handlers: Array<[string, Promise<unknown>]> = [
      ["firstOffer", handleFirstOffer(supabase)],
      ["offerDeadline", handleOfferDeadline(supabase)],
      ["leaderChanged", handleLeaderChanged(supabase)],
      ["matched", handleMatched(supabase)],
      ["offerReminder", handleOfferReminder(supabase)],
      ["foreignerReminders", handleForeignerReminders(supabase)],
      ["deadlineEve", handleDeadlineEve(supabase)],
    ];

    const settled = await Promise.allSettled(handlers.map(([, p]) => p));

    // allSettled가 reject를 삼키는 문제: 각 핸들러의 실패 사유를 명시적으로 노출
    const errors: Record<string, string> = {};
    settled.forEach((r, i) => {
      if (r.status === "rejected") {
        const name = handlers[i][0];
        errors[name] = String(r.reason);
        console.error(`❌ 핸들러 실패 [${name}]:`, r.reason);
      }
    });

    console.log("✅ notify-puzzle-events 완료");

    return new Response(
      JSON.stringify({ success: true, errors: Object.keys(errors).length ? errors : undefined }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("❌ notify-puzzle-events 오류:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
