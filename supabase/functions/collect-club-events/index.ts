// ============================================================================
// Deno Edge Function: 클럽 공연 정보 자동 수집 (collect-club-events)
// Cron: 매일 00:00 UTC (09:00 KST) — Migration 574
//
// 동작:
//   1. 수집 대상 = @hiphopplayacalendar 큐레이션
//      + club_name_registry에 instagram_handle이 채워진 모든 장소
//        (clubs 등록 여부 무관 — 클럽이든 공연장이든 핸들만 알면 계속 감시)
//      → 큐레이션에서 새 핸들이 발견되면 다음 실행부터 자동 감시 편입 (자가 확장).
//      클럽 매칭(club_id)은 이 감시 목록과 별개로, NightFlow 노출용으로만 쓰인다.
//   2. Apify Instagram Scraper 비동기 실행 → 계정별 최근 게시물 수집
//   3. 게시물 1건당 추출은 2단계:
//        1단계 — 캡션만 Haiku(싸다). 홍보물이거나 출연자가 나오면 여기서 끝.
//        2단계 — 1단계가 출연자를 하나도 못 찾았고 이미지가 있을 때만 포스터를
//               Sonnet Vision(캡션도 같이 넘긴다). 실측상 158건 중 45건(28%)에서만
//               Vision이 성과를 냈다 — 무턱대고 전부 Vision을 태우던 예전보다
//               호출이 1/3로 준다.
//      두 단계 모두 같은 프롬프트/툴(LINEUP_EMIT_TOOL)을 쓴다 — 게시물 하나에서
//      가수(artist)와 DJ가 섞여 나오면 역할별로 갈라 양쪽에 저장한다(한쪽만 쓰던
//      예전엔 SOUNDCLASH 게시물이 DJ 8명을 통째로 잃은 사고가 있었다).
//   4. 자동 승인 + 이상 건 플래그:
//      - club_events: 날짜 없음/과거/6개월 이상 미래/라인업 없음/해외 지역 → flagged
//      - club_lineups: 판독 품질이 약하면(이름 못 읽은 행 있음, 또는 시간 없는
//        셋 1개뿐) 즉시 게시하지 않고 lineup_drafts를 'pending'으로 남겨
//        /admin/lineups 검토 큐로 보낸다. 그 외엔 예전처럼 바로 게시(무인 자동).
//
// 시간 예산: 함수 wall-clock 한도 대비 ELAPSED_BUDGET_MS 초과 시 정상 종료.
//   미처리 게시물은 아직 INSERT 전이므로 다음 실행에서 자동으로 다시 잡힘.
// 비용: Apify Starter($29/월 선불 크레딧) 안에서 매일 수집. LLM은 게시물당
//   Haiku 1회(대부분 여기서 끝) + Vision은 그중 일부만.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { LINEUP_SYSTEM_PROMPT, LINEUP_EMIT_TOOL, LINEUP_TEXT_MODEL, LINEUP_VISION_MODEL } from "../_shared/lineup-prompt.ts";
import {
  normalizeExtraction,
  normalizeDjName,
  passesPreVisionGate,
  extractPerformerHandles,
  resolveLineupDate,
  type RawExtraction,
  type NormalizedExtractionEvent,
  type NormalizedExtractionSetRow,
} from "../_shared/lineup-logic.ts";
import { fetchImageToStorage, permalinkHash } from "../_shared/fetch-to-storage.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APIFY_API_TOKEN = Deno.env.get("APIFY_API_TOKEN")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const CURATION_ACCOUNT = "hiphopplayacalendar";
// Apify Starter($29/월 선불 크레딧, 이월 없음)로 매일 수집한다.
//
// ⚠️ 이 값은 "상한"이지 "청구 건수"가 아니다(2026-08-30 실측).
// 아래 onlyPostsNewerThan이 액터 쪽에서 먼저 적용되므로, 그 기간에 올라온 글이
// 없으면 깊이를 올려도 결과가 늘지 않는다. 5개 계정으로 깊이 3·5·8을 돌린 결과
// 셋 다 청구 8건으로 동일했다. 즉 실제 비용은 클럽들의 게시 빈도가 정한다.
//
// 그래서 깊이는 넉넉히 잡는다 — 게시가 잦은 클럽을 놓치지 않기 위해서다.
// 실측: Shape가 사흘 새 3건, Box Seoul이 주 2~3회 타임테이블을 올린다.
// 깊이 3이면 이런 클럽에서 최신 글이 잘려나간다.
//
// ⚠️ skipPinnedPosts는 이 액터에서 실제로 동작하지 않는다(true/false 결과가
//    동일함을 실측). 고정글은 대부분 오래된 글이라 날짜 필터가 대신 걸러준다 —
//    HIVE는 고정글 3개(📌)가 맨 위에 있어 깊이 3으로는 진짜 라인업이 안 보였는데,
//    날짜 필터를 넣으니 8/27 주말 라인업이 정상적으로 잡혔다.
const POSTS_PER_CLUB = 8;

// 게시된 지 이보다 오래된 글은 수집·파싱하지 않는다.
//
// 왜 3일인가: 수집기는 매일 돈다. 어제·오늘 글만 보면 충분하지만, 실행이 하루
// 밀리면(장애·배포·Apify 오류) 그 사이 게시물을 영영 놓친다 — ig_permalink가
// UNIQUE라 한 번 건너뛴 글은 다시 수집되지 않는다. 하루치 여유를 둔 값이다.
//
// 더 늘려도 얻는 게 거의 없다(실측 2026-08-30): 8/27~29 수집에서 3일 이상 된
// 게시물 6건 중 5건이 not_timetable이었다. 반대로 이 값이 곧 Apify 청구 건수를
// 정한다 — 아래 POSTS_PER_CLUB이 아니라 이 기간이 실제 비용을 좌우한다.
const CLUB_POST_MAX_AGE_DAYS = 3;

/** 게시물이 너무 오래됐나. timestamp가 없으면(=알 수 없음) 통과시킨다. */
function isStalePost(timestamp: string | null | undefined): boolean {
  if (!timestamp) return false;
  const posted = new Date(timestamp);
  if (Number.isNaN(posted.getTime())) return false;
  return (Date.now() - posted.getTime()) / 86_400_000 > CLUB_POST_MAX_AGE_DAYS;
}
// waitUntil 백그라운드 실행이라 HTTP 150초 제한과 무관. 다만 무한정 돌 수는 없으므로
// 상한을 둔다. 미처리 게시물은 아직 draft/이벤트가 안 만들어졌으므로 다음 실행에서
// 자동으로 다시 잡힌다.
const ELAPSED_BUDGET_MS = 1_500_000; // 25분

// 게시물 처리(캡션 LLM, 필요시 Storage 저장+Vision)를 몇 건씩 동시에 굴릴지.
// 대부분 캡션 단계(Haiku)에서 끝나 빠르지만, Vision까지 가는 일부 게시물이
// 병목이 되지 않도록 동시성을 둔다.
const POST_CONCURRENCY = 4;
const APIFY_POLL_INTERVAL_MS = 10_000;
const APIFY_POLL_MAX_MS = 240_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Apify의 type 값("Image"/"Sidecar"/"Video")을 Graph API 표기로 변환.
// passesPreVisionGate가 business_discovery 기준(IMAGE/CAROUSEL_ALBUM)으로
// 작성돼 있어, 변환 없이 넘기면 모든 게시물이 걸러진다(실측: Vision 0건).
const APIFY_TYPE_MAP: Record<string, string> = { Image: "IMAGE", Sidecar: "CAROUSEL_ALBUM", Video: "VIDEO" };

// 해외 지역 키워드 — 국내 서비스 범위 밖 → flagged
const OVERSEAS = ["도쿄", "타이페이", "하노이", "홍콩", "상하이", "방콕", "오사카", "TOKYO", "TAIPEI", "HANOI", "HONG KONG", "BANGKOK"];

// ---------------------------------------------------------------------------
// 홍보물 1차 거르기 — 정규식으로 "확실한" 것만 걸러 LLM 호출 자체를 아낀다.
//
// 처음엔 "핸들 없음 + 이름 신호 없음"으로 널찍하게 잡으려 했는데, 실측(158건)에서
// Hertz의 "08.29 SAT - Mr.Ho (Klasse Wrecks, HK)" 같은 진짜 게스트 공지가
// 핸들이 없다는 이유로 홍보물에 묶이는 오탐이 났다. 그래서 기준을 뒤집었다:
// 애매하면 무조건 LLM에 넘기고(몇 원 더 쓰는 게 낫다), 아래처럼 "출연자가 있을
// 여지가 전혀 없는" 게 확실한 경우만(158건 중 13건) 걸러 스킵한다.
// is_promo_only 판정 자체는 LLM(emit_lineup)이 최종적으로 한다 — 이건 그 앞의
// 무료 사전 필터일 뿐이다.
// ---------------------------------------------------------------------------
const HARD_PROMO_PATTERNS: RegExp[] = [
  /^\s*$/, // 빈 캡션
  /^[\s#@\w.]*$/u, // 해시태그·멘션만
  /(operating\s*hour|영업\s*시간|OPEN\s*\d{1,2}[:.]?\d{0,2}\s*[-~]\s*(CLOSE|\d))/i, // 영업시간 안내
  /(\d+\s*%\s*(off|할인)|이벤트\s*중|프로모션)/i, // 가격 프로모션
  /(채용|모집|알바|구인)/i, // 채용
  /(휴무|휴업|임시\s*휴)/i, // 휴무
];
// 위 패턴에 걸려도 이름/라인업 신호가 하나라도 있으면 무조건 LLM으로 넘긴다 —
// 오탐(진짜 라인업을 홍보물로 오판) 방지가 최우선이다.
const NAME_SIGNAL_RE = /@[\w.]{2,30}|^\s*\d{1,2}[:：]\d{2}\s+\S|[-–—]\s*[A-Z][\w.]{2,}|\bDJ\b|GUEST|LINE\s*UP|MUSIC\s*:/im;

function passesPromoPrefilter(caption: string): boolean {
  const text = caption ?? "";
  const hasNameSignal = NAME_SIGNAL_RE.test(text);
  if (hasNameSignal) return true;
  const isHardPromo = HARD_PROMO_PATTERNS.some((re) => re.test(text));
  return !isHardPromo;
}

// 지역명 접두어(홍대/강남/이태원 등)를 떼고 비교 — "홍대 스페이스브릭"과
// "스페이스 브릭"이 서로 다른 registry 행으로 갈라지는 문제 방지 (실측 확인됨)
const AREA_PREFIXES = ["서울", "홍대", "강남", "이태원", "건대", "성수", "압구정", "청담", "부산", "대구", "대전", "광주", "인천", "울산", "수원"];

function normalizeClubName(raw: string): string {
  let s = raw
    .toUpperCase()
    .replace(/[’'‘""]/g, "")
    .replace(/클럽|CLUB/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();
  for (const prefix of AREA_PREFIXES) {
    const p = prefix.toUpperCase();
    if (s.startsWith(p) && s.length > p.length) {
      s = s.slice(p.length);
      break;
    }
  }
  return s;
}

// club_events 자동 승인/플래그 판정.
// 사유를 함께 돌려준다 — 안 남기면 나중에 "왜 묻혔는지"를 캡션·코드 대조로
// 역추적해야 한다(Migration 609 참조).
function decideEventStatus(ev: {
  event_date: string | null;
  lineup: string[];
  venue_area: string | null;
}): { status: string; reason: string | null } {
  const flag = (reason: string) => ({ status: "flagged", reason });
  if (!ev.event_date) return flag("no_date");
  const d = new Date(ev.event_date);
  if (isNaN(d.getTime())) return flag("no_date");
  const now = new Date();
  const sixMonths = new Date(now.getTime() + 183 * 24 * 3600 * 1000);
  if (d < new Date(now.getTime() - 24 * 3600 * 1000)) return flag("past");
  if (d > sixMonths) return flag("too_far");
  if (ev.lineup.length === 0) return flag("no_lineup");
  const area = (ev.venue_area ?? "").toUpperCase();
  if (OVERSEAS.some((k) => area.includes(k.toUpperCase()))) return flag("overseas");
  return { status: "approved", reason: null };
}

// club_lineups 무인 자동 게시 여부 — 판독 품질이 약하면 사람이 보게 한다.
//
// 예전엔 Vision이 셋 2개 이상만 읽으면 무조건 자동 게시였다(신뢰도 점수는 기록만
// 하고 게시를 막진 않았다). 이제 게스트 1명 공지도 정당한 라인업으로 받아들이면서
// (sets.length<2 게이트를 없앰) 무조건 자동 게시하면 오판이 그대로 공개될 위험이
// 커진다 — 그래서 "판독이 의심스러운" 경우만 좁게 걸러 pending으로 보낸다.
//
// ⚠️ "1명 + 시간 없음"은 약한 판독이 아니다(2026-08-30 정정). 게스트 DJ 공지는
//    원래 한 명이고 시간을 안 적는 게 정상 형태다 — Round Lounge
//    "08/29 (Sat) SPECIAL GUEST ENDUKE @djenduke" 가 그 예다. 그 조건으로
//    거르면 위 주석이 말한 "게스트 1명 공지도 받아들인다"가 무력화돼, 정상
//    라인업이 매번 검토 큐에 쌓인다. 이름을 못 읽은 경우(droppedRowCount)만
//    사람이 본다.
function isWeakLineup(rows: NormalizedExtractionSetRow[], droppedRowCount: number): boolean {
  if (droppedRowCount > 0) return true; // 이름을 통째로 못 읽은 행이 있었다
  return false;
}

// ---------------------------------------------------------------------------
// 2단계 추출 — 캡션 Haiku 먼저, 필요할 때만 포스터 Vision
// ---------------------------------------------------------------------------
/**
 * max_tokens 를 넉넉히 잡는 이유(실측):
 *   3000 으로는 데이터가 가장 많은 게시물이 통째로 날아갔다. 월간 스케줄
 *   (NYAPI AUGUST — 14개 밤)과 주간 다이제스트(힙합플레이야 — 파티 10여 개)가
 *   stop_reason:"max_tokens" 로 잘리면서 `{"is_promo_only":false}` 만 남았다.
 *   events 가 빈 배열이라 호출부는 이걸 "출연자 없음"으로 읽는다 — 즉 가장
 *   값진 게시물이 조용히 버려진다. 이번 재설계가 없애려던 그 실패 그대로다.
 *   회귀 테스트 12건 중 4건이 이 경우였다.
 */
const EXTRACT_MAX_TOKENS = 8000;

async function callExtract(model: string, caption: string, imageUrl: string | null, sourceHint: string): Promise<RawExtraction | null> {
  const content: any[] = [];
  if (imageUrl) content.push({ type: "image", source: { type: "url", url: imageUrl } });
  content.push({ type: "text", text: `${sourceHint}\n\n${caption}` });

  // 60초 타임아웃(2026-08-27 실측 사고): fetchImageToStorage와 같은 이유로,
  // 이 fetch도 무한 대기하면 워커 전체가 죽고 실행 기록조차 안 남는다.
  // Vision(이미지 포함)은 텍스트보다 오래 걸리므로 60초로 여유를 준다.
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: EXTRACT_MAX_TOKENS,
      system: LINEUP_SYSTEM_PROMPT,
      tools: [LINEUP_EMIT_TOOL],
      tool_choice: { type: "tool", name: "emit_lineup" },
      messages: [{ role: "user", content }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();

  // 잘렸으면 부분 결과를 쓰지 않는다. 반쯤 파싱된 JSON은 "출연자 없음"과 구분이
  // 안 되므로, 조용히 통과시키면 원인 모를 누락으로 남는다. 명시적으로 던진다.
  if (data.stop_reason === "max_tokens") {
    throw new Error(`추출 응답이 max_tokens(${EXTRACT_MAX_TOKENS})에서 잘림 — 캡션 ${caption.length}자`);
  }

  const toolUse = data.content?.find((b: any) => b.type === "tool_use");
  return (toolUse?.input as RawExtraction) ?? null;
}

function countSets(raw: RawExtraction | null): number {
  if (!raw) return 0;
  return (raw.events ?? []).reduce((sum, ev) => sum + (ev.sets?.length ?? 0), 0);
}

/**
 * 캡션만으로는 부족해 포스터를 더 봐야 하는가.
 *
 * 왜 필요한가(2026-08-30 실측): 클럽은 캡션에 DJ 명단만 적고 날짜·시간표는
 * 포스터에만 넣는 일이 흔하다. 셋을 뽑았다고 Vision을 건너뛰면 둘 다 영영 못 읽는다.
 *
 *   날짜 누락 — 라인업은 뽑혔는데 날짜가 없어 통째로 버려진 게시물 19건.
 *              ADD("FRI 08.28 / SAT 08.29"), Shape(세로로 회전된 "28"),
 *              Box Seoul("8.28 FRIDAY"). resolveLineupDate가 null을 반환해
 *              저장 자체가 안 된다.
 *   시간 누락 — 셋 있는 이벤트 130건 중 81건이 시간 0개, lineup_sets 781건 중
 *              482건이 start_min null. Box Seoul·Times·LUKA·RING 전부 포스터에
 *              타임테이블이 있는데 캡션엔 이름만 있다. 저장은 되지만 "몇 시에
 *              누가 트는지"가 사라져 DJ 라인업 탭의 핵심 정보가 빈다.
 */
function needsPosterPass(raw: RawExtraction | null): boolean {
  if (!raw) return false;
  const events = raw.events ?? [];
  if (events.length === 0) return false;
  return events.some((ev) => {
    if (!ev.event_date) return true;
    const sets = ev.sets ?? [];
    if (sets.length === 0) return false;
    // 셋이 있는데 시작 시각이 하나도 없으면 타임테이블이 포스터에 있을 수 있다.
    return !sets.some((st) => st.start_hhmm && st.start_hhmm !== "<UNKNOWN>");
  });
}

/**
 * 게시물 하나 → RawExtraction. 캡션만으로 안 되면 포스터도 같이 본다.
 *
 * "부족하다"의 정의 = 홍보물도 아닌데 출연자를 한 명도 못 뽑았다. 정규식으로
 * 사전에 "이 게시물은 Vision이 필요할 것"을 예측하려는 시도는 실측에서 탈락했다
 * (캡션 신호가 있어도 Vision이 셋을 읽은 게 28건, 신호 없는데 읽은 게 17건이라
 * 예측 불가) — 그래서 1단계 결과를 직접 보고 판단한다.
 */
async function extractLineup(
  caption: string,
  mediaType: string,
  mediaUrl: string | null,
  sourceHint: string
): Promise<RawExtraction | null> {
  const stage1 = await callExtract(LINEUP_TEXT_MODEL, caption, null, sourceHint);
  if (!stage1) return null;
  if (stage1.is_promo_only) return stage1;
  // 셋을 뽑았어도 날짜나 시간표가 비면 Vision으로 넘어간다(needsPosterPass 참조).
  // 캡션에 이름만 적고 날짜·타임테이블은 포스터에 넣는 클럽이 흔하다.
  if (countSets(stage1) > 0 && !needsPosterPass(stage1)) return stage1;

  // 캡션만으론 안 됨 — 포스터가 있으면 Vision으로 한 번 더. 미디어 종류 체크는
  // 여기서만 한다(캡션 단계는 Reel이든 뭐든 항상 시도한다 — 동영상이라고 캡션까지
  // 못 읽는 건 아니다. SOUNDCLASH 사고가 그 증거).
  if (!passesPreVisionGate(mediaType, mediaUrl, caption)) return stage1;
  try {
    const stage2 = await callExtract(LINEUP_VISION_MODEL, caption, mediaUrl, sourceHint);
    if (!stage2) return stage1;
    // 캡션이 이미 셋을 뽑았다면 이름은 그쪽이 정본이다 — 캡션은 이름과 핸들이
    // 텍스트로 정확히 적혀 있고, Vision은 포스터 디자인(회전·겹침·흐림)에 따라
    // 일부만 읽거나 오독한다(실측: "RAW BLOOM"→"BAM BLOOM", "MUSE"→"MUSC").
    // 이 경우 Vision은 빠진 날짜·시간을 채우는 데만 쓴다.
    if (countSets(stage1) > 0 && countSets(stage2) < countSets(stage1)) {
      return mergeFromVision(stage1, stage2);
    }
    return stage2;
  } catch {
    return stage1; // Vision 실패해도 1단계 결과(보통 빈 값)는 살린다
  }
}

/**
 * 캡션(stage1)의 라인업 이름은 그대로 두고, 비어 있는 날짜·시간만 Vision(stage2)에서 채운다.
 *
 * 날짜: 이벤트 순서가 양쪽에서 같다는 보장이 없어 1:1로 맞추지 않는다. Vision이
 *       읽은 날짜를 순서대로 꺼내 날짜 없는 이벤트에 차례로 넣는다. 대부분의
 *       게시물은 이벤트가 1~2개(하루치 또는 금·토 이틀치)라 이 정도로 충분하다.
 *
 * 시간: 순서가 아니라 **이름으로 맞춘다**. 포스터 타임테이블과 캡션 명단은 순서가
 *       달라질 수 있지만 같은 사람은 같은 이름으로 적힌다. 이름이 안 맞으면
 *       시간을 넣지 않는다 — 엉뚱한 DJ에 시간이 붙는 것보다 비는 게 낫다.
 */
function mergeFromVision(stage1: RawExtraction, stage2: RawExtraction): RawExtraction {
  const visionDates = (stage2.events ?? []).map((ev) => ev.event_date).filter(Boolean) as string[];

  // 이름 → 시간. 여러 이벤트에 같은 이름이 나오면(금·토 양일 출연) 첫 것만 쓴다.
  const key = (n: string) => normalizeDjName(n);
  const timeByName = new Map<string, { start: string | null; end: string | null }>();
  for (const ev of stage2.events ?? []) {
    for (const st of ev.sets ?? []) {
      const k = key(st.dj_name ?? "");
      if (!k || timeByName.has(k)) continue;
      if (!st.start_hhmm || st.start_hhmm === "<UNKNOWN>") continue;
      timeByName.set(k, { start: st.start_hhmm, end: st.end_hhmm ?? null });
    }
  }

  let i = 0;
  return {
    ...stage1,
    events: (stage1.events ?? []).map((ev) => ({
      ...ev,
      event_date: ev.event_date ?? visionDates[i++] ?? null,
      sets: (ev.sets ?? []).map((st) => {
        const hasTime = st.start_hhmm && st.start_hhmm !== "<UNKNOWN>";
        if (hasTime) return st;
        const t = timeByName.get(key(st.dj_name ?? ""));
        return t ? { ...st, start_hhmm: t.start, end_hhmm: st.end_hhmm ?? t.end } : st;
      }),
    })),
  };
}

// ---------------------------------------------------------------------------
// 클럽 매칭 — 핸들 우선(정확), 이름은 보조
// ---------------------------------------------------------------------------
interface ClubRef {
  id: string | null;
  name: string;
}

function matchClub(
  venueName: string | null,
  venueInstagram: string | null,
  handleToClub: Map<string, ClubRef>,
  clubNameIndex: Map<string, string>
): string | null {
  if (venueInstagram) {
    const club = handleToClub.get(venueInstagram.toLowerCase());
    if (club?.id) return club.id;
  }
  if (venueName) {
    const id = clubNameIndex.get(normalizeClubName(venueName));
    if (id) return id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 이벤트 하나(= 하룻밤) 저장 — DJ는 club_lineups, 가수는 club_events. 둘 다
// 독립이라 같은 게시물에서 양쪽에 다 들어갈 수 있다(SOUNDCLASH 사고 재발 방지).
// ---------------------------------------------------------------------------
interface SaveCtx {
  supabase: any;
  handleToClub: Map<string, ClubRef>;
  clubNameIndex: Map<string, string>;
  clubHandleSet: Set<string>; // DJ 핸들이 실수로 클럽 자기 계정이 되는 걸 막는다
  captionHandles: Map<string, string>; // extractPerformerHandles 결과 — 보조 백업
  discoveredHandles: Map<string, string>; // registry 갱신용
  results: any;
}

/** row.instagram 우선, 없으면 캡션 인접 핸들로 보강. 클럽 자기 계정은 항상 제외. */
function resolveHandle(row: NormalizedExtractionSetRow, ctx: SaveCtx): string | null {
  const candidate = row.instagram ?? ctx.captionHandles.get(row.raw_name) ?? null;
  if (!candidate) return null;
  return ctx.clubHandleSet.has(candidate) ? null : candidate;
}

async function saveDjRows(
  clubId: string,
  eventDate: string,
  eventTitle: string | null,
  djRows: NormalizedExtractionSetRow[],
  droppedRowCount: number,
  draftId: string | null,
  ctx: SaveCtx,
  ticketUrl: string | null = null
): Promise<void> {
  if (djRows.length === 0) return;
  const { supabase, results } = ctx;

  // 이미 그 클럽·날짜에 라인업이 있으면 건드리지 않는다 — 먼저 처리된(혹은 더
  // 정확했을 수 있는) 결과를 나중 게시물이 덮어쓰지 않게 한다.
  const { data: exist } = await supabase
    .from("club_lineups")
    .select("id")
    .eq("club_id", clubId)
    .eq("event_date", eventDate)
    .maybeSingle();
  if (exist) return;

  const sets: any[] = [];
  const seen = new Set<string>();
  for (const row of djRows) {
    const norm = normalizeDjName(row.raw_name);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    const { data: djId } = await supabase.rpc("ensure_dj", { p_raw_name: row.raw_name, p_normalized: norm });
    if (!djId) continue;

    const handle = resolveHandle(row, ctx);
    if (handle) {
      const { data: updated } = await supabase
        .from("djs")
        .update({ instagram: handle })
        .eq("id", djId)
        .is("instagram", null)
        .select("id");
      if (updated?.length) results.handles_from_caption++;
    }
    sets.push({ dj_id: djId, start_min: row.start_min, end_min: row.end_min, raw_name: row.raw_name });
  }
  if (sets.length === 0) return;

  if (isWeakLineup(djRows, droppedRowCount)) {
    // 판독이 의심스럽다 — 게시하지 않고 검토 큐로. 이미 만든 draft(club-account
    // 게시물)가 있으면 그 상태만 갱신하고, 없으면(큐레이션발 DJ 라인업, 또는
    // 월간 스케줄에서 draft claim을 이미 다른 밤에 써버린 경우) 새로 draft를
    // 만든다. 큐레이션 게시물은 club_id를 사후에만 알 수 있어 애초에 draft
    // claim을 안 했었다.
    //
    // ⚠️ 알려진 한계: draftId=null로 insert하는 이 경로는 ig_permalink 클레임이
    // 없어 재수집 시 dedup이 안 된다 — 사람이 검토해서 club_lineups에 게시하기
    // 전까지는(그 뒤엔 위쪽 "이미 있으면 skip" 가드가 막아준다) 매일 재수집될
    // 때마다 거의 같은 내용의 pending draft가 하나씩 더 쌓인다. 월간 스케줄
    // 게시물(밤마다 시간 없는 헤드라이너 1명 = 거의 매번 이 분기)에서 특히
    // 그렇다. 데이터 유실은 아니고(사람이 아무 사본이나 확인·게시하면 해소된다)
    // 검토 큐가 좀 지저분해지는 정도라 지금은 감수한다 — dedup 키를 새로
    // 설계하려면 이 변경 범위를 넘어선다.
    const payload = {
      status: "pending",
      normalized: { event_date: eventDate, door_open_min: null, event_title: eventTitle, ticket_url: ticketUrl, sets },
    };
    if (draftId) {
      await supabase.from("lineup_drafts").update(payload).eq("id", draftId);
    } else {
      await supabase.from("lineup_drafts").insert({ club_id: clubId, origin: "ig", ...payload });
    }
    results.lineups_pending_review++;
    return;
  }

  const { error: rpcErr } = await supabase.rpc("upsert_club_lineup", {
    p_club_id: clubId,
    p_event_date: eventDate,
    p_door_open_min: null,
    p_event_title: eventTitle,
    p_poster_url: null,
    p_sets: sets,
    p_source: "ig_auto",
    p_draft_id: draftId,
    p_ticket_url: ticketUrl,
  });
  if (rpcErr) {
    results.errors.push(`upsert_lineup: ${rpcErr.message}`);
    if (draftId) await supabase.from("lineup_drafts").update({ status: "parse_failed", reject_reason: rpcErr.message }).eq("id", draftId);
    return;
  }
  if (draftId) await supabase.from("lineup_drafts").update({ status: "auto_published" }).eq("id", draftId);
  results.lineups_published++;
}

async function saveArtistRows(
  post: any,
  isCuration: boolean,
  sourceAccount: string,
  clubId: string | null,
  clubNameRaw: string,
  event: NormalizedExtractionEvent,
  eventDate: string | null,
  artistRows: NormalizedExtractionSetRow[],
  postId: string,
  caption: string,
  ctx: SaveCtx
): Promise<void> {
  if (artistRows.length === 0) return;
  const { supabase, results } = ctx;

  const lineup = artistRows.map((r) => r.raw_name);
  const decided = decideEventStatus({ event_date: eventDate, lineup, venue_area: event.venueArea });
  let status = decided.status;
  let statusReason = decided.reason;
  // 등록되지 않은 장소에서 가수(artist)가 나오면 오분류일 수 있다 —
  // 데이터는 저장하되 사람이 보게 내린다.
  //
  // 예전 기준은 isHipHopVenue("힙합플레이야가 다룬 적 있는 클럽인가")였는데
  // 순환 참조였다(2026-08-30 실측): 그 계정이 안 다룬 클럽은 공식 계정이 직접
  // 올려도 전부 flagged로 숨었다. 그렇게 묻힌 31건이 **전부 진짜 공연**이었고
  // 전부 우리가 등록·승인한 클럽이었다 — NAFLA 프리리스닝(Grain Haus),
  // Colde·Khakii 릴리즈 파티, PALOALTO @CLUB LOOPY, BE'O @Round Lounge.
  // 새 클럽을 등록해도 힙합플레이야가 다뤄주기 전까지는 영영 안 열리는 구조였다.
  //
  // 우리가 승인해 등록한 클럽(clubId != null)이면 그 자체가 사람의 판단이므로
  // 통과시키고, 캡션에서 이름만 읽힌 미등록 장소만 사람이 확인하게 남긴다
  // (국일관 성인나이트류가 여기서 걸린다).
  if (!isCuration && !clubId) {
    status = "flagged";
    statusReason = statusReason ?? "unregistered_venue";
  }

  // 사람이 이미 판단한 행은 status 를 건드리지 않는다.
  //
  // 왜(2026-08-27 실측): upsert 가 status 를 매번 다시 계산해 덮어쓰고 있었다.
  // 관리자가 오분류를 rejected 로 내려도 다음 수집이 approved 로 되돌린다 —
  // 오늘 손으로 정리한 NYAPI 14건·SOUNDCLASH·DHELL 이 전부 이렇게 되살아났다.
  // 자동 판정은 "아직 사람이 안 본 행"에만 적용해야 한다.
  //
  // ⚠️ event_date 가 null 인 경우 .eq() 를 쓰면 안 된다 — PostgREST 는 그걸
  // `event_date=eq.null` 로 내보내고 SQL 의 `= NULL` 은 항상 NULL(매치 없음)이다.
  // 그러면 humanDecided 가 영영 false 가 되어, 날짜 미상 행은 사람이 rejected 로
  // 내려도 다음 수집이 되살린다. null 은 반드시 .is() 로 비교한다.
  const existingQuery = supabase
    .from("club_events")
    .select("id,status")
    .eq("source_post_id", postId)
    .eq("club_name_raw", clubNameRaw || "(미상)");
  const { data: existing } = await (
    eventDate === null ? existingQuery.is("event_date", null) : existingQuery.eq("event_date", eventDate)
  ).maybeSingle();
  const humanDecided = existing && ["rejected", "confirmed"].includes(existing.status);

  const payload: Record<string, unknown> = {
    club_id: clubId,
    club_name_raw: clubNameRaw || "(미상)",
    venue_area: event.venueArea,
    venue_type: event.venueType,
    event_date: eventDate,
    event_date_end: null,
    title: event.eventTitle,
    lineup,
    source_account: sourceAccount,
    source_url: post.url ?? null,
    source_post_id: postId,
    raw_caption: caption,
    ticket_url: event.ticketUrl,
  };
  // status 는 사람 판단이 없을 때만 싣는다(빼면 upsert 가 기존 값을 보존한다).
  if (!humanDecided) {
    payload.status = status;
    payload.status_reason = statusReason;
  }

  let { data: savedEvent, error: insErr } = await supabase
    .from("club_events")
    .upsert(payload, { onConflict: "source_post_id,club_name_raw,event_date" })
    .select("id")
    .single();

  // 하나의 공연을 주최·클럽·출연자가 각자 자기 계정에 올려 같은 날짜·장소가 다른
  // 게시물로 또 들어온다. Migration 572의 부분 UNIQUE(event_date, venue_key)가
  // 이를 막으므로 23505를 잡아 기존 행에 정보를 보강하는 쪽으로 돌린다.
  if (insErr && (insErr as any).code === "23505" && payload.event_date) {
    const { data: existing } = await supabase
      .from("club_events")
      .select("id, club_id, venue_area, venue_type, title, source_url, ticket_url, lineup")
      .eq("event_date", payload.event_date)
      .or(clubId ? `club_id.eq.${clubId}` : `club_name_raw.eq.${clubNameRaw}`)
      .limit(1)
      .maybeSingle();
    if (existing) {
      const merged = [...new Set([...(existing.lineup ?? []), ...lineup])];
      await supabase
        .from("club_events")
        .update({
          club_id: existing.club_id ?? clubId,
          venue_area: existing.venue_area ?? event.venueArea,
          venue_type: existing.venue_type ?? event.venueType,
          title: existing.title ?? event.eventTitle,
          source_url: existing.source_url ?? (post.url ?? null),
          ticket_url: existing.ticket_url ?? event.ticketUrl,
          lineup: merged,
        })
        .eq("id", existing.id);
      savedEvent = { id: existing.id };
      insErr = null;
      results.events_merged++;
    }
  }

  if (insErr) {
    results.errors.push(`insert(${postId}): ${insErr.message}`);
    return;
  }
  if (status === "approved") results.events_approved++;
  else results.events_flagged++;

  if (savedEvent?.id) {
    for (const [idx, row] of artistRows.entries()) {
      const norm = normalizeDjName(row.raw_name);
      if (!norm) continue;
      const { data: artistId } = await supabase.rpc("ensure_artist", { p_raw_name: row.raw_name, p_normalized: norm });
      if (!artistId) continue;
      await supabase.from("club_event_performers").upsert(
        { event_id: savedEvent.id, artist_id: artistId, raw_name: row.raw_name, sort_order: idx },
        { onConflict: "event_id,artist_id" }
      );
      results.performers_linked++;

      const handle = resolveHandle(row, ctx);
      if (handle) {
        const { data: updated } = await supabase
          .from("artists")
          .update({ instagram: handle })
          .eq("id", artistId)
          .is("instagram", null)
          .select("id");
        if (updated?.length) results.handles_from_caption++;
      }
    }
  }

  if (event.venueInstagram && clubNameRaw) {
    ctx.discoveredHandles.set(normalizeClubName(clubNameRaw), event.venueInstagram);
  }
}

// ---------------------------------------------------------------------------
// 게시물 하나 처리 — club-account 게시물(클럽 특정됨) / 큐레이션 게시물(다중 장소)
// ---------------------------------------------------------------------------
async function processClubAccountPost(post: any, sourceClub: ClubRef & { id: string }, ctx: SaveCtx): Promise<void> {
  const { supabase, results } = ctx;
  const permalink: string = post.url ?? "";
  const caption: string = post.caption ?? "";
  if (!permalink) return;

  // permalink 선점 — 이미 처리한 게시물이면 23505로 걸려 조용히 스킵된다.
  const { data: draft, error: draftErr } = await supabase
    .from("lineup_drafts")
    .insert({
      club_id: sourceClub.id,
      origin: "ig",
      ig_permalink: permalink,
      ig_media_timestamp: post.timestamp ?? null,
      ig_caption: caption.slice(0, 2000),
      status: "pending",
    })
    .select("id")
    .single();
  if (draftErr || !draft) return;
  results.lineup_drafts_created++;

  // 오래된 게시물은 파싱하지 않는다(위 CLUB_POST_MAX_AGE_DAYS 참조).
  // draft는 이미 만들었으므로 permalink가 선점돼 다음 실행에서 또 걸리지 않는다.
  if (isStalePost(post.timestamp)) {
    results.posts_skipped_stale++;
    await supabase.from("lineup_drafts").update({ status: "stale" }).eq("id", draft.id);
    return;
  }

  if (!passesPromoPrefilter(caption)) {
    results.posts_skipped_prefilter++;
    await supabase.from("lineup_drafts").update({ status: "not_timetable" }).eq("id", draft.id);
    return;
  }
  results.posts_new++;

  const mediaType = APIFY_TYPE_MAP[String(post.type ?? "")] ?? String(post.type ?? "").toUpperCase();
  const mediaUrl: string | null = post.displayUrl ?? null;

  const sourceHint =
    `이 게시물은 "${post.ownerUsername}" 계정이 올렸다. 이 계정 자체가 클럽 "${sourceClub.name}"이다 — ` +
    `캡션이 다른 장소를 명시적으로(주소나 "at OO에서") 말하지 않는 한 모든 이벤트의 venue는 이 클럽이다.`;

  let raw: RawExtraction | null;
  try {
    raw = await extractLineup(caption, mediaType, mediaUrl, sourceHint);
  } catch (e) {
    results.parse_failures++;
    results.errors.push(`extract(${permalink}): ${String(e).slice(0, 150)}`);
    await supabase.from("lineup_drafts").update({ status: "parse_failed" }).eq("id", draft.id);
    return;
  }
  await supabase.from("lineup_drafts").update({ parsed: raw }).eq("id", draft.id);

  const extraction = normalizeExtraction(raw);
  if (extraction.isPromoOnly || extraction.events.length === 0) {
    await supabase.from("lineup_drafts").update({ status: "not_timetable" }).eq("id", draft.id);
    results.lineup_not_timetable++;
    return;
  }

  // 포스터 이미지는 첫 이벤트 저장에만 붙인다(월간 스케줄이어도 포스터 한 장이 원본).
  let posterSaved = false;
  let anySaved = false;
  // claim한 draft.id는 이벤트 하나에만 쓴다. 월간 스케줄(한 게시물 = 여러 밤)에서
  // 밤마다 saveDjRows가 같은 draftId를 재사용하면, 두 번째 밤이 'pending'으로
  // 빠질 때 첫 번째 밤의 검토 대기 스냅샷을 그대로 덮어써 잃어버린다(실측 위험:
  // 월간 스케줄은 밤마다 헤드라이너 1명·시간 없음이 흔해 거의 매번 pending 분기를
  // 탄다). 그래서 draft.id는 딱 한 번만 "쓰고", 그 다음 이벤트부터는 큐레이션
  // 게시물과 동일하게 새 draft를 만든다(draftId=null → saveDjRows가 insert).
  let djDraftClaimUsed = false;

  for (const event of extraction.events) {
    const eventDate = resolveLineupDate(event.eventMonthDay, post.timestamp);
    if (!eventDate) {
      results.lineup_no_date++;
      continue;
    }

    const djRows = event.rows.filter((r) => r.role === "dj");
    const artistRows = event.rows.filter((r) => r.role === "artist");

    if (djRows.length > 0) {
      let posterUrl: string | null = null;
      if (!posterSaved && mediaUrl) {
        const hash = await permalinkHash(permalink);
        const yyyymm = (post.timestamp ?? new Date().toISOString()).slice(0, 7);
        posterUrl = await fetchImageToStorage(supabase, mediaUrl, "lineup-posters", `${sourceClub.id}/${yyyymm}/${hash}.jpg`);
        if (posterUrl) await supabase.from("lineup_drafts").update({ poster_url: posterUrl }).eq("id", draft.id);
        posterSaved = true;
      }
      const djDraftId = djDraftClaimUsed ? null : draft.id;
      djDraftClaimUsed = true;
      await saveDjRows(sourceClub.id, eventDate, event.eventTitle, djRows, event.droppedRowCount, djDraftId, ctx, event.ticketUrl);
      anySaved = true;
    }

    if (artistRows.length > 0) {
      const clubNameRaw = event.venueName || sourceClub.name;
      await saveArtistRows(
        post, false, post.ownerUsername, sourceClub.id, clubNameRaw, event, eventDate, artistRows,
        String(post.id ?? post.shortCode ?? permalink), caption, ctx
      );
      anySaved = true;
    } else {
      results.events_dj_only++;
    }
  }

  if (!anySaved) {
    // draft가 이미 pending/auto_published로 갱신됐을 수 있으니, 아직 pending
    // 그대로면(= 아무 이벤트도 못 건짐) not_timetable로 마감한다.
    const { data: cur } = await supabase.from("lineup_drafts").select("status").eq("id", draft.id).single();
    if (cur?.status === "pending") {
      await supabase.from("lineup_drafts").update({ status: "not_timetable" }).eq("id", draft.id);
      results.lineup_not_timetable++;
    }
  }
}

/**
 * 클럽 계정에 묶이지 않은 게시물 처리 — 장소를 캡션에서 읽어 매칭한다.
 *
 * 두 종류가 여기로 온다:
 *   1. 큐레이션 계정(hiphopplayacalendar)의 주간 다이제스트
 *   2. 감시 클럽을 태그한 "남의 계정" 글 (venueHint 로 구분)
 *
 * 2번이 왜 생기나(실측): 클럽 계정 일부는 Apify 로 본인 글을 못 가져오는데
 * (Restricted profile 등), 그때 액터가 그 계정을 태그한 다른 계정의 글을
 * 돌려준다. 36곳 조회에서 18건이 이 형태였다 —
 *   요청 cakeshopseoul → @blamelobotome "Summer of LEMON 28.Aug (Fri)..."
 *   요청 rosso_seoul   → @mousebeltclub "2026.08.28 쥐띠들의 여름방학..."
 * 예전 코드는 "urls 가 감시 목록에서 만들어졌으니 남의 계정 글은 있을 수 없다"고
 * 단정하고 else 없이 스킵했다. 그 단정이 틀려서 쓸 수 있는 라인업이 통째로
 * 버려지고 있었다. 장소는 캡션에서 읽으므로 큐레이션과 같은 경로로 처리한다.
 */
async function processCurationPost(post: any, ctx: SaveCtx, venueHint?: string): Promise<void> {
  const { results } = ctx;
  const postId = String(post.id ?? post.shortCode ?? "");
  const caption: string = post.caption ?? "";
  if (!postId) return;

  if (!passesPromoPrefilter(caption)) {
    results.posts_skipped_prefilter++;
    return;
  }
  results.posts_new++;

  const mediaType = APIFY_TYPE_MAP[String(post.type ?? "")] ?? String(post.type ?? "").toUpperCase();
  const mediaUrl: string | null = post.displayUrl ?? null;

  const sourceHint = venueHint
    ? `이 게시물은 "${post.ownerUsername}" 계정이 올렸고, 클럽 "${venueHint}"를 태그하거나 언급했다. ` +
      `그 클럽에서 열리는 행사일 가능성이 높지만 단정하지 마라 — 캡션이 다른 장소를 말하면 그쪽을 따르고, ` +
      `장소 단서가 전혀 없을 때만 "${venueHint}"로 본다. 올린 계정 자체는 장소가 아니다(대개 파티 주최나 출연자 계정이다).`
    : "이 게시물은 여러 클럽의 공연을 한 번에 소개하는 주간 다이제스트 계정의 것이다. " +
      "게시물 전체에 장소 하나를 가정하지 말고, 번호가 매겨진 항목마다(=이벤트마다) 그 항목이 말하는 장소를 각각 읽어라.";

  let raw: RawExtraction | null;
  try {
    raw = await extractLineup(caption, mediaType, mediaUrl, sourceHint);
  } catch (e) {
    results.parse_failures++;
    results.errors.push(`extract(curation:${postId}): ${String(e).slice(0, 150)}`);
    return;
  }

  const extraction = normalizeExtraction(raw);
  if (extraction.isPromoOnly || extraction.events.length === 0) return;

  for (const event of extraction.events) {
    const eventDate = resolveLineupDate(event.eventMonthDay, post.timestamp);
    if (!eventDate) {
      results.lineup_no_date++;
      continue;
    }

    const clubId = matchClub(event.venueName, event.venueInstagram, ctx.handleToClub, ctx.clubNameIndex);
    const djRows = event.rows.filter((r) => r.role === "dj");
    const artistRows = event.rows.filter((r) => r.role === "artist");

    // DJ 라인업은 club_id로 매칭됐을 때만 저장할 수 있다(club_lineups.club_id NOT NULL).
    // 큐레이션 게시물은 클럽이 사후에만 확정되므로 draft claim 없이(p_draft_id=null)
    // 바로 저장한다.
    if (djRows.length > 0 && clubId) {
      await saveDjRows(clubId, eventDate, event.eventTitle, djRows, event.droppedRowCount, null, ctx, event.ticketUrl);
    }

    if (artistRows.length > 0) {
      const clubNameRaw = event.venueName || "(미상)";
      const venueClub = clubId ? ctx.handleToClub.get((event.venueInstagram ?? "").toLowerCase()) : null;
      await saveArtistRows(
        post, true, CURATION_ACCOUNT, clubId, clubNameRaw, event, eventDate, artistRows,
        postId, caption, ctx
      );
    }
  }
}

// Apify 비동기 실행 → 완료 폴링 → 데이터셋 반환
async function runApify(urls: string[]): Promise<any[]> {
  // 타임아웃을 안 걸면 fetchImageToStorage/Anthropic 호출과 같은 방식으로 워커가
  // 영원히 멈출 수 있다(2026-08-27 실측 — 다른 fetch에서 실제로 발생, 여기도 예방).
  const FETCH_TIMEOUT_MS = 30_000;

  const startRes = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=${APIFY_API_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directUrls: urls,
        resultsType: "posts",
        resultsLimit: POSTS_PER_CLUB,
        // 고정글 제외 요청. ⚠️ 실측상 이 액터에서는 동작하지 않는다(true/false
        // 결과 동일). 액터가 고치면 바로 효과를 보도록 남겨둔다 — 실제로 고정글을
        // 걸러주는 건 아래 onlyPostsNewerThan이다.
        skipPinnedPosts: true,
        // 오래된 글은 Apify 단계에서 잘라 결과 건수 자체를 줄인다(= 과금 감소).
        // 액터는 고정글을 먼저 걷어낸 뒤 이 날짜 필터를 적용하므로, 옛 고정글이
        // 최근 결과에 섞이지 않는다.
        onlyPostsNewerThan: `${CLUB_POST_MAX_AGE_DAYS} days`,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }
  );
  if (!startRes.ok) throw new Error(`Apify 시작 실패 HTTP ${startRes.status}`);
  const run = (await startRes.json()).data;
  console.log(`🔍 Apify run 시작: ${run.id} (${urls.length}개 계정)`);

  const deadline = Date.now() + APIFY_POLL_MAX_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, APIFY_POLL_INTERVAL_MS));
    const st = await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?token=${APIFY_API_TOKEN}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const status = (await st.json()).data.status;
    if (status === "SUCCEEDED") break;
    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
      throw new Error(`Apify run ${status}`);
    }
  }

  const itemsRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${run.id}/dataset/items?token=${APIFY_API_TOKEN}`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
  );
  if (!itemsRes.ok) throw new Error(`Apify 데이터셋 조회 실패 HTTP ${itemsRes.status}`);
  return await itemsRes.json();
}

// ---------------------------------------------------------------------------
// 18+ 제한 계정 보조 수집
// ---------------------------------------------------------------------------
/**
 * 일부 클럽 계정은 인스타 연령 제한(18+/21+)이 걸려 있어 기본 액터가
 * "Restricted profile" 에러만 돌려준다(실측 2026-08-30: BELPOS·OUTPUT·
 * Veil Social Club). 로그인 없이는 볼 수 없는 계정이라 apify~instagram-scraper
 * 로는 우회가 불가능했고, 다른 무료 액터(instagram-post-scraper)도 같은 에러였다.
 *
 * intropix 액터는 이 계정들을 읽어낸다(3곳 모두 10건씩 정상 수집 확인).
 * 비용은 pay-per-event 로 결과당 $0.0019 + 프로필당 $0.002 + 실행당 $0.005 —
 * 3곳 매일 조회해도 월 $0.4 수준이다.
 *
 * ⚠️ 기본 액터와 필드명이 완전히 다르다. 아래에서 기본 액터 형식으로 변환해
 *    돌려주므로 호출부는 두 액터를 구분할 필요가 없다.
 * ⚠️ maxPosts 는 계정별이 아니라 "전체 합산" 상한이다. 3곳에 3을 주면 첫 계정이
 *    다 써버려 나머지가 0건이 된다(실측). 계정 수를 곱해서 넘긴다.
 */
const RESTRICTED_HANDLES = ["belpos_official", "outputbusan", "veil_social_club"];

async function runApifyRestricted(handles: string[]): Promise<any[]> {
  if (handles.length === 0) return [];
  const FETCH_TIMEOUT_MS = 30_000;
  const since = new Date(Date.now() - CLUB_POST_MAX_AGE_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const startRes = await fetch(
    `https://api.apify.com/v2/acts/intropix~instagram-posts-reels-scraper/runs?token=${APIFY_API_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usernames: handles,
        maxPosts: POSTS_PER_CLUB * handles.length, // 전체 합산 상한이다
        sinceDate: since,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }
  );
  if (!startRes.ok) {
    console.error(`⚠️ 제한계정 액터 시작 실패 HTTP ${startRes.status}`);
    return [];
  }
  const run = (await startRes.json()).data;
  console.log(`🔒 제한계정 run 시작: ${run.id} (${handles.length}곳, since=${since})`);

  const deadline = Date.now() + APIFY_POLL_MAX_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, APIFY_POLL_INTERVAL_MS));
    const st = await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?token=${APIFY_API_TOKEN}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!st.ok) continue;
    const status = (await st.json()).data.status;
    if (status === "SUCCEEDED") break;
    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
      console.error(`⚠️ 제한계정 run ${status}`);
      return [];
    }
  }

  const itemsRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${run.id}/dataset/items?token=${APIFY_API_TOKEN}`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
  );
  if (!itemsRes.ok) {
    console.error(`⚠️ 제한계정 데이터셋 조회 실패 HTTP ${itemsRes.status}`);
    return [];
  }
  const raw: any[] = await itemsRes.json();

  // 기본 액터 형식으로 변환 — 호출부가 두 액터를 구분하지 않게 한다.
  return raw
    .filter((p) => p && !p.error && p.shortcode)
    .map((p) => ({
      id: p.post_pk ?? p.shortcode,
      shortCode: p.shortcode,
      url: p.permalink ?? `https://www.instagram.com/p/${p.shortcode}/`,
      // taken_at 은 유닉스 초 또는 ISO 문자열로 온다 — 둘 다 받는다.
      timestamp:
        typeof p.taken_at === "number"
          ? new Date(p.taken_at * 1000).toISOString()
          : (p.taken_at ?? null),
      // post_type: "image" | "video" | "carousel"
      // ⚠️ APIFY_TYPE_MAP 을 거친 "후"의 값을 넣어야 한다. 기본 액터의 원시 표기
      //    ("Image"/"Sidecar"/"Video")를 넣으면 passesPreVisionGate 가 대문자만
      //    받으므로 Vision 을 통째로 건너뛴다(실측: BELPOS·OUTPUT·Veil 3곳의
      //    포스터 타임테이블이 이것 때문에 전부 유실됐다).
      type:
        String(p.post_type ?? "").toLowerCase() === "video"
          ? "VIDEO"
          : String(p.post_type ?? "").toLowerCase() === "carousel"
            ? "CAROUSEL_ALBUM"
            : "IMAGE",
      // media[0].media_url 이 실제 필드명이다(실측). carousel 이면 첫 장이
      // 포스터인 경우가 대부분이고, video 는 이 URL이 썸네일이라 Vision 이 읽는다.
      displayUrl: Array.isArray(p.media)
        ? (p.media[0]?.media_url ?? p.media[0]?.thumbnail_url ?? p.media[0]?.url ?? null)
        : null,
      ownerUsername: p.username ?? null,
      caption: p.caption ?? "",
      inputUrl: p.username ? `https://www.instagram.com/${p.username}/` : null,
    }));
}

// 실제 수집 작업. HTTP 응답과 분리해 EdgeRuntime.waitUntil로 백그라운드 실행한다.
async function runCollection() {
  const startedAt = Date.now();
  const results = {
    accounts: 0,
    posts_seen: 0,
    posts_new: 0,
    posts_skipped_prefilter: 0,
    posts_skipped_stale: 0,
    events_approved: 0,
    events_flagged: 0,
    events_dj_only: 0,
    events_merged: 0,
    lineup_drafts_created: 0,
    lineups_published: 0,
    lineups_pending_review: 0,
    lineup_not_timetable: 0,
    lineup_no_date: 0,
    performers_linked: 0,
    handles_from_caption: 0,
    parse_failures: 0,
    errors: [] as string[],
    budget_exhausted: false,
  };

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 0) 끊긴 초안 회수 — 이걸 안 하면 게시물이 영구히 유실된다.
    //
    // lineup_drafts 는 게시물을 처리하기 "전에" pending 으로 INSERT 해서
    // ig_permalink(UNIQUE)를 선점한다. 그 뒤 프리필터·Vision 파싱을 거쳐
    // not_timetable / auto_published / parse_failed 중 하나로 반드시 떨어져야
    // 하는데, 실행이 중간에 끊기면(타임아웃·Vision 오류·크래시) pending 인 채로
    // 남는다. 그러면 다음 실행에서 같은 게시물을 INSERT 하려다 23505 로 걸려
    // 조용히 스킵되고(`if (draftErr || !draft) return;`), 그 게시물은 두 번 다시
    // 수집되지 않는다.
    //
    // 실측(2026-08-28): 이 상태로 20건이 쌓여 있었고, 그중 16건은 포스터·캡션이
    // 멀쩡히 있는데도 파싱이 안 된 채 영구 차단돼 있었다(Modeci·Times·Sevens 등).
    //
    // 6시간을 기준으로 삼는 이유: 정상 실행은 수 분 내에 끝나므로 그보다 오래
    // pending 인 건 확실히 죽은 것이고, 하루 1회 수집 주기보다는 짧아야 다음
    // 실행에서 바로 회수된다. confidence 가 채워진 건(사람이 검토 중일 수 있는
    // 초안)은 건드리지 않는다 — 파싱까지 끝난 뒤 대기 중인 정상 상태다.
    const staleBefore = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: staleDrafts, error: staleErr } = await supabase
      .from("lineup_drafts")
      .delete()
      .eq("status", "pending")
      .is("confidence", null)
      .lt("created_at", staleBefore)
      .select("id");
    if (staleErr) {
      console.error("⚠️ 끊긴 초안 회수 실패 (수집은 계속):", staleErr.message);
    } else if (staleDrafts?.length) {
      console.log(`♻️ 끊긴 pending 초안 ${staleDrafts.length}건 회수 — 해당 게시물 재수집 가능`);
    }

    // 1) 수집 대상 계정
    const { data: clubs, error: clubErr } = await supabase
      .from("clubs")
      .select("id,name,name_en,aliases,instagram")
      .eq("status", "approved")
      .eq("is_test", false)
      .is("deleted_at", null);
    if (clubErr) throw clubErr;

    const { data: registryHandles, error: regErr } = await supabase
      .from("club_name_registry")
      .select("name_raw, instagram_handle, matched_club_id")
      .not("instagram_handle", "is", null)
      .neq("instagram_handle", "");
    if (regErr) throw regErr;

    const handleToClub = new Map<string, ClubRef>();
    const urls = [`https://www.instagram.com/${CURATION_ACCOUNT}/`];

    for (const c of clubs ?? []) {
      const handle = (c.instagram ?? "").trim().replace(/^@/, "");
      if (!handle) continue;
      handleToClub.set(handle.toLowerCase(), { id: c.id, name: c.name });
    }
    for (const r of registryHandles ?? []) {
      const handle = (r.instagram_handle ?? "").trim().replace(/^@/, "");
      if (!handle || handleToClub.has(handle.toLowerCase())) continue;
      handleToClub.set(handle.toLowerCase(), {
        id: r.matched_club_id,
        name: r.name_raw,
      });
    }
    for (const handle of handleToClub.keys()) urls.push(`https://www.instagram.com/${handle}/`);
    results.accounts = urls.length;
    console.log(`🎯 감시 대상: 큐레이션 1 + 클럽 ${urls.length - 1}곳`);

    // 클럽 자기 핸들 집합 — DJ/아티스트 인스타를 채울 때 클럽 계정으로 오연결되는 걸 막는다
    const clubHandleSet = new Set(handleToClub.keys());

    // 클럽명 매칭 인덱스 (큐레이션 캡션의 장소 → clubs)
    const clubNameIndex = new Map<string, string>();
    for (const c of clubs ?? []) {
      for (const cand of [c.name, c.name_en, ...(c.aliases ?? [])].filter(Boolean)) {
        const norm = normalizeClubName(cand);
        if (norm) clubNameIndex.set(norm, c.id);
      }
    }

    // club-account 게시물은 lineup_drafts.ig_permalink(UNIQUE)로 재처리를 막지만,
    // 큐레이션 게시물은 club_id를 사후에만 알 수 있어 draft claim을 안 한다 —
    // 대신 이미 club_events에 들어간 적 있는 source_post_id로 스킵한다. 이게
    // 없으면 큐레이션 게시물이 Apify 최근 N건 창에 남아있는 며칠 내내 매번
    // 재파싱돼 LLM 비용이 샌다(가수 이벤트가 하나도 안 나온 순수 DJ 게시물은
    // club_events에 안 남으므로 창을 벗어날 때까지는 어차피 재시도된다 — 이건
    // 기존에도 있던 한계로, 이번 변경으로 새로 생기는 문제는 아니다).
    const { data: existingPosts } = await supabase.from("club_events").select("source_post_id");
    const knownPosts = new Set((existingPosts ?? []).map((r: any) => r.source_post_id));

    // 2) Apify 수집 — 기본 액터 + 18+ 제한 계정 보조 액터
    //
    // 제한 계정은 기본 액터가 "Restricted profile" 에러만 돌려주므로 URL 목록에서
    // 빼고(넣어봐야 에러만 받고 그것도 과금된다) 보조 액터로 따로 가져온다.
    const restricted = RESTRICTED_HANDLES.filter((h) => handleToClub.has(h));
    const mainUrls = urls.filter((u) => {
      const m = u.match(/instagram\.com\/([^/?#]+)/i);
      return !(m && restricted.includes(m[1].toLowerCase()));
    });

    const [mainItems, restrictedItems] = await Promise.all([
      runApify(mainUrls),
      // 보조 액터가 죽어도 전체 수집은 계속되어야 한다.
      runApifyRestricted(restricted).catch((e) => {
        console.error(`⚠️ 제한계정 수집 실패: ${String(e).slice(0, 150)}`);
        return [] as any[];
      }),
    ]);
    if (restrictedItems.length > 0) {
      console.log(`🔒 제한계정에서 ${restrictedItems.length}건 수집`);
    }
    const rawItems = [...mainItems, ...restrictedItems];

    // 계정별 결과 집계 — 실행 합계로는 절대 안 보이는 것들을 여기서 남긴다.
    // (그루브가 왜 영영 안 들어오는지 같은 건 "요청한 계정 vs 받은 글의 주인"을
    //  계정 단위로 비교해야만 드러난다. 오늘 이걸 손으로 재현하느라 하루를 썼다.)
    type AcctStat = {
      handle: string; clubId: string | null; clubName: string | null;
      received: number; own: number; errorMsg: string | null;
      lineups: number; events: number; noDate: number;
      processed: number; // 실제로 파싱까지 간 글 수 (중복 스킵 제외)
    };
    const acct = new Map<string, AcctStat>();
    const statFor = (handle: string): AcctStat => {
      const key = handle.toLowerCase();
      let s = acct.get(key);
      if (!s) {
        const club = handleToClub.get(key);
        s = { handle: key, clubId: club?.id ?? null, clubName: club?.name ?? null,
              received: 0, own: 0, errorMsg: null, lineups: 0, events: 0, noDate: 0, processed: 0 };
        acct.set(key, s);
      }
      return s;
    };
    // 요청한 계정은 결과가 0건이어도 행이 남아야 한다("아무 일도 없었음"과
    // "요청조차 안 됨"을 구분하려면 요청 목록 전체를 미리 깔아둔다).
    for (const h of handleToClub.keys()) statFor(h);

    /**
     * 이 항목이 "어느 감시 계정을 요청하다 나온 것인지" 되짚는다.
     *
     * item.url 로 폴백하면 안 된다(2026-08-27 실측): 게시물 URL 은
     * instagram.com/p/{shortcode} · /reel/{shortcode} 형태라 shortcode 를
     * 계정명으로 뽑아낸다. 실제로 Club Nasub(clubnasub) 이 "@tgerdsco" 라는
     * 존재하지 않는 계정으로 화면에 떴다 — 그건 게시물 shortcode 조각이었다.
     * 프로필 URL(inputUrl/queryUrl)만 신뢰하고, 없으면 ownerUsername 을 쓰되
     * 그것도 없으면 null 로 둔다(잘못된 귀속보다 미집계가 낫다).
     */
    const requestedOf = (item: any): string | null => {
      const src = String(item.inputUrl ?? item.queryUrl ?? "");
      const m = src.match(/instagram\.com\/([^/?#]+)/i);
      const h = m?.[1]?.toLowerCase() ?? null;
      // /p/ /reel/ /explore/ 등은 계정이 아니다
      if (h && !["p", "reel", "reels", "tv", "explore", "stories"].includes(h)) return h;
      const owner = String(item.ownerUsername ?? "").toLowerCase();
      return owner || null;
    };

    const posts: any[] = [];
    for (const item of rawItems) {
      const req = requestedOf(item);
      if (item.error) {
        // "no_items"는 에러가 아니다 — onlyPostsNewerThan 범위 안에 새 글이
        // 없었을 뿐이다(액터가 빈 결과에도 이 코드를 붙여 돌려준다). 이걸
        // errorMsg로 남기면 멀쩡한 클럽이 "수집 불가"로 보인다.
        // 그 외(Restricted profile / not_found 등)는 진짜로 자동 수집이 안 되는 계정.
        if (req && String(item.error) !== "no_items") {
          const s = statFor(req);
          s.errorMsg = String(item.error).slice(0, 300);
        }
        continue;
      }
      const owner = String(item.ownerUsername ?? "").toLowerCase();
      if (req) {
        const s = statFor(req);
        s.received++;
        if (owner && owner === req) s.own++;
      }
      posts.push(item);
    }
    results.posts_seen = posts.length;
    console.log(`📦 ${posts.length}건 수집됨 (${urls.length}개 계정, 오류 ${rawItems.length - posts.length}건)`);

    const discoveredHandles = new Map<string, string>();
    const ctx: SaveCtx = {
      supabase,
      handleToClub,
      clubNameIndex,
      clubHandleSet,
      captionHandles: new Map(), // 게시물마다 아래에서 갱신
      discoveredHandles,
      results,
    };

    // 3) 게시물 처리 — club-account 게시물(클럽 확정) + 큐레이션 게시물(다중 장소)
    //    동시 워커 풀로 돌린다. 순차로 돌리면 Vision까지 가는 일부 게시물이
    //    전체를 밀어 25분 예산을 넘긴다(예전에 47/300건만 처리된 전례).

    /**
     * 이 게시물이 "어느 감시 계정을 요청하다 딸려온 것인지" 클럽 이름으로 되짚는다.
     * 핸들 파싱 자체는 requestedOf() 하나만 쓴다 — 예전엔 이 함수가 자체적으로
     * 파싱하면서 /p//reel/ 가드가 없었다(requestedOf 에는 있고 여기는 없는 상태로
     * 두 함수가 따로 존재했다). handleToClub 조회가 우연히 걸러줘서 지금까지는
     * shortcode가 클럽명으로 새지 않았지만, 그 조회를 걷어내면 바로 재발할
     * 자리였다 — 파싱은 requestedOf 로 통일하고 여기서는 클럽 이름 변환만 한다.
     * ownerUsername 폴백까지 거쳐도 감시 목록에 없으면 undefined
     * (잘못된 장소 힌트보다 힌트 없음이 낫다).
     */
    function requestedHandleOf(post: any): string | undefined {
      const h = requestedOf(post);
      if (!h) return undefined;
      return handleToClub.get(h)?.name;
    }

    let idx = 0;
    async function worker() {
      while (idx < posts.length) {
        if (Date.now() - startedAt > ELAPSED_BUDGET_MS) {
          results.budget_exhausted = true;
          return;
        }
        const post = posts[idx++];
        const ownerHandle = String(post.ownerUsername ?? "").toLowerCase();
        const isCuration = ownerHandle === CURATION_ACCOUNT;
        const sourceClub = handleToClub.get(ownerHandle) ?? null;
        const postId = String(post.id ?? post.shortCode ?? "");
        const reqHandle = requestedOf(post) ?? ownerHandle;

        // ⚠️ 워커 4개가 하나의 results/ctx를 공유하면서 "처리 전후 델타"로
        // 계정별 성과를 나누던 게 실제 버그였다(2026-08-27 실측): await 사이에
        // 다른 워커가 같은 카운터를 올려서 A 계정 글의 성과가 B 계정에 붙었다
        // (proc=0인데 lineups>0인 행이 실제로 나왔다). ctx.captionHandles도
        // 공유돼 있어 같은 경합이 있었다.
        // 게시물 하나 처리마다 자기만의 results/ctx 사본을 만들어 완전히
        // 격리하고, 끝난 뒤에만 전역 results에 더한다 — 델타가 아니라 합산이라
        // 순서와 무관하게 항상 맞다.
        const localResults = { ...results, errors: [] as string[] };
        const localCtx: SaveCtx = { ...ctx, captionHandles: extractPerformerHandles(post.caption ?? ""), results: localResults };

        try {
          if (isCuration) {
            if (postId && !knownPosts.has(postId)) {
              await processCurationPost(post, localCtx);
              knownPosts.add(postId);
            }
          } else if (sourceClub?.id) {
            await processClubAccountPost(post, sourceClub as ClubRef & { id: string }, localCtx);
          } else if (postId && !knownPosts.has(postId)) {
            // 감시 목록에 없는 계정의 글. "있을 수 없다"고 단정하고 버리던 자리인데,
            // 실측하니 36곳 중 18건이 이 형태로 왔다(요청한 클럽이 Restricted 등으로
            // 안 열리면 액터가 그 클럽을 태그한 남의 글을 대신 준다).
            // 어느 클럽을 요청하다 딸려온 글인지로 장소 힌트를 만들어 넘긴다.
            await processCurationPost(post, localCtx, requestedHandleOf(post));
            knownPosts.add(postId);
          }
        } catch (e) {
          localResults.errors.push(`post(${post.url ?? post.id}): ${String(e).slice(0, 150)}`);
          console.error("❌ 게시물 처리 실패:", e);
        }

        // 전역 합산 — 숫자 필드만 더한다(errors/budget_exhausted는 전역 값 유지)
        for (const key of Object.keys(localResults)) {
          if (typeof localResults[key] === "number") results[key] += localResults[key];
        }
        results.errors.push(...localResults.errors);

        if (reqHandle && acct.has(reqHandle)) {
          const s = acct.get(reqHandle)!;
          s.lineups += localResults.lineups_published + localResults.lineups_pending_review;
          s.events += localResults.events_approved + localResults.events_flagged;
          s.noDate += localResults.lineup_no_date;
          s.processed += localResults.posts_new;
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(POST_CONCURRENCY, posts.length) }, () => worker()));

    // 4) 클럽 지도 갱신 — 아카이브 전체를 재집계해 club_name_registry 동기화
    try {
      const { data: allEvents } = await supabase
        .from("club_events")
        .select("club_name_raw, club_id, venue_area, venue_type, event_date");
      const agg = new Map<
        string,
        { name_raw: string; area: string | null; count: number; dates: string[]; clubId: string | null; typeVotes: Record<string, number> }
      >();
      for (const r of allEvents ?? []) {
        const norm = normalizeClubName(r.club_name_raw ?? "");
        if (!norm) continue;
        const e = agg.get(norm) ?? { name_raw: r.club_name_raw, area: r.venue_area, count: 0, dates: [], clubId: null, typeVotes: {} };
        e.count++;
        if (r.event_date) e.dates.push(r.event_date);
        if (r.club_id) e.clubId = r.club_id;
        if (r.venue_type) e.typeVotes[r.venue_type] = (e.typeVotes[r.venue_type] ?? 0) + 1;
        agg.set(norm, e);
      }
      const { data: existingHandles } = await supabase
        .from("club_name_registry")
        .select("normalized_name, instagram_handle")
        .not("instagram_handle", "is", null);
      const preservedHandles = new Map((existingHandles ?? []).map((r) => [r.normalized_name, r.instagram_handle]));
      // 등록된 클럽의 확정 핸들 — 캡션에서 주운 값보다 항상 우선한다
      const clubIdToHandle = new Map<string, string>();
      for (const c of clubs ?? []) {
        const h = (c.instagram ?? "").trim().replace(/^@/, "");
        if (h) clubIdToHandle.set(c.id, h);
      }

      for (const [norm, e] of agg) {
        const dates = e.dates.sort();
        const topType = Object.entries(e.typeVotes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        // 핸들 우선순위: 등록된 클럽의 확정값 > 이전에 저장해 둔 값 > 캡션에서 주운 값.
        //
        // 캡션 추출을 맨 뒤로 미룬 이유(2026-08-27 실측): BREED 캡션이
        // "For reservation, contact Dm @breed_officia" 로 끝난다 — 인스타 원문에서
        // 이미 잘려 있다(정답은 breed_official). 이걸 그대로 registry 에 넣으면
        // 감시 목록에 없는 핸들이 하나 생겨 매일 not_found 로 뜬다.
        // clubs.instagram 에 사람이 확인한 값이 있으면 그게 항상 옳다.
        const clubHandle = e.clubId ? clubIdToHandle.get(e.clubId) ?? null : null;
        const handle = clubHandle ?? preservedHandles.get(norm) ?? discoveredHandles.get(norm) ?? null;
        await supabase.from("club_name_registry").upsert(
          {
            name_raw: e.name_raw,
            normalized_name: norm,
            area_guess: e.area,
            venue_type: topType,
            event_count: e.count,
            first_seen: dates[0] ?? null,
            last_seen: dates[dates.length - 1] ?? null,
            matched_club_id: e.clubId,
            instagram_handle: handle,
            status: e.clubId ? "matched" : "unmatched",
          },
          { onConflict: "name_raw" }
        );
      }
      if (discoveredHandles.size > 0) console.log(`🔗 캡션에서 새 인스타 핸들 ${discoveredHandles.size}건 발견`);
      const unmatched = [...agg.values()].filter((e) => !e.clubId).length;
      console.log(`🗺  클럽 지도 갱신: ${agg.size}곳 (미등록 ${unmatched}곳)`);
    } catch (e) {
      results.errors.push(`registry: ${String(e).slice(0, 150)}`);
      console.error("⚠️ 클럽 지도 갱신 실패 (공연 저장은 정상):", e);
    }

    console.log(
      `📊 완료 — 게시물 신규 ${results.posts_new} / 스킵 ${results.posts_skipped_prefilter} / 실패 ${results.parse_failures}`
    );
    console.log(
      `🎧 공연: 승인 ${results.events_approved} / 플래그 ${results.events_flagged} / 병합 ${results.events_merged}`
    );
    console.log(
      `🎧 라인업: 게시 ${results.lineups_published} / 검토대기 ${results.lineups_pending_review} / 타임테이블아님 ${results.lineup_not_timetable} / 날짜없음 ${results.lineup_no_date}`
    );

    // 5) 실행 기록 — 이게 없으면 위 숫자는 로그에 찍히고 사라진다.
    //    저장 실패가 수집 자체를 실패시키면 안 되므로 통째로 감싼다.
    try {
      const { data: run } = await supabase
        .from("collection_runs")
        .insert({
          trigger: "manual",
          source: "club-events",
          started_at: new Date(startedAt).toISOString(),
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
          sources_attempted: results.accounts,
          sources_ok: [...acct.values()].filter((s) => s.own > 0).length,
          sources_failed: [...acct.values()].filter((s) => s.errorMsg).length,
          media_seen: results.posts_seen,
          media_new: results.posts_new,
          drafts_created: results.lineup_drafts_created,
          auto_published: results.lineups_published,
          queued_for_review: results.lineups_pending_review,
          not_timetable: results.lineup_not_timetable,
          no_date_dropped: results.lineup_no_date,
          parse_failures: results.parse_failures,
          events_saved: results.events_approved + results.events_flagged,
          counters: results,
          errors: results.errors.slice(0, 50),
        })
        .select("id")
        .single();

      const rows = [...acct.values()].map((s) => {
        // outcome 판정 — 조치가 갈리는 지점이라 순서가 중요하다.
        //
        // ⚠️ 에러 메시지보다 "실제로 본인 글을 받았는가"가 우선이다.
        //    Apify 는 글을 정상적으로 돌려주면서도 restricted_page 같은 경고를
        //    같이 실어보내는 경우가 있다(실측: lionseoul 이 posts_own=2 인데도
        //    'restricted' 로 찍혀 관리자 화면에 "차단 — 수동 등록" 으로 떴다).
        //    에러를 무조건 앞에 두면 "정말 못 긁는 곳"과 "가끔 새는 곳"이 한 칸에
        //    섞여서, 수동 등록이 필요 없는 계정까지 운영자 작업 목록에 남는다.
        let outcome: string;
        if (s.errorMsg && s.own === 0) {
          // 본인 글을 한 건도 못 받았을 때만 에러를 그대로 결론으로 쓴다.
          outcome = /restricted/i.test(s.errorMsg) ? "restricted"
            : /not.?found|no results|does not exist/i.test(s.errorMsg) ? "not_found"
            : "error";
        } else if (s.received === 0) {
          outcome = "not_found";              // 요청했는데 글도 오류도 안 옴
        } else if (s.own === 0) {
          outcome = "tagged_only";            // 남의 글만 옴 = 본인 계정이 안 열림
        } else if (s.processed === 0) {
          // 받은 글이 전부 이미 처리된 것이라 LLM을 태우지도 않았다.
          // 이걸 no_lineup 으로 찍으면 "라인업 안 올리는 계정"과 구분이 안 되고,
          // 매일 재수집하는 구조에서는 대부분의 계정이 이 상태가 된다.
          outcome = "ok";
        } else if (s.lineups + s.events === 0) {
          outcome = "no_lineup";              // 새 글을 봤는데 라인업이 없었음
        } else {
          outcome = "ok";
        }
        return {
          run_id: run?.id ?? null,
          ig_handle: s.handle,
          club_id: s.clubId,
          club_name: s.clubName,
          outcome,
          posts_received: s.received,
          posts_own: s.own,
          posts_processed: s.processed,
          lineups_saved: s.lineups,
          events_saved: s.events,
          no_date_dropped: s.noDate,
          detail: s.errorMsg,
        };
      });
      if (rows.length) await supabase.from("collection_account_results").insert(rows);
      console.log(`📝 실행 기록 저장: 계정 ${rows.length}건`);
    } catch (e) {
      console.error("⚠️ 실행 기록 저장 실패 (수집 결과는 정상):", e);
    }

    return results;
  } catch (error) {
    console.error("💥 실행 실패:", error);
    results.errors.push(String(error).slice(0, 300));
    return results;
  }
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // 수집은 수 분이 걸리므로 응답을 기다리지 않는다. cron(pg_cron)은 202만 받고
  // 끊고, 실제 작업은 백그라운드에서 끝까지 돈다. 진행 상황은 함수 로그로 확인.
  // @ts-ignore — EdgeRuntime은 Supabase Edge Functions 런타임 전역
  EdgeRuntime.waitUntil(runCollection());

  return new Response(
    JSON.stringify({ accepted: true, message: "수집을 백그라운드에서 시작했습니다. 진행 상황은 함수 로그를 확인하세요." }),
    { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
