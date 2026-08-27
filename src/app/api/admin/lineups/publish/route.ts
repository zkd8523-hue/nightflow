import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { normalizeDjName } from "@/lib/lineups/djName";

// draft 편집 결과 → upsert_club_lineup() RPC → draft 상태 마감.
// 수동/자동 공용 편집기가 최종적으로 호출하는 단일 저장 지점.
//
// sets 배열의 각 원소는 djId가 있으면 그대로 쓰고, 없으면 newDjName으로 새 DJ를
// 생성한다("+ 새 DJ 등록"). aliasToLearn이 있으면(기본 체크 ON) 그 표기를
// dj_aliases에 추가한다 — 다음 포스터부터 자동 매칭되게 하는 "별칭 자동 학습".

interface PublishSet {
  // 캡션에서 온 라인업은 시간이 없다(순서만) — Migration 573
  startMin: number | null;
  endMin: number | null;
  rawName: string;
  djId?: string | null;
  /** djId가 없을 때 새로 만들 DJ의 표시명 */
  newDjName?: string;
  newDjInstagram?: string | null;
  /** rawName을 dj_aliases에 추가할지 (기본 true) */
  learnAlias?: boolean;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .replace(/\s+/g, "-");
  return base || `dj-${Date.now()}`;
}

export async function POST(req: NextRequest) {
  let body: {
    draftId?: unknown;
    clubId?: unknown;
    eventDate?: unknown;
    doorOpenMin?: unknown;
    eventTitle?: unknown;
    posterUrl?: unknown;
    sets?: unknown;
    source?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { draftId, clubId, eventDate, doorOpenMin, eventTitle, posterUrl, sets, source } = body;

  if (typeof clubId !== "string" || !clubId) {
    return NextResponse.json({ error: "clubId required" }, { status: 400 });
  }
  if (typeof eventDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return NextResponse.json({ error: "eventDate must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!Array.isArray(sets) || sets.length < 1) {
    return NextResponse.json({ error: "sets required" }, { status: 400 });
  }

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

  // 1) djId가 없는 행은 새 DJ 생성
  const resolvedSets: { dj_id: string; start_min: number | null; end_min: number | null; raw_name: string | null }[] = [];

  for (const s of sets as PublishSet[]) {
    let djId = s.djId ?? null;

    if (!djId) {
      if (!s.newDjName || !s.newDjName.trim()) {
        return NextResponse.json({ error: `DJ 미지정 행이 있습니다: ${s.rawName}` }, { status: 400 });
      }
      const displayName = s.newDjName.trim();
      const normalized = normalizeDjName(displayName);

      // 재시도 안전성: 이전 시도가 DJ까지 만들고 그 뒤 단계(예: RPC)에서 실패했다면,
      // 같은 이름으로 다시 "게시하기"를 누를 때 새로 INSERT하면 slug/alias UNIQUE에
      // 걸린다(실제 재현됨). 먼저 별칭으로 기존 DJ를 찾아 있으면 그걸 재사용한다.
      const { data: existingAlias } = await supabaseAdmin
        .from("dj_aliases")
        .select("dj_id")
        .eq("normalized", normalized)
        .maybeSingle();

      if (existingAlias) {
        djId = existingAlias.dj_id;
      } else {
        const slug = slugify(displayName);
        const { data: newDj, error: djError } = await supabaseAdmin
          .from("djs")
          .insert({ display_name: displayName, slug, instagram: s.newDjInstagram || null })
          .select("id")
          .single();

        if (djError?.code === "23505") {
          // slug 경합(동시 요청 등) — display_name으로 재조회해 이어간다
          const { data: existingDj } = await supabaseAdmin
            .from("djs")
            .select("id")
            .eq("slug", slug)
            .maybeSingle();
          if (!existingDj) {
            return NextResponse.json({ error: `DJ 생성 실패: ${displayName} (${djError.message})` }, { status: 500 });
          }
          djId = existingDj.id;
        } else if (djError || !newDj) {
          return NextResponse.json({ error: `DJ 생성 실패: ${displayName}${djError ? ` (${djError.message})` : ""}` }, { status: 500 });
        } else {
          djId = newDj.id;
        }

        // 새 DJ 자체 이름도 별칭으로 등록해 다음 포스터부터 매칭되게 한다
        await supabaseAdmin
          .from("dj_aliases")
          .insert({ dj_id: djId, alias: displayName, normalized })
          .select()
          .maybeSingle();
      }
    }

    // 2) 별칭 학습 (기본 ON) — 포스터 원문 표기가 정본 이름과 다르면 별칭으로 추가
    if (s.learnAlias !== false && s.rawName && s.rawName.trim()) {
      const normalized = normalizeDjName(s.rawName);
      await supabaseAdmin
        .from("dj_aliases")
        .insert({ dj_id: djId, alias: s.rawName.trim(), normalized })
        .select()
        .maybeSingle(); // UNIQUE(normalized) 충돌은 이미 매칭된 것이므로 조용히 무시
    }

    resolvedSets.push({
      dj_id: djId,
      start_min: s.startMin,
      end_min: s.endMin,
      raw_name: s.rawName ?? null,
    });
  }

  // 3) upsert_club_lineup RPC
  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc("upsert_club_lineup", {
    p_club_id: clubId,
    p_event_date: eventDate,
    p_door_open_min: typeof doorOpenMin === "number" ? doorOpenMin : null,
    p_event_title: typeof eventTitle === "string" ? eventTitle : null,
    p_poster_url: typeof posterUrl === "string" ? posterUrl : null,
    p_sets: resolvedSets,
    p_source: typeof source === "string" ? source : "admin_manual",
    p_draft_id: typeof draftId === "string" ? draftId : null,
  });

  // RPC 결과가 실제로 유효한 lineup_id를 담고 있는지 명시적으로 검증한다.
  // 과거에 rpcError가 안 잡히고 rpcResult만 truthy한 이상값이 들어와 draft가
  // status='published'로 마감됐는데 실제 club_lineups 행은 없는 사고가 있었다
  // (RLS 권한 부족으로 RPC 예외가 던져졌어야 할 시점에 발생, 실제 데이터로 확인됨).
  // "저장됐다고 표시됐지만 실제로는 없음" 상태가 재발하지 않도록 lineup_id 자체를 검증한다.
  const lineupId = rpcResult && typeof rpcResult === "object" ? (rpcResult as { lineup_id?: unknown }).lineup_id : null;
  if (rpcError || typeof lineupId !== "string" || !lineupId) {
    return NextResponse.json({ error: rpcError?.message ?? "저장 실패: RPC가 유효한 결과를 반환하지 않았어요" }, { status: 500 });
  }

  // 저장이 실제로 반영됐는지 재조회로 한 번 더 확인 — draft를 published로 마감하기 전
  // 마지막 방어선. 이 확인 없이 status만 바꾸면 데이터 없이 "완료"로 보이는 상태가 된다.
  const { data: savedLineup, error: verifyError } = await supabaseAdmin
    .from("club_lineups")
    .select("id")
    .eq("id", lineupId)
    .maybeSingle();
  if (verifyError || !savedLineup) {
    return NextResponse.json({ error: "저장 확인 실패: club_lineups에서 방금 만든 행을 찾지 못했어요" }, { status: 500 });
  }

  // 4) draft 상태 마감 (저장 검증 통과 후에만)
  if (typeof draftId === "string") {
    const { data: updatedDraft } = await supabaseAdmin
      .from("lineup_drafts")
      .update({
        status: "published",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        lineup_id: lineupId,
      })
      .eq("id", draftId)
      .select("source_report_id")
      .maybeSingle();

    // 이 draft가 유저 제보에서 왔으면 제보 쪽도 게시됨으로 닫는다 — 그래야
    // 제보 검토 탭에서 안 사라지고 계속 대기 중으로 남는 걸 막는다.
    if (updatedDraft?.source_report_id) {
      await supabaseAdmin
        .from("lineup_reports")
        .update({
          status: "published",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          published_lineup_id: lineupId,
        })
        .eq("id", updatedDraft.source_report_id);
    }
  }

  return NextResponse.json({ success: true, lineupId }, { status: 200 });
}
