// Edge Function: notify-puzzle-events
// 퍼즐 V2 알림톡 5가지 트리거를 단일 함수에서 처리
// 크론: 매 5분 (*/5 * * * *)
//
// 트리거:
//   #1 첫 오퍼 도착     → 방장에게 1회
//   #2 마감 임박        → 방장에게 1회 (20:00~20:09 KST 시간대 체크)
//   #3 방장 위임        → 새 방장에게 1회
//   #4 매칭 성사        → 조각원 전원에게
//   #5 MD 낙찰          → 낙찰 MD에게

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { solapiSendAlimtalk } from "../_shared/solapi.ts";

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
};

function puzzleUrl(puzzleId: string) {
  return `${APP_URL}/puzzles/${puzzleId}`;
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

  // 해당 퍼즐들의 상태 확인
  const puzzleIds = [...new Set(offers.map(o => o.puzzle_id))];
  const { data: openPuzzles } = await supabase
    .from("puzzles")
    .select("id, leader_id, status")
    .in("id", puzzleIds)
    .eq("status", "open");

  console.log(`[firstOffer] openPuzzles=${openPuzzles?.length ?? 0}`);

  if (!openPuzzles || openPuzzles.length === 0) return;

  // puzzle_id별 offer count + leader_id 매핑
  const rows = offers
    .filter(o => openPuzzles.some(p => p.id === o.puzzle_id))
    .map(o => ({
      puzzle_id: o.puzzle_id,
      puzzles: openPuzzles.find(p => p.id === o.puzzle_id)!,
    }));

  if (!rows || rows.length === 0) return;

  // puzzle_id 별 count 집계
  const countMap: Record<string, { leaderId: string; count: number }> = {};
  for (const row of rows as Array<{ puzzle_id: string; puzzles: { leader_id: string; status: string } }>) {
    if (!countMap[row.puzzle_id]) {
      countMap[row.puzzle_id] = { leaderId: row.puzzles.leader_id, count: 0 };
    }
    countMap[row.puzzle_id].count++;
  }

  for (const [puzzleId, { leaderId, count }] of Object.entries(countMap)) {
    if (count !== 1) continue;
    if (await alreadySent(supabase, "puzzle_first_offer", puzzleId)) continue;

    const { data: leader } = await supabase
      .from("users")
      .select("id, phone")
      .eq("id", leaderId)
      .single();

    if (!leader) continue;

    await sendAndLog(supabase, "puzzle_first_offer", puzzleId, leader, TPL.PUZZLE_FIRST_OFFER, {
      puzzleUrl: puzzleUrl(puzzleId),
    });
  }
}

// ============================================================
// #2 마감 임박 (20:00~20:09 KST = 11:00~11:09 UTC)
// ============================================================
async function handleDeadlineReminder(supabase: ReturnType<typeof createClient>) {
  const nowUtc = new Date();
  const kstHour = (nowUtc.getUTCHours() + 9) % 24;
  const kstMinute = nowUtc.getUTCMinutes();

  // 20:00~20:09 KST 시간대에만 실행
  if (kstHour !== 20 || kstMinute >= 10) return;

  // 오늘 KST 날짜 (YYYY-MM-DD)
  const kstNow = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
  const todayKst = kstNow.toISOString().slice(0, 10);

  const { data: openPuzzles } = await supabase
    .from("puzzles")
    .select("id, leader_id")
    .eq("status", "open")
    .eq("event_date", todayKst)
    .gt("expires_at", nowUtc.toISOString());

  if (!openPuzzles || openPuzzles.length === 0) return;

  for (const puzzle of openPuzzles as Array<{ id: string; leader_id: string }>) {
    if (await alreadySent(supabase, "puzzle_deadline_reminder", puzzle.id)) continue;

    const { data: leader } = await supabase
      .from("users")
      .select("id, phone")
      .eq("id", puzzle.leader_id)
      .single();

    if (!leader) continue;

    await sendAndLog(supabase, "puzzle_deadline_reminder", puzzle.id, leader, TPL.PUZZLE_DEADLINE_REMINDER, {
      puzzleUrl: puzzleUrl(puzzle.id),
    });
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
// #4 매칭 성사 (조각원 전원) + #5 MD 낙찰
// ============================================================
async function handleMatched(supabase: ReturnType<typeof createClient>) {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data: puzzles } = await supabase
    .from("puzzles")
    .select("id, leader_id, accepted_offer_id, puzzle_offers!accepted_offer_id(md_id, table_type, clubs(name))")
    .eq("status", "accepted")
    .not("accepted_offer_id", "is", null)
    .gte("updated_at", tenMinutesAgo);

  if (!puzzles || puzzles.length === 0) return;

  for (const puzzle of puzzles as Array<{
    id: string;
    leader_id: string;
    accepted_offer_id: string;
    puzzle_offers: { md_id: string; table_type: string; clubs: { name: string } | null } | null;
  }>) {
    const clubName = puzzle.puzzle_offers?.clubs?.name ?? "클럽";
    const tableType = puzzle.puzzle_offers?.table_type ?? "";
    const mdId = puzzle.puzzle_offers?.md_id;

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

    await Promise.allSettled([
      handleFirstOffer(supabase),
      handleDeadlineReminder(supabase),
      handleLeaderChanged(supabase),
      handleMatched(supabase),
    ]);

    console.log("✅ notify-puzzle-events 완료");

    return new Response(
      JSON.stringify({ success: true }),
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
