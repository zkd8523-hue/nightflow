import { scrubContacts } from '@/lib/utils/promoParse';
import { toBusinessMinutes } from './time';

/**
 * emit_lineup 툴(LINEUP_EMIT_TOOL)의 원본 출력 형태. 신뢰하지 않는다 —
 * normalizeExtraction을 반드시 거친다.
 *
 * 게시물 하나가 여러 밤을 공지할 수 있어(월간 스케줄) events가 배열이다.
 * 정상적인 단일 공지는 events.length === 1.
 */
export interface RawLineupSet {
  dj_name: string;
  /** 다른 표기(한글↔영문 병기). 예: ELDER BROOK ↔ 엘더브룩 */
  alt_name?: string | null;
  role?: 'dj' | 'artist' | null;
  /** @ 없는 핸들. 이 사람 것이라고 확신할 수 없으면 모델이 null을 준다. */
  instagram?: string | null;
  /** 팀으로 묶여 하나의 set인데 멤버가 여럿일 때(예: "A & B") 멤버 핸들들. */
  member_handles?: string[];
  start_hhmm: string | null;
  end_hhmm: string | null;
}

export interface RawLineupEvent {
  event_date: string | null; // "MM-DD"
  event_title: string | null;
  door_open_hhmm: string | null;
  /** 이 밤의 장소. 게시물 하나가 여러 밤=여러 장소를 나열할 수 있어(주간 다이제스트
   * 계정) 이벤트마다 따로 둔다 — 게시물 전체에 장소 하나를 가정하면 안 된다. */
  venue_name: string | null;
  venue_instagram: string | null;
  venue_area: string | null;
  venue_type?: 'club' | 'venue' | 'other' | null;
  /** 캡션에 명시된 예매/티켓 링크. 모델이 지어내지 않는다는 전제 하에, 여기서는
   * 형식만 검증한다("이게 진짜 티켓 링크인가"는 프롬프트가 이미 판단했다). */
  ticket_url?: string | null;
  sets: RawLineupSet[];
}

export interface RawExtraction {
  /** true면 공연 공지가 아니다(영업안내·홍보 등) — events는 비어 있어야 한다. */
  is_promo_only?: boolean;
  events: RawLineupEvent[];
}

export interface NormalizedSetRow {
  raw_name: string;
  altName: string | null;
  role: 'dj' | 'artist';
  /** 검증을 통과한 핸들. 확신 없으면 null — 오연결이 미입력보다 나쁘다. */
  instagram: string | null;
  memberHandles: string[];
  start_min: number | null;
  end_min: number | null;
}

export interface NormalizedEvent {
  doorOpenMin: number | null;
  eventTitle: string | null;
  /** "MM-DD" 그대로 넘긴다 — 연도는 호출부가 현재 KST 기준으로 붙인다. */
  eventMonthDay: string | null;
  venueName: string | null;
  venueInstagram: string | null;
  ticketUrl: string | null;
  venueArea: string | null;
  venueType: 'club' | 'venue' | 'other' | null;
  rows: NormalizedSetRow[];
  /** 이름을 못 읽어(스크럽 후 빈 문자열) 통째로 버려진 행 수. confidence.ts의 입력. */
  droppedRowCount: number;
}

export interface NormalizedExtraction {
  isPromoOnly: boolean;
  events: NormalizedEvent[];
}

const MAX_EVENTS = 12;
const MAX_SETS = 20;
const MAX_NAME_LEN = 30;
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function safeToBusinessMin(hhmm: string | null | undefined): number | null {
  if (!hhmm || !HHMM_RE.test(hhmm)) return null;
  return toBusinessMinutes(hhmm);
}

/**
 * 핸들 검증 — 형식만 본다. "이 사람 것이 맞다"는 판단은 프롬프트가 이미 했고,
 * 여기서는 명백히 잘못된 값(전화번호, 티켓 플랫폼, 형식 오류)만 걸러낸다.
 *
 * blockedHandles: 호출부가 아는 "출연자가 아닌 계정"(클럽 자기 계정 등)을 넘기면
 * 추가로 차단한다. 실측 사고: 캡션의 "(본공연 정보 @clubheavy)"가 DJ 핸들로
 * 오연결된 적이 있다 — 그 계정이 클럽 것이라는 걸 아는 건 호출부(DB 접근)뿐이라
 * 이 함수는 순수하게 옵션으로만 받는다.
 */
const HANDLE_FORMAT_RE = /^[a-z0-9._]{2,30}$/;
const NON_PERFORMER_HANDLES = new Set([
  'dumbs_app', 'resident_advisor', 'nol.ticket', 'interpark', 'yes24',
  'melon', 'ticketlink', 'instagram', 'spotify', 'soundcloud', 'youtube',
]);
export function sanitizeHandle(raw: string | null | undefined, blockedHandles?: Set<string>): string | null {
  if (!raw) return null;
  const h = raw.trim().replace(/^@/, '').toLowerCase();
  if (!HANDLE_FORMAT_RE.test(h)) return null;
  if (/^01[016789]\d{7,8}$/.test(h)) return null; // 전화번호가 그대로 들어온 경우
  if (NON_PERFORMER_HANDLES.has(h)) return null;
  if (blockedHandles?.has(h)) return null;
  return h;
}

/**
 * 예매 링크 검증 — http(s) URL 형식만 본다. 인스타그램 자기 게시물/프로필
 * 링크는 이미 "원본 게시물 보기"로 따로 노출되므로 중복이라 걸러낸다.
 */
function sanitizeTicketUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (/(^|\.)instagram\.com$/.test(url.hostname)) return null;
  return trimmed.slice(0, 500);
}

function normalizeLineupEvent(rawEvent: RawLineupEvent | undefined): NormalizedEvent {
  const sets = Array.isArray(rawEvent?.sets) ? rawEvent!.sets.slice(0, MAX_SETS) : [];
  let droppedRowCount = 0;
  const rows: NormalizedSetRow[] = [];

  for (const s of sets) {
    const rawName = scrubContacts(String(s?.dj_name ?? '').trim()).slice(0, MAX_NAME_LEN);
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

    const altName = s?.alt_name ? scrubContacts(String(s.alt_name).trim()).slice(0, MAX_NAME_LEN) || null : null;
    const role: 'dj' | 'artist' = s?.role === 'artist' ? 'artist' : 'dj'; // 애매하면 dj(실측상 압도적 다수)
    const instagram = sanitizeHandle(s?.instagram);
    const memberHandles = Array.isArray(s?.member_handles)
      ? s!.member_handles.map((h) => sanitizeHandle(h)).filter((h): h is string => h !== null)
      : [];

    rows.push({ raw_name: rawName, altName, role, instagram, memberHandles, start_min: start, end_min: end });
  }

  const doorOpenMin = safeToBusinessMin(rawEvent?.door_open_hhmm ?? undefined);
  const eventTitle = rawEvent?.event_title
    ? scrubContacts(rawEvent.event_title).trim().slice(0, 60) || null
    : null;
  const eventMonthDay =
    typeof rawEvent?.event_date === 'string' && /^\d{2}-\d{2}$/.test(rawEvent.event_date)
      ? rawEvent.event_date
      : null;
  const venueName = rawEvent?.venue_name ? scrubContacts(rawEvent.venue_name).trim().slice(0, 60) || null : null;
  const venueInstagram = sanitizeHandle(rawEvent?.venue_instagram);
  const venueArea = rawEvent?.venue_area ? String(rawEvent.venue_area).trim().slice(0, 20) || null : null;
  const venueType: 'club' | 'venue' | 'other' | null =
    rawEvent?.venue_type === 'club' || rawEvent?.venue_type === 'venue' || rawEvent?.venue_type === 'other'
      ? rawEvent.venue_type
      : null;
  const ticketUrl = sanitizeTicketUrl(rawEvent?.ticket_url);

  return { doorOpenMin, eventTitle, eventMonthDay, venueName, venueInstagram, venueArea, venueType, ticketUrl, rows, droppedRowCount };
}

/**
 * emit_lineup 출력 → DB에 넣을 수 있는 형태로 정규화.
 *
 * 모델을 신뢰하지 않고 서버에서 전부 재검증한다는 철학은 이전(normalizeParsedLineup)과
 * 같다. 바뀐 것:
 *   - 시간 없음은 더 이상 폐기 사유가 아니다(이름이 없을 때만 폐기)
 *   - 게시물 하나가 여러 밤(events)을 공지할 수 있다(월간 스케줄)
 *   - role/instagram/altName/memberHandles를 함께 정규화한다
 */
export function normalizeExtraction(raw: RawExtraction | null | undefined): NormalizedExtraction {
  const isPromoOnly = raw?.is_promo_only === true;
  const rawEvents = Array.isArray(raw?.events) ? raw!.events.slice(0, MAX_EVENTS) : [];
  const events = isPromoOnly ? [] : rawEvents.map(normalizeLineupEvent);
  return { isPromoOnly, events };
}
