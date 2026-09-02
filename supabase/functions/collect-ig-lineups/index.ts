// Deno Edge Function: Instagram business_discovery API를 폴링해 클럽 타임테이블
// 포스터를 자동 수집 → Vision 파싱 → 신뢰도 채점 → lineup_drafts 에 저장한다.
//
// 트리거: pg_cron 매일 06:00, 12:00 UTC (KST 15시/21시) — Migration 562
//         또는 검토 큐 화면의 "지금 수집" 수동 버튼 { "mode": "manual", "source_ids": [...] }
//
// 필요한 시크릿 (Supabase secrets set):
//   IG_APP_ID, IG_APP_SECRET, IG_LONG_LIVED_TOKEN, IG_BUSINESS_ACCOUNT_ID
//   ANTHROPIC_API_KEY (Vision 파싱용 — Vercel과 별도로 Supabase secrets에도 등록 필요)
//
// 토큰 만료 방어: 장기 토큰은 60일 만료. Edge Function은 secret을 스스로 못 바꾸므로
// 자기 갱신이 불가능하다 — 매 실행 시 debug_token 으로 남은 수명을 확인하고
// 14일 미만이면 관리자 푸시를 보낸다(notify_admins_push, DB 함수 직접 호출).
//
// 멱등성: lineup_drafts.ig_permalink 의 UNIQUE 제약이 중복 방지의 정본이다.
// draft INSERT를 Vision 호출보다 먼저 해서 permalink를 선점 — 함수가 중간에
// 죽어도 다음 실행이 같은 게시물에 다시 Vision 비용을 쓰지 않는다.
//
// Rate limit 가드: business_discovery 응답의 x-app-usage 헤더 call_count가
// 80을 넘으면 남은 소스를 건너뛰고 정상 종료한다. 다음 실행이 last_polled_at
// ASC 순서로 못 본 소스부터 이어받으므로 재시도 로직이 따로 필요 없다.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

import { LINEUP_SYSTEM_PROMPT, LINEUP_EMIT_TOOL, LINEUP_VISION_MODEL } from "../_shared/lineup-prompt.ts";
import { fetchImageToStorage, permalinkHash } from "../_shared/fetch-to-storage.ts";
import {
  normalizeDjName,
  normalizeParsedLineup,
  scoreLineup,
  canAutoPublish,
  passesPreVisionGate,
  getBusinessDateISO,
  resolveLineupDate,
  type RawParsedLineup,
} from "../_shared/lineup-logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOURCE_LIMIT = 150;
const MEDIA_PER_SOURCE = 6;
const RATE_LIMIT_CALL_COUNT_GUARD = 80;
const CONSECUTIVE_FAILURE_QUARANTINE = 3;
const TOKEN_WARNING_DAYS = 14;
const SLEEP_MS_BETWEEN_SOURCES = 200;
const POSTER_BUCKET = "lineup-posters";
const AUTO_PUBLISH_ENABLED = (Deno.env.get("IG_AUTO_PUBLISH_ENABLED") ?? "false") === "true";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface IgMedia {
  media_url?: string;
  caption?: string;
  timestamp?: string;
  permalink?: string;
  media_type?: string;
}

interface RunStats {
  sources_attempted: number;
  sources_ok: number;
  sources_failed: number;
  media_seen: number;
  media_new: number;
  drafts_created: number;
  auto_published: number;
  queued_for_review: number;
  not_timetable: number;
  errors: Array<{ source_id: string; ig_username: string; stage: string; message: string }>;
}

async function debugTokenLifetime(appId: string, appSecret: string, token: string): Promise<number | null> {
  try {
    const url = `https://graph.facebook.com/debug_token?input_token=${token}&access_token=${appId}|${appSecret}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const expiresAt = data?.data?.expires_at;
    if (!expiresAt) return null;
    return Math.floor((expiresAt - Date.now() / 1000) / 86400); // 남은 일수
  } catch {
    return null;
  }
}

async function fetchBusinessDiscovery(
  igBusinessAccountId: string,
  token: string,
  username: string
): Promise<{ media: IgMedia[]; callCount: number | null } | { error: string }> {
  const fields = `business_discovery.username(${username}){media.limit(${MEDIA_PER_SOURCE}){media_url,caption,timestamp,permalink,media_type}}`;
  const url = `https://graph.facebook.com/v21.0/${igBusinessAccountId}?fields=${encodeURIComponent(fields)}&access_token=${token}`;

  const res = await fetch(url);
  const callCount = (() => {
    try {
      const usage = JSON.parse(res.headers.get("x-app-usage") ?? "{}");
      return typeof usage.call_count === "number" ? usage.call_count : null;
    } catch {
      return null;
    }
  })();

  if (!res.ok) {
    const body = await res.text();
    return { error: `HTTP ${res.status}: ${body.slice(0, 300)}` };
  }

  const data = await res.json();
  const media = data?.business_discovery?.media?.data;
  if (!Array.isArray(media)) return { error: "no business_discovery.media in response" };

  return { media, callCount };
}

async function callVision(apiKey: string, imageUrl: string): Promise<RawParsedLineup | null> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: LINEUP_VISION_MODEL,
        max_tokens: 2000,
        tool_choice: { type: "tool", name: LINEUP_EMIT_TOOL.name },
        tools: [LINEUP_EMIT_TOOL],
        system: LINEUP_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url: imageUrl } },
              { type: "text", text: "Extract the DJ lineup from this timetable poster." },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // deno-lint-ignore no-explicit-any
    const block = Array.isArray(data?.content) ? data.content.find((c: any) => c?.type === "tool_use") : null;
    return block?.input ?? null;
  } catch {
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = new Date();
  const stats: RunStats = {
    sources_attempted: 0,
    sources_ok: 0,
    sources_failed: 0,
    media_seen: 0,
    media_new: 0,
    drafts_created: 0,
    auto_published: 0,
    queued_for_review: 0,
    not_timetable: 0,
    errors: [],
  };

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: { mode?: string; source_ids?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // 빈 바디(cron)도 정상
  }
  const trigger: "cron" | "manual" = body.mode === "manual" ? "manual" : "cron";

  const { data: runRow, error: runInsertError } = await supabase
    .from("collection_runs")
    .insert({ started_at: startedAt.toISOString(), trigger })
    .select("id")
    .single();
  if (runInsertError || !runRow) {
    console.error("collection_runs INSERT 실패:", runInsertError);
    return new Response(JSON.stringify({ ok: false, error: "run log insert failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const runId = runRow.id;

  const appId = Deno.env.get("IG_APP_ID");
  const appSecret = Deno.env.get("IG_APP_SECRET");
  const token = Deno.env.get("IG_LONG_LIVED_TOKEN");
  const igBusinessAccountId = Deno.env.get("IG_BUSINESS_ACCOUNT_ID");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!appId || !appSecret || !token || !igBusinessAccountId) {
    stats.errors.push({ source_id: "-", ig_username: "-", stage: "config", message: "IG secrets not configured" });
    await finalizeRun(supabase, runId, startedAt, stats);
    return new Response(JSON.stringify({ ok: false, error: "IG secrets not configured", stats }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 토큰 수명 체크 → 14일 미만이면 관리자 푸시
  const remainingDays = await debugTokenLifetime(appId, appSecret, token);
  if (remainingDays !== null && remainingDays < TOKEN_WARNING_DAYS) {
    await supabase.rpc("notify_admins_push", {
      p_title: "⚠️ 인스타 토큰 만료 임박",
      p_body: `IG_LONG_LIVED_TOKEN이 ${remainingDays}일 후 만료됩니다. 갱신 후 supabase secrets set 필요.`,
      p_data: { url: "/admin/lineups" },
    });
  }

  // 대상 선택
  let sourceQuery = supabase
    .from("ig_sources")
    .select("id, club_id, ig_username, last_media_timestamp, consecutive_failures")
    .eq("is_active", true);

  if (trigger === "manual" && Array.isArray(body.source_ids) && body.source_ids.length > 0) {
    sourceQuery = sourceQuery.in("id", body.source_ids);
  } else {
    sourceQuery = sourceQuery
      .or(`last_polled_at.is.null,last_polled_at.lt.${new Date(Date.now() - 5 * 3600 * 1000).toISOString()}`)
      .order("last_polled_at", { ascending: true, nullsFirst: true })
      .limit(SOURCE_LIMIT);
  }

  const { data: sources, error: sourcesError } = await sourceQuery;
  if (sourcesError || !sources) {
    stats.errors.push({ source_id: "-", ig_username: "-", stage: "source_select", message: String(sourcesError) });
    await finalizeRun(supabase, runId, startedAt, stats);
    return new Response(JSON.stringify({ ok: false, error: "source select failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let rateLimited = false;

  for (const source of sources) {
    if (rateLimited) break;
    stats.sources_attempted += 1;

    const result = await fetchBusinessDiscovery(igBusinessAccountId, token, source.ig_username);

    if ("error" in result) {
      stats.sources_failed += 1;
      stats.errors.push({ source_id: source.id, ig_username: source.ig_username, stage: "fetch", message: result.error });

      const newFailures = (source.consecutive_failures ?? 0) + 1;
      await supabase
        .from("ig_sources")
        .update({
          consecutive_failures: newFailures,
          last_error: result.error,
          is_active: newFailures >= CONSECUTIVE_FAILURE_QUARANTINE ? false : true,
          last_polled_at: new Date().toISOString(),
        })
        .eq("id", source.id);

      await sleep(SLEEP_MS_BETWEEN_SOURCES);
      continue;
    }

    stats.sources_ok += 1;
    stats.media_seen += result.media.length;

    if (result.callCount !== null && result.callCount > RATE_LIMIT_CALL_COUNT_GUARD) {
      stats.errors.push({ source_id: source.id, ig_username: source.ig_username, stage: "rate_limit_guard", message: `call_count=${result.callCount}` });
      rateLimited = true;
    }

    const lastSeen = source.last_media_timestamp ? new Date(source.last_media_timestamp).getTime() : 0;
    let maxTimestamp = lastSeen;

    for (const media of result.media) {
      const mediaTime = media.timestamp ? new Date(media.timestamp).getTime() : 0;
      if (mediaTime <= lastSeen) continue; // 이미 본 콘텐츠 (콘텐츠 커서)
      if (mediaTime > maxTimestamp) maxTimestamp = mediaTime;

      if (!passesPreVisionGate(media.media_type ?? "", media.media_url ?? null, media.caption ?? null)) continue;
      if (!media.permalink) continue;

      stats.media_new += 1;

      // draft INSERT를 Vision 호출보다 먼저 — permalink 선점으로 재실행 안전성 확보.
      const { data: draft, error: draftInsertError } = await supabase
        .from("lineup_drafts")
        .insert({
          club_id: source.club_id,
          source_id: source.id,
          origin: "ig",
          ig_permalink: media.permalink,
          ig_media_timestamp: media.timestamp ?? null,
          ig_caption: media.caption ?? null,
          status: "pending",
        })
        .select("id")
        .single();

      if (draftInsertError || !draft) {
        // UNIQUE(ig_permalink) 충돌 = 이미 처리된 게시물. 정상 스킵.
        continue;
      }
      stats.drafts_created += 1;

      if (!media.media_url) {
        await supabase.from("lineup_drafts").update({ status: "parse_failed" }).eq("id", draft.id);
        continue;
      }

      // Storage에 먼저 저장 (media_url은 만료되므로 Vision 호출 전에 옮긴다)
      const hash = await permalinkHash(media.permalink);
      const yearMonth = new Date().toISOString().slice(0, 7);
      const posterUrl = await fetchImageToStorage(
        supabase,
        media.media_url,
        POSTER_BUCKET,
        `${source.club_id}/${yearMonth}/${hash}.jpg`
      );
      if (posterUrl) {
        await supabase.from("lineup_drafts").update({ poster_url: posterUrl }).eq("id", draft.id);
      }

      if (!anthropicKey) {
        await supabase.from("lineup_drafts").update({ status: "parse_failed" }).eq("id", draft.id);
        continue;
      }

      const raw = await callVision(anthropicKey, posterUrl ?? media.media_url);
      if (!raw) {
        await supabase.from("lineup_drafts").update({ status: "parse_failed" }).eq("id", draft.id);
        continue;
      }

      const normalized = normalizeParsedLineup(raw);
      if (normalized.rows.length < 2) {
        stats.not_timetable += 1;
        await supabase.from("lineup_drafts").update({ status: "not_timetable", parsed: raw }).eq("id", draft.id);
        continue;
      }

      // 날짜 확정 — 포스터 MM-DD + 게시 시각 대조.
      // 예전엔 `${올해}-${MM-DD}`로 그냥 붙였는데, 포스터에 월 없이 일자만 있으면
      // (예: "[28. FRI]") Vision이 월을 지어내 8월 게시물이 11월로 저장되는 사고가 났다.
      // resolveLineupDate가 게시일 기준 -3일~+90일을 벗어나는 값을 null로 돌려주면
      // 게시 시각(영업일 기준)으로 폴백한다.
      const today = getBusinessDateISO();
      const resolvedDate = resolveLineupDate(normalized.eventMonthDay, media.timestamp ?? null);
      const eventDate = resolvedDate ?? today;
      const eventDateSource: "poster" | "media_timestamp" = resolvedDate ? "poster" : "media_timestamp";

      // DJ 별칭 매칭
      const normalizedNames = normalized.rows.map((r) => normalizeDjName(r.raw_name || ""));
      const { data: aliasRows } = await supabase
        .from("dj_aliases")
        .select("normalized, dj_id")
        .in("normalized", normalizedNames.filter(Boolean));
      const aliasMap = new Map<string, string>(
        (aliasRows ?? []).map((a: { normalized: string; dj_id: string }) => [a.normalized, a.dj_id])
      );

      const scoreInput = {
        sets: normalized.rows.map((r, i) => ({
          raw_name: r.raw_name,
          start_min: r.start_min,
          end_min: r.end_min,
          matchedDjId: aliasMap.get(normalizedNames[i]) ?? null,
        })),
        eventDateResolved: true,
        eventDateSource,
        doorOpenMin: normalized.doorOpenMin,
        droppedRowCount: normalized.droppedRowCount,
      };
      const confidence = scoreLineup(scoreInput);
      const willAutoPublish = AUTO_PUBLISH_ENABLED && canAutoPublish(confidence, scoreInput.sets);

      const normalizedPayload = {
        event_date: eventDate,
        door_open_min: normalized.doorOpenMin,
        event_title: normalized.eventTitle,
        sets: scoreInput.sets,
      };

      if (willAutoPublish) {
        const { data: rpcResult, error: rpcError } = await supabase.rpc("upsert_club_lineup", {
          p_club_id: source.club_id,
          p_event_date: eventDate,
          p_door_open_min: normalized.doorOpenMin,
          p_event_title: normalized.eventTitle,
          p_poster_url: posterUrl,
          p_sets: scoreInput.sets.map((s) => ({ dj_id: s.matchedDjId, start_min: s.start_min, end_min: s.end_min, raw_name: s.raw_name })),
          p_source: "ig_auto",
          p_draft_id: draft.id,
          // 라인업 상세의 "원본 게시물 보기" (Migration 626)
          p_source_url: media.permalink,
          p_source_account: source.ig_username,
        });

        if (rpcError || !rpcResult) {
          stats.errors.push({ source_id: source.id, ig_username: source.ig_username, stage: "auto_publish", message: String(rpcError) });
          await supabase
            .from("lineup_drafts")
            .update({ parsed: raw, normalized: normalizedPayload, confidence: confidence.score, confidence_detail: { ...confidence.detail, blockers: confidence.blockers }, status: "pending" })
            .eq("id", draft.id);
          stats.queued_for_review += 1;
        } else {
          await supabase
            .from("lineup_drafts")
            .update({
              parsed: raw,
              normalized: normalizedPayload,
              confidence: confidence.score,
              confidence_detail: { ...confidence.detail, blockers: confidence.blockers },
              status: "auto_published",
              lineup_id: (rpcResult as { lineup_id: string }).lineup_id,
            })
            .eq("id", draft.id);
          stats.auto_published += 1;
        }
      } else {
        await supabase
          .from("lineup_drafts")
          .update({
            parsed: raw,
            normalized: normalizedPayload,
            confidence: confidence.score,
            confidence_detail: { ...confidence.detail, blockers: confidence.blockers },
            status: "pending",
          })
          .eq("id", draft.id);
        stats.queued_for_review += 1;
      }
    }

    const sourceUpdate: Record<string, unknown> = {
      last_polled_at: new Date().toISOString(),
      last_media_timestamp: maxTimestamp > 0 ? new Date(maxTimestamp).toISOString() : source.last_media_timestamp,
      consecutive_failures: 0,
    };
    if (result.media.length > 0) {
      sourceUpdate.last_success_at = new Date().toISOString();
    }
    await supabase.from("ig_sources").update(sourceUpdate).eq("id", source.id);

    await sleep(SLEEP_MS_BETWEEN_SOURCES);
  }

  await finalizeRun(supabase, runId, startedAt, stats);

  return new Response(JSON.stringify({ ok: true, stats }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

// deno-lint-ignore no-explicit-any
async function finalizeRun(supabase: any, runId: string, startedAt: Date, stats: RunStats) {
  const finishedAt = new Date();
  await supabase
    .from("collection_runs")
    .update({
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      sources_attempted: stats.sources_attempted,
      sources_ok: stats.sources_ok,
      sources_failed: stats.sources_failed,
      media_seen: stats.media_seen,
      media_new: stats.media_new,
      drafts_created: stats.drafts_created,
      auto_published: stats.auto_published,
      queued_for_review: stats.queued_for_review,
      not_timetable: stats.not_timetable,
      errors: stats.errors,
    })
    .eq("id", runId);
}
