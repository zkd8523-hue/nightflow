import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { LINEUP_SYSTEM_PROMPT, LINEUP_EMIT_TOOL, LINEUP_VISION_MODEL } from "@/lib/lineups/prompt";
import { normalizeExtraction, type RawExtraction } from "@/lib/lineups/parse";
import { normalizeDjName } from "@/lib/lineups/djName";
import { scoreLineup, canAutoPublish } from "@/lib/lineups/confidence";
import { getBusinessDateISO, resolveLineupDate } from "@/lib/lineups/time";

// 클럽 타임테이블 포스터 → Vision 파싱 → lineup_drafts 저장.
// src/app/api/md/parse-promo/route.ts 와 동일한 골격(SDK 없이 fetch 직접 호출,
// tool_choice로 구조화 출력 강제, 실패는 에러가 아니라 빈 결과)을 따르되:
//   - 모델: claude-sonnet-4-5 (포스터는 장식체·저대비라 haiku로는 부족)
//   - 입력: base64 이미지 (parse-promo는 텍스트)
//   - 권한: admin only (parse-promo는 md+admin)
//   - scrubContacts를 "출력"에 적용 (이미지 입력이라 호출 전 스크럽이 불가능)
//   - 결과를 클라이언트에 그대로 돌려주지 않고 lineup_drafts에 origin='manual'로
//     저장한 뒤 draft_id를 반환한다 — 자동 수집 경로와 같은 테이블로 수렴시키기 위함.
//
// clubId는 옵셔널이다: 안 넘기면 포스터에 찍힌 club_name/club_instagram(프롬프트가
// 함께 읽어냄)으로 clubs 테이블 매칭을 시도한다. 정확히 한 곳으로 좁혀지면 그
// club_id로 바로 draft를 저장하고, 애매하거나(여러 후보) 아예 못 찾으면
// club_lineups.club_id가 NOT NULL이라 draft를 저장할 수 없으므로 대신 파싱 결과와
// 추측 클럽명만 돌려준다 — 화면에서 사람이 클럽을 골라 clubId를 채워 재요청한다.

const MAX_IMAGE_BYTES = 4_000_000; // base64 인코딩 전 대략 3MB 원본에 해당
const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

/** 파싱 실패는 에러가 아니라 "인식 0건"으로 돌려준다 — 화면은 수동 입력으로 유도한다. */
function empty(reason: string) {
  return NextResponse.json({ draftId: null, rows: [], reason }, { status: 200 });
}

/** 클럽명 매칭 정규화 — normalizeDjName과 같은 접근(소문자+영숫자/한글만)을 클럽에도 적용 */
function normalizeClubName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
}

export async function POST(req: NextRequest) {
  let body: {
    imageBase64?: unknown;
    mediaType?: unknown;
    clubId?: unknown;
    imageUrls?: unknown;
    sourceReportId?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { imageBase64, mediaType, clubId, imageUrls, sourceReportId } = body;

  // 두 입력 방식 — 관리자 수동 업로드(base64 1장)와 유저 제보 검토(스토리지 URL 여러 장,
  // 최대 3장). 제보는 이미 lineup-reports 버킷에 올라가 있으므로 재인코딩 없이
  // Vision API에 URL을 그대로 넘긴다.
  const hasBase64 = typeof imageBase64 === "string" && imageBase64.length > 0;
  const hasUrls = Array.isArray(imageUrls) && imageUrls.length > 0 && imageUrls.every((u) => typeof u === "string" && u);
  if (!hasBase64 && !hasUrls) {
    return NextResponse.json({ error: "imageBase64 or imageUrls required" }, { status: 400 });
  }
  if (hasBase64 && hasUrls) {
    return NextResponse.json({ error: "provide either imageBase64 or imageUrls, not both" }, { status: 400 });
  }
  if (hasUrls && (imageUrls as unknown[]).length > 3) {
    return NextResponse.json({ error: "imageUrls max 3" }, { status: 400 });
  }
  if (hasBase64) {
    if (typeof mediaType !== "string" || !ALLOWED_MEDIA_TYPES.has(mediaType)) {
      return NextResponse.json({ error: "unsupported mediaType" }, { status: 400 });
    }
    if ((imageBase64 as string).length > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "image too large" }, { status: 400 });
    }
  }
  // clubId는 옵셔널. 넘겼다면 문자열이어야 한다.
  if (clubId !== undefined && clubId !== null && (typeof clubId !== "string" || !clubId)) {
    return NextResponse.json({ error: "clubId must be a non-empty string when provided" }, { status: 400 });
  }
  if (sourceReportId !== undefined && sourceReportId !== null && typeof sourceReportId !== "string") {
    return NextResponse.json({ error: "sourceReportId must be a string when provided" }, { status: 400 });
  }

  // 인증 — admin only
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(c) {
          c.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "인증이 필요해요" }, { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "관리자 권한이 필요해요" }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return empty("no_key");

  let raw: RawExtraction;
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
        // 8000 인 이유: 3000 으로도 월간 스케줄/다이제스트 포스터가 잘려서
        // "출연자 없음"으로 조용히 떨어졌다(수집 경로 실측 12건 중 4건).
        // 수동 업로드도 같은 툴 스키마를 쓰므로 같은 한도를 준다.
        max_tokens: 8000,
        tool_choice: { type: "tool", name: LINEUP_EMIT_TOOL.name },
        tools: [LINEUP_EMIT_TOOL],
        system: LINEUP_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              // 제보는 이미지 여러 장(포스터 + 캡션 캡처 등)일 수 있다 — 전부 한
              // 메시지에 순서대로 넣는다. base64 경로는 항상 1장.
              ...(hasBase64
                ? [{ type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } }]
                : (imageUrls as string[]).map((url) => ({ type: "image", source: { type: "url", url } }))),
              {
                // "timetable poster" 라고 못박지 않는 이유: 운영자가 올리는 이미지는
                // 포스터 한 장일 수도, 인스타 게시물 스크린샷(포스터+캡션이 한 화면에
                // 글자로 들어있는 것)일 수도 있다. 후자가 오히려 정보가 더 많다 —
                // 포스터엔 이름만 크게 있고 @핸들은 캡션에만 있기 때문이다
                // (예: 포스터 "Sweeny" / 캡션 "@deejaysweeny").
                // 타임테이블을 전제하는 문구는 그 캡션 영역을 안 읽게 만든다.
                type: "text",
                text:
                  "These images are either an event poster, or screenshots of an Instagram post " +
                  "(poster plus its caption as on-screen text) — possibly multiple photos of the " +
                  "same post. Read every part of every image — the poster artwork AND any caption " +
                  "text visible — and extract ONE combined lineup. @handles usually appear only in " +
                  "the caption area.",
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) return empty("upstream_error");

    const data = await res.json();
    // 잘린 응답의 부분 결과는 쓰지 않는다 — 반쯤 채워진 sets 는 "포스터에 이 사람만
    // 있었다"와 화면상 구분이 안 되고, 운영자가 그걸 그대로 게시하게 된다.
    if (data?.stop_reason === "max_tokens") return empty("truncated");
    const block = Array.isArray(data?.content)
      ? data.content.find((c: { type?: string }) => c?.type === "tool_use")
      : null;
    if (!block?.input) return empty("unparsed");

    raw = block.input as RawExtraction;
  } catch {
    return empty("fetch_error");
  }

  const extraction = normalizeExtraction(raw);

  if (extraction.isPromoOnly) {
    return empty("promo_only");
  }

  // 포스터 한 장 = 보통 하루 밤. 월간 스케줄처럼 여러 밤이 찍힌 포스터를 올리는 건
  // 드문 경우라(그건 자동 수집의 캡션 경로가 담당) 첫 이벤트만 쓴다.
  const event = extraction.events[0];
  if (!event || event.rows.length < 1) {
    // 타임테이블이 아니거나 판독 실패 — draft는 남기지 않는다(수동 입력은 재시도가 자유로움)
    return empty("not_timetable");
  }
  const normalized = event;

  // 클럽 자동 매칭: clubId를 안 넘겼으면 포스터가 찍은 club_instagram(우선, 핸들은
  // 오타 여지가 적다) 또는 club_name으로 clubs 테이블에서 정확히 한 곳만 찾아본다.
  // 후보가 0개나 2개 이상이면(동명 클럽, 오독 등) 자동 확정하지 않는다 —
  // lineup_drafts.club_id가 NOT NULL이라 여기서 잘못 고르면 되돌릴 수 없다.
  let resolvedClubId = typeof clubId === "string" ? clubId : null;
  let matchedClubName: string | null = null;
  let clubMatchCandidates: { id: string; name: string; area: string | null }[] = [];

  if (!resolvedClubId) {
    // event는 이미 normalizeExtraction을 거쳐 검증된 값이라(venueInstagram은
    // sanitizeHandle 통과분) raw보다 이쪽을 신뢰한다.
    const rawClubName = event.venueName ?? "";
    const rawClubInstagram = event.venueInstagram ?? "";

    if (rawClubInstagram) {
      const { data: byInstagram } = await supabaseAdmin
        .from("clubs")
        .select("id, name, area")
        .ilike("instagram", rawClubInstagram)
        .is("deleted_at", null)
        .limit(2);
      if (byInstagram?.length === 1) {
        resolvedClubId = byInstagram[0].id;
        matchedClubName = byInstagram[0].name;
      }
    }

    if (!resolvedClubId && rawClubName) {
      const target = normalizeClubName(rawClubName);
      const { data: allClubs } = await supabaseAdmin
        .from("clubs")
        .select("id, name, area")
        .is("deleted_at", null)
        .eq("status", "approved");
      const candidates = (allClubs ?? []).filter((c) => {
        const n = normalizeClubName(c.name);
        return n === target || n.includes(target) || target.includes(n);
      });
      if (candidates.length === 1) {
        resolvedClubId = candidates[0].id;
        matchedClubName = candidates[0].name;
      } else if (candidates.length > 1) {
        clubMatchCandidates = candidates;
      }
    }
  }

  if (!resolvedClubId) {
    // 매칭 실패 — draft 저장 없이 파싱 결과 + 추측 정보만 돌려준다. 화면이 클럽
    // 선택 UI를 띄우고, 사람이 고른 뒤 clubId를 채워 이 라우트를 다시 호출한다.
    return NextResponse.json(
      {
        draftId: null,
        reason: "club_unresolved",
        guessedClubName: event.venueName,
        guessedClubInstagram: event.venueInstagram,
        clubMatchCandidates,
        // 사람이 클럽만 고르면 재파싱 없이 바로 저장할 수 있도록 파싱 결과를 함께 보낸다.
        pendingParse: { raw, normalized },
      },
      { status: 200 }
    );
  }

  // 날짜 확정: 포스터의 "MM-DD"를 오늘 기준으로 검증해 연도를 붙인다.
  // 수동 업로드라 게시 시각이 없으므로 기준은 "오늘". 포스터에 월 없이 일자만 있으면
  // Vision이 월을 지어내므로(자동 수집에서 8월 포스터가 11월로 저장된 전례),
  // 오늘로부터 -3일~+90일을 벗어나면 신뢰하지 않고 오늘로 폴백한다.
  // 운영자가 Admin 화면에서 날짜를 직접 고칠 수 있으니 폴백이 최종 판단은 아니다.
  const today = getBusinessDateISO();
  const resolvedDate = resolveLineupDate(normalized.eventMonthDay, `${today}T12:00:00Z`);
  const eventDate = resolvedDate ?? today;
  const eventDateSource: "poster" | "media_timestamp" = resolvedDate ? "poster" : "media_timestamp";

  // DJ 별칭 매칭
  const normalizedNames = normalized.rows.map((r) => normalizeDjName(r.raw_name || ""));
  const { data: aliasRows } = await supabaseAdmin
    .from("dj_aliases")
    .select("normalized, dj_id")
    .in("normalized", normalizedNames.filter(Boolean));
  const aliasMap = new Map((aliasRows ?? []).map((a) => [a.normalized, a.dj_id as string]));

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
  const autoOk = canAutoPublish(confidence, scoreInput.sets);

  const { data: draft, error: insertError } = await supabaseAdmin
    .from("lineup_drafts")
    .insert({
      club_id: resolvedClubId,
      origin: sourceReportId ? "report" : "manual",
      source_report_id: (sourceReportId as string | undefined) ?? null,
      parsed: raw,
      normalized: {
        event_date: eventDate,
        door_open_min: normalized.doorOpenMin,
        event_title: normalized.eventTitle,
        sets: scoreInput.sets,
      },
      confidence: confidence.score,
      confidence_detail: { ...confidence.detail, blockers: confidence.blockers },
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !draft) {
    return NextResponse.json({ error: "draft 저장 실패" }, { status: 500 });
  }

  return NextResponse.json(
    {
      draftId: draft.id,
      clubId: resolvedClubId,
      matchedClubName,
      normalized: { eventDate, doorOpenMin: normalized.doorOpenMin, eventTitle: normalized.eventTitle },
      rows: scoreInput.sets,
      confidence: confidence.score,
      confidenceDetail: confidence.detail,
      blockers: confidence.blockers,
      canAutoPublish: autoOk,
    },
    { status: 200 }
  );
}
