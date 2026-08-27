// ⚠️ 이 파일은 다음 4개 npm 모듈의 복제본이다 (Deno가 @/lib 경로를 못 읽어서):
//   src/lib/lineups/djName.ts       (normalizeDjName)
//   src/lib/lineups/time.ts         (toBusinessMinutes 등 — hotdeal.ts 원본)
//   src/lib/lineups/parse.ts        (normalizeExtraction, sanitizeHandle)
//   src/lib/lineups/confidence.ts   (scoreLineup, canAutoPublish)
//
// 로직을 고치면 관련 파일들도 같이 고칠 것(자동 검사는 프롬프트 상수만 커버한다 —
// scripts/check-lineup-prompt-sync.mjs).
//
// ⚠️ 하위 호환 주의: collect-ig-lineups(IG 공식 API 경로, 현재 범위 밖 —
// 사용자가 "IG 공식 API는 안 쓰기로 했다"고 결정함)가 아직 이 파일의
// normalizeParsedLineup/RawParsedLineup/scoreLineup/canAutoPublish/
// passesPreVisionGate 를 옛 이름 그대로 import한다. 그 함수가 이 파일에서
// 사라지면 collect-ig-lineups 는 named export 를 못 찾아 로드 자체가 깨진다.
// 그래서 옛 이름들은 아래에 "레거시 호환" 절에서 그대로 export 유지하고,
// 새 파이프라인(2단계 추출·role 분리·다중 이벤트)은 별도 이름
// (normalizeExtraction 등)으로 추가한다.

// ---------------------------------------------------------------------------
// 시간 변환 (src/lib/lineups/time.ts 원본과 동일 로직 — hotdeal.ts 그대로가 아님)
//
// hotdeal.ts의 컷오프(h<6)를 그대로 쓰면 06:00/07:00 같은 라인업 마감 시각이
// "새벽이라 뒤로 민다"에 안 걸려 0, 60으로 리셋되고 라인업 맨 앞으로 튀어오르는
// 정렬 버그가 생긴다(CLUB BERMUDA 포스터로 실제 재현됨). 라인업은 09시까지를
// "같은 밤의 연장"으로 본다.
// ---------------------------------------------------------------------------
const BUSINESS_DAY_CUTOFF_HOUR = 6;
const LINEUP_NIGHT_END_HOUR = 9;

export function toBusinessMinutes(hhmm: string): number {
  const h = parseInt(hhmm.slice(0, 2), 10);
  const m = parseInt(hhmm.slice(3, 5), 10) || 0;
  const shifted = h < LINEUP_NIGHT_END_HOUR ? h + 24 : h;
  return (shifted - BUSINESS_DAY_CUTOFF_HOUR) * 60 + m;
}

export function getBusinessDateISO(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  if (kst.getUTCHours() < BUSINESS_DAY_CUTOFF_HOUR) {
    kst.setUTCDate(kst.getUTCDate() - 1);
  }
  return kst.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// DJ 이름 정규화 (src/lib/lineups/djName.ts 원본과 동일 로직)
// ---------------------------------------------------------------------------
export function normalizeDjName(raw: string): string {
  const stripped = raw.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
  const noLeadingDj = stripped.startsWith("dj") ? stripped.slice(2) : stripped;
  const noTrailingDj = noLeadingDj.endsWith("dj") ? noLeadingDj.slice(0, -2) : noLeadingDj;
  return noTrailingDj || stripped;
}

// ---------------------------------------------------------------------------
// 연락처 스크럽 (src/lib/utils/promoParse.ts scrubContacts 의 간이 버전 —
// contact-detector.ts 의존이 커서 이 파일엔 간이 버전만 둔다. 연락처 패턴은
// 시스템 프롬프트가 1차로 막고, 이건 2차 방어)
// ---------------------------------------------------------------------------
const SIMPLE_CONTACT_RE = /(https?:\/\/\S+|\bopen\.kakao\.com\S*|\b01[016789]-?\d{3,4}-?\d{4}\b|@[a-zA-Z0-9._]{2,30})/g;
function scrubContactsSimple(text: string): string {
  return text.replace(SIMPLE_CONTACT_RE, "").trim();
}

// ---------------------------------------------------------------------------
// ⚠️ 레거시 — collect-ig-lineups(IG 공식 API 경로, 범위 밖) 전용.
// 새 코드(collect-club-events)는 아래 "신규 추출 파이프라인" 절의
// normalizeExtraction/RawExtraction 을 쓴다. 이 블록은 옛 import 를
// 깨뜨리지 않기 위해서만 존재한다 — 로직을 여기서 더 발전시키지 말 것.
// ---------------------------------------------------------------------------
export interface RawLineupSet {
  dj_name: string;
  start_hhmm: string;
  end_hhmm: string;
}
export interface RawParsedLineup {
  event_date: string | null;
  event_title: string | null;
  door_open_hhmm: string | null;
  sets: RawLineupSet[];
}
export interface NormalizedSetRow {
  raw_name: string;
  start_min: number | null;
  end_min: number | null;
}
export interface NormalizedLineup {
  doorOpenMin: number | null;
  eventTitle: string | null;
  eventMonthDay: string | null;
  rows: NormalizedSetRow[];
  droppedRowCount: number;
}

const MAX_SETS = 20;
const MAX_NAME_LEN = 30;
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function safeToBusinessMin(hhmm: string | null | undefined): number | null {
  if (!hhmm || !HHMM_RE.test(hhmm)) return null;
  return toBusinessMinutes(hhmm);
}

export function normalizeParsedLineup(raw: RawParsedLineup): NormalizedLineup {
  const sets = Array.isArray(raw.sets) ? raw.sets.slice(0, MAX_SETS) : [];
  let droppedRowCount = 0;
  const rows: NormalizedSetRow[] = [];

  for (const s of sets) {
    const rawName = scrubContactsSimple(String(s?.dj_name ?? "").trim()).slice(0, MAX_NAME_LEN);
    const start = safeToBusinessMin(s?.start_hhmm);
    let end = safeToBusinessMin(s?.end_hhmm);

    if (start !== null && end !== null && end <= start) {
      const shifted = end + 1440;
      end = shifted <= 1620 ? shifted : null;
    }
    if (start === null || end === null) {
      droppedRowCount += 1;
      continue;
    }
    rows.push({ raw_name: rawName, start_min: start, end_min: end });
  }

  const doorOpenMin = safeToBusinessMin(raw.door_open_hhmm ?? undefined);
  const eventTitle = raw.event_title ? scrubContactsSimple(raw.event_title).trim().slice(0, 60) || null : null;
  const eventMonthDay =
    typeof raw.event_date === "string" && /^\d{2}-\d{2}$/.test(raw.event_date) ? raw.event_date : null;

  return { doorOpenMin, eventTitle, eventMonthDay, rows, droppedRowCount };
}

// ---------------------------------------------------------------------------
// 신뢰도 스코어 (src/lib/lineups/confidence.ts 원본과 동일 로직)
// ---------------------------------------------------------------------------
export const AUTO_PUBLISH_MIN_SCORE = 85;
const GAP_TOLERANCE_MIN = 15;

export interface ConfidenceSetInput {
  raw_name: string;
  start_min: number | null;
  end_min: number | null;
  matchedDjId: string | null;
}
export interface ConfidenceInput {
  sets: ConfidenceSetInput[];
  eventDateResolved: boolean;
  eventDateSource: "poster" | "caption" | "media_timestamp" | null;
  doorOpenMin: number | null;
  droppedRowCount: number;
}
export interface ConfidenceResult {
  score: number;
  detail: Record<string, number>;
  blockers: string[];
}

export function scoreLineup(input: ConfidenceInput): ConfidenceResult {
  const detail: Record<string, number> = {};
  const blockers: string[] = [];
  let score = 100;

  const deduct = (key: string, amount: number) => {
    if (amount <= 0) return;
    detail[key] = (detail[key] ?? 0) + amount;
    score -= amount;
  };

  if (!input.eventDateResolved) blockers.push("no_date");
  if (input.sets.length < 2) blockers.push("too_few_sets");

  const unmatchedCount = input.sets.filter((s) => s.matchedDjId === null).length;
  deduct("unmatched_dj", unmatchedCount * 25);

  const unreadTimeCount = input.sets.filter((s) => s.start_min === null || s.end_min === null).length;
  deduct("unreadable_time", unreadTimeCount * 20);

  deduct("dropped_rows", input.droppedRowCount * 15);

  const timed = input.sets.filter(
    (s): s is ConfidenceSetInput & { start_min: number; end_min: number } =>
      s.start_min !== null && s.end_min !== null
  );
  const sortedByStart = [...timed].sort((a, b) => a.start_min - b.start_min);
  const isReversed = timed.some((s, i) => s !== sortedByStart[i]);
  if (isReversed) deduct("time_reversed", 20);

  let discontinuities = 0;
  for (let i = 1; i < sortedByStart.length; i++) {
    const gap = sortedByStart[i].start_min - sortedByStart[i - 1].end_min;
    if (Math.abs(gap) > GAP_TOLERANCE_MIN) discontinuities += 1;
  }
  deduct("time_discontinuity", discontinuities * 10);

  if (input.eventDateSource === "media_timestamp") deduct("date_from_timestamp", 15);
  if (input.sets.length > 20) deduct("too_many_sets", 20);
  if (input.doorOpenMin === null) deduct("no_door_open", 5);

  const clamped = Math.max(0, Math.min(100, score));
  return { score: clamped, detail, blockers };
}

export function canAutoPublish(result: ConfidenceResult, sets: ConfidenceSetInput[]): boolean {
  if (result.blockers.length > 0) return false;
  if (result.score < AUTO_PUBLISH_MIN_SCORE) return false;
  if (sets.some((s) => s.matchedDjId === null)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// 타임테이블 판별 게이트 (설계 Step 4) — Vision 호출 전 무료 사전 필터
// ---------------------------------------------------------------------------
const NEGATIVE_CAPTION_RE = /채용|모집|공지|휴무|생일|후기|당첨/;
const POSITIVE_CAPTION_RE = /라인업|LINEUP|LINE\s*UP|타임테이블|TIME\s*TABLE|DJ\s|게스트|GUEST\s*DJ|OPEN\s*22|@/i;

/** true면 Vision 호출 진행, false면 스킵(Vision 비용 자체를 아낀다). */
export function passesPreVisionGate(mediaType: string, mediaUrl: string | null, caption: string | null): boolean {
  if (mediaType !== "IMAGE" && mediaType !== "CAROUSEL_ALBUM") return false;
  if (!mediaUrl) return false;
  const text = caption ?? "";
  const hasNegative = NEGATIVE_CAPTION_RE.test(text);
  const hasPositive = POSITIVE_CAPTION_RE.test(text);
  // 부정 신호만 있고 긍정 신호가 없으면 스킵. 그 외(둘 다 없음 포함)는 통과.
  if (hasNegative && !hasPositive) return false;
  return true;
}

// ---------------------------------------------------------------------------
// 날짜 확정 — 포스터 MM-DD + 게시 시각 → YYYY-MM-DD
// ---------------------------------------------------------------------------
/**
 * 포스터에서 읽은 "MM-DD"에 연도를 붙이고, 게시 시각과 대조해 말이 되는지 본다.
 *
 * 왜 필요한가: 포스터에 일자만 있고 월이 없는 경우가 흔하다(예: "[28. FRI]").
 * 그러면 Vision이 "28일이 금요일인 달"을 추측해 월을 지어낸다. 실제로 8월에 올라온
 * ROOTS 포스터가 11-28로 파싱돼 목록 맨 뒤에 3개월 뒤 항목으로 끼어든 사고가 있었다.
 *
 * 규칙:
 *   1) 연말연시 경계 보정 (12월에 올린 1월 포스터 → 다음 해, 그 반대도)
 *   2) 게시일 기준 과거 3일 ~ 미래 90일을 벗어나면 신뢰하지 않는다.
 *      클럽 포스터는 보통 며칠 전에 올라오므로 이 범위를 벗어난 값은
 *      월을 잘못 읽었을 확률이 훨씬 높다 → null 을 돌려 호출부가 게시 시각으로 폴백.
 *
 * @returns YYYY-MM-DD, 또는 신뢰할 수 없으면 null
 */
export function resolveLineupDate(
  monthDay: string | null,
  postTimestamp: string | null,
): string | null {
  if (!monthDay) return null;
  const [mm, dd] = monthDay.split("-").map(Number);
  if (!mm || !dd || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const posted = postTimestamp ? new Date(postTimestamp) : new Date();
  if (Number.isNaN(posted.getTime())) return null;

  let year = posted.getUTCFullYear();
  if (posted.getUTCMonth() === 11 && mm === 1) year += 1; // 12월에 올린 1월 포스터
  if (posted.getUTCMonth() === 0 && mm === 12) year -= 1; // 1월에 올린 12월 포스터

  const iso = `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;

  // 게시 시각 대조 — 너무 멀면 월을 잘못 읽은 것으로 본다
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = (new Date(`${iso}T00:00:00Z`).getTime() - posted.getTime()) / dayMs;
  if (diffDays < -3 || diffDays > 90) return null;

  return iso;
}

// ---------------------------------------------------------------------------
// 캡션 "이름 @핸들" 추출 — 출연자 인스타 자동 등록
// ---------------------------------------------------------------------------
/**
 * 클럽 캡션은 라인업을 "YVES (LIVE) @yvesntual" 처럼 이름과 핸들을 나란히 적는 일이 많다.
 * 사람이 구글로 찾고 있는 핸들이 캡션 안에 이미 텍스트로 들어와 있는 셈이라, 이걸
 * 자동으로 걷어 djs/artists 의 instagram 을 채운다.
 *
 * 오연결이 미입력보다 나쁘므로 다음만 인정한다:
 *   - 한 줄이 "이름 ... @핸들" 로 끝나는 형태 (캡션 아무 데나 흩어진 @는 무시)
 *   - 티켓·미디어 플랫폼 계정 제외
 *   - 역할 레이블(DJ/LIVE/GUEST)과 괄호 주석은 이름에서 떼어낸다
 */
const NON_PERFORMER_HANDLES = new Set([
  "dumbs_app", "resident_advisor", "nol.ticket", "interpark", "yes24",
  "melon", "ticketlink", "instagram", "spotify", "soundcloud", "youtube",
]);
const ROLE_PREFIX_RE = /^(dj|live|guest|host|opening|support|b2b|vj|mc)\s*[-:]?\s*/i;
const NAME_HANDLE_LINE_RE = /^(.{1,60}?)\s*@(\w[\w._]{1,29})\s*$/;
const NON_NAME_RE = /티켓|ticket|venue|장소|문의|예약|주소|info/i;

/** 캡션 → Map(표시이름 → 핸들). 같은 이름이 다른 핸들로 충돌하면 그 이름은 버린다. */
export function extractPerformerHandles(caption: string | null): Map<string, string> {
  const found = new Map<string, Set<string>>();
  for (const rawLine of String(caption ?? "").split("\n")) {
    const m = rawLine.trim().match(NAME_HANDLE_LINE_RE);
    if (!m) continue;

    const name = m[1]
      .replace(/\([^)]*\)/g, "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(ROLE_PREFIX_RE, "")
      .replace(/[-–—:•·,]+$/, "")
      .trim();
    const handle = m[2].toLowerCase();

    if (name.length < 2) continue;
    if (NON_PERFORMER_HANDLES.has(handle)) continue;
    if (NON_NAME_RE.test(name)) continue;

    if (!found.has(name)) found.set(name, new Set());
    found.get(name)!.add(handle);
  }

  const out = new Map<string, string>();
  for (const [name, handles] of found) {
    if (handles.size === 1) out.set(name, [...handles][0]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 신규 추출 파이프라인 (src/lib/lineups/parse.ts 원본과 동일 로직)
//
// 옛 extractCaptionLineup(정규식으로 "LINE UP" 헤더 줄만 찾던 파서)은 폐기했다 —
// 실측(캡션 158건 전수)에서 그 헤더가 단독 줄로 나온 건 3건뿐이었다. 나머지는
// "MUSIC:", "•Live", "DJ: arlyn"(인라인), 슬래시 목록, 게스트 1명 공지, 본문
// 문장 등 형태가 제각각이라 정규식으로는 못 따라간다 — 이제 LLM(emit_lineup 툴)이
// 캡션+포스터를 함께 보고 한 번에 뽑는다. 이 절은 그 출력을 검증·정규화한다.
// ---------------------------------------------------------------------------
export interface RawExtractionSet {
  dj_name: string;
  alt_name?: string | null;
  role?: "dj" | "artist" | null;
  instagram?: string | null;
  member_handles?: string[];
  start_hhmm: string | null;
  end_hhmm: string | null;
}
export interface RawExtractionEvent {
  event_date: string | null;
  event_title: string | null;
  door_open_hhmm: string | null;
  /** 이 밤의 장소. 게시물 하나가 여러 밤=여러 장소를 나열할 수 있어(주간 다이제스트
   * 계정) 이벤트마다 따로 둔다 — 게시물 전체에 장소 하나를 가정하면 안 된다. */
  venue_name: string | null;
  venue_instagram: string | null;
  venue_area: string | null;
  venue_type?: "club" | "venue" | "other" | null;
  sets: RawExtractionSet[];
}
export interface RawExtraction {
  is_promo_only?: boolean;
  events: RawExtractionEvent[];
}

export interface NormalizedExtractionSetRow {
  raw_name: string;
  altName: string | null;
  role: "dj" | "artist";
  /** 검증을 통과한 핸들. 확신 없으면 null — 오연결이 미입력보다 나쁘다. */
  instagram: string | null;
  memberHandles: string[];
  start_min: number | null;
  end_min: number | null;
}
export interface NormalizedExtractionEvent {
  doorOpenMin: number | null;
  eventTitle: string | null;
  eventMonthDay: string | null;
  venueName: string | null;
  venueInstagram: string | null;
  venueArea: string | null;
  venueType: "club" | "venue" | "other" | null;
  rows: NormalizedExtractionSetRow[];
  droppedRowCount: number;
}
export interface NormalizedExtraction {
  isPromoOnly: boolean;
  events: NormalizedExtractionEvent[];
}

/**
 * 핸들 검증 — 형식만 본다. "이 사람 것이 맞다"는 판단은 프롬프트가 이미 했고,
 * 여기서는 명백히 잘못된 값(전화번호, 티켓 플랫폼, 형식 오류)만 걸러낸다.
 *
 * blockedHandles: 호출부가 아는 "출연자가 아닌 계정"(클럽 자기 계정 등)을 넘기면
 * 추가로 차단한다. 실측 사고: 캡션의 "(본공연 정보 @clubheavy)"가 DJ 핸들로
 * 오연결된 적이 있다 — 그 계정이 클럽 것이라는 건 호출부(DB의 handleToClub)만 아니라
 * 이 함수는 순수하게 옵션으로만 받는다.
 */
const HANDLE_FORMAT_RE = /^[a-z0-9._]{2,30}$/;
export function sanitizeHandle(raw: string | null | undefined, blockedHandles?: Set<string>): string | null {
  if (!raw) return null;
  const h = raw.trim().replace(/^@/, "").toLowerCase();
  if (!HANDLE_FORMAT_RE.test(h)) return null;
  if (/^01[016789]\d{7,8}$/.test(h)) return null; // 전화번호가 그대로 들어온 경우
  if (NON_PERFORMER_HANDLES.has(h)) return null;
  if (blockedHandles?.has(h)) return null;
  return h;
}

const MAX_EVENTS = 12;
const MAX_EXTRACT_SETS = 20;
const MAX_EXTRACT_NAME_LEN = 30;

function normalizeExtractionEvent(rawEvent: RawExtractionEvent | undefined): NormalizedExtractionEvent {
  const sets = Array.isArray(rawEvent?.sets) ? rawEvent!.sets.slice(0, MAX_EXTRACT_SETS) : [];
  let droppedRowCount = 0;
  const rows: NormalizedExtractionSetRow[] = [];

  for (const s of sets) {
    const rawName = scrubContactsSimple(String(s?.dj_name ?? "").trim()).slice(0, MAX_EXTRACT_NAME_LEN);
    // 이름을 못 읽었을 때만 버린다 — 시간이 없다고 버리지 않는다(캡션 라인업은
    // 시간이 원래 없는 게 정상이다. Migration 573으로 DB도 NULL을 허용한다).
    if (!rawName) {
      droppedRowCount += 1;
      continue;
    }

    let start = safeToBusinessMin(s?.start_hhmm ?? undefined);
    let end = safeToBusinessMin(s?.end_hhmm ?? undefined);
    if (start !== null && end !== null && end <= start) {
      const shifted = end + 1440;
      end = shifted <= 1620 ? shifted : null;
    }
    if (start === null && end !== null) end = null; // 끝만 있는 건 의미가 없다

    const altName = s?.alt_name
      ? scrubContactsSimple(String(s.alt_name).trim()).slice(0, MAX_EXTRACT_NAME_LEN) || null
      : null;
    const role: "dj" | "artist" = s?.role === "artist" ? "artist" : "dj"; // 애매하면 dj(실측상 압도적 다수)
    const instagram = sanitizeHandle(s?.instagram);
    const memberHandles = Array.isArray(s?.member_handles)
      ? s!.member_handles.map((h) => sanitizeHandle(h)).filter((h): h is string => h !== null)
      : [];

    rows.push({ raw_name: rawName, altName, role, instagram, memberHandles, start_min: start, end_min: end });
  }

  const doorOpenMin = safeToBusinessMin(rawEvent?.door_open_hhmm ?? undefined);
  const eventTitle = rawEvent?.event_title
    ? scrubContactsSimple(rawEvent.event_title).trim().slice(0, 60) || null
    : null;
  const eventMonthDay =
    typeof rawEvent?.event_date === "string" && /^\d{2}-\d{2}$/.test(rawEvent.event_date)
      ? rawEvent.event_date
      : null;
  const venueName = rawEvent?.venue_name ? scrubContactsSimple(rawEvent.venue_name).trim().slice(0, 60) || null : null;
  const venueInstagram = sanitizeHandle(rawEvent?.venue_instagram);
  const venueArea = rawEvent?.venue_area ? String(rawEvent.venue_area).trim().slice(0, 20) || null : null;
  const venueType: "club" | "venue" | "other" | null =
    rawEvent?.venue_type === "club" || rawEvent?.venue_type === "venue" || rawEvent?.venue_type === "other"
      ? rawEvent.venue_type
      : null;

  return { doorOpenMin, eventTitle, eventMonthDay, venueName, venueInstagram, venueArea, venueType, rows, droppedRowCount };
}

/**
 * emit_lineup 출력 → DB에 넣을 수 있는 형태로 정규화.
 *
 * 모델을 신뢰하지 않고 서버에서 전부 재검증한다는 철학은 이전과 같다. 바뀐 것:
 *   - 시간 없음은 더 이상 폐기 사유가 아니다(이름이 없을 때만 폐기)
 *   - 게시물 하나가 여러 밤(events)을 공지할 수 있다(월간 스케줄)
 *   - role/instagram/altName/memberHandles를 함께 정규화한다
 */
export function normalizeExtraction(raw: RawExtraction | null | undefined): NormalizedExtraction {
  const isPromoOnly = raw?.is_promo_only === true;
  const rawEvents = Array.isArray(raw?.events) ? raw!.events.slice(0, MAX_EVENTS) : [];
  const events = isPromoOnly ? [] : rawEvents.map(normalizeExtractionEvent);
  return { isPromoOnly, events };
}
