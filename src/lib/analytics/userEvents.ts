"use client";

// user_events 테이블에 raw 이벤트 저장. GA4·Mixpanel과 별개.
// 목적: Claude가 SQL로 임의 조회 가능한 유저 여정 raw 로그.
//
// - anon_id: localStorage에 UUID 저장. 로그인 전에도 유지.
// - session_id: anon_id + 세션 시작 시각. 30분 무활동 시 갱신.
// - 유입 정보: 세션 첫 이벤트에서 URL 쿼리·referrer 파싱해 저장.
//
// GA4/Mixpanel(events.ts trackEvent)와 병렬 호출. 실패해도 조용히 스킵.

import { createClient } from "@/lib/supabase/client";

const ANON_ID_KEY = "nf_anon_id";
const SESSION_KEY = "nf_session_id";
const SESSION_STARTED_KEY = "nf_session_started_at";
const SESSION_UTM_KEY = "nf_session_utm";
const LAST_EVENT_AT_KEY = "nf_last_event_at";
const SESSION_EVENT_COUNT_KEY = "nf_session_event_count";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;     // 30분 무활동 = 새 세션
const MAX_EVENTS_PER_SESSION = 300;             // 세션당 이벤트 상한 (봇/무한루프 방어)
const MAX_PROPERTIES_BYTES = 4096;              // properties JSONB 크기 상한 (서버 트리거와 일치)

// 초당 dedupe (같은 이벤트 이름 1초 내 중복 발동 방어).
// 콤포넌트 리렌더로 useEffect 재실행되는 경우 등.
const recentEventCache = new Map<string, number>();
const DEDUPE_WINDOW_MS = 1000;

// UUID v4 생성 (crypto.randomUUID는 iOS 15 Safari 미지원 케이스 대응)
function uuidv4(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 인앱 브라우저(인스타 등)에서 외부 브라우저(크롬/사파리)로 넘어올 때, 인앱이 넘겨준 anon_id를
// URL(?nf_anon=)로 받아 채택하기 위한 UUID 검증. 임의 값 주입/오염 방지.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getOrCreateAnonId(): string {
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      // 인앱→외부 브라우저 스티칭: 신규 브라우저(anon_id 없음)일 때만 넘겨받은 anon_id를 채택.
      // 이미 anon_id가 있는 브라우저는 절대 덮어쓰지 않음(기존 유저 정체성 보존).
      let adopted: string | null = null;
      if (typeof window !== "undefined") {
        const passed = new URLSearchParams(window.location.search).get("nf_anon");
        if (passed && UUID_RE.test(passed)) {
          adopted = passed;
          // 채택 후 URL에서 nf_anon 제거 — 공유 링크로 남의 anon_id가 전파돼 정체성이 섞이는 것 방지.
          try {
            const url = new URL(window.location.href);
            url.searchParams.delete("nf_anon");
            window.history.replaceState(null, "", url.pathname + url.search + url.hash);
          } catch {}
        }
      }
      id = adopted ?? uuidv4();
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    // localStorage 접근 실패(사파리 시크릿 등) → in-memory 폴백
    return uuidv4();
  }
}

function detectDeviceType(): "mobile" | "desktop" | "tablet" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/tablet|ipad|playbook|silk|(android(?!.*mobi))/i.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return "mobile";
  return "desktop";
}

function detectLang(): string {
  if (typeof window === "undefined") return "ko";
  const path = window.location.pathname;
  if (path.startsWith("/en/") || path === "/en") return "en";
  if (path.startsWith("/ja/") || path === "/ja") return "ja";
  if (path.startsWith("/zh-tw/") || path === "/zh-tw") return "zh-tw";
  if (path.startsWith("/zh/") || path === "/zh") return "zh";
  const q = new URLSearchParams(window.location.search).get("lang");
  if (q === "en" || q === "ja" || q === "zh" || q === "zh-tw") return q;
  return "ko";
}

interface SessionInfo {
  session_id: string;
  is_new_session: boolean;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
  landing_path: string | null;
}

function classifyChannelFromReferrer(referrer: string): string {
  const r = referrer.toLowerCase();
  if (r.includes("blog.naver.com")) return "blog";
  if (r.includes("instagram.com")) return "instagram";
  if (r.includes("search.naver.com")) return "organic";
  if (r.includes("google.")) return "organic";
  return "other";
}

function getOrRotateSession(anonId: string): SessionInfo {
  try {
    const now = Date.now();
    const lastAt = Number(localStorage.getItem(LAST_EVENT_AT_KEY) || 0);
    const existing = localStorage.getItem(SESSION_KEY);
    const stillActive = existing && now - lastAt < SESSION_TIMEOUT_MS;

    if (stillActive) {
      const utmRaw = localStorage.getItem(SESSION_UTM_KEY);
      const utm = utmRaw ? JSON.parse(utmRaw) : {};
      localStorage.setItem(LAST_EVENT_AT_KEY, String(now));
      return {
        session_id: existing!,
        is_new_session: false,
        utm_source: utm.utm_source ?? null,
        utm_medium: utm.utm_medium ?? null,
        utm_campaign: utm.utm_campaign ?? null,
        referrer: utm.referrer ?? null,
        landing_path: utm.landing_path ?? null,
      };
    }

    // 신규 세션 시작 — 유입 정보 파싱
    const newSessionId = `${anonId}_${now.toString(36)}`;
    const params = new URLSearchParams(window.location.search);
    const referrer = typeof document !== "undefined" ? document.referrer : "";
    const utmSource =
      params.get("utm_source") ||
      (referrer ? classifyChannelFromReferrer(referrer) : "direct");
    const utm = {
      utm_source: utmSource,
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
      referrer: referrer || null,
      landing_path: window.location.pathname,
    };

    localStorage.setItem(SESSION_KEY, newSessionId);
    localStorage.setItem(SESSION_STARTED_KEY, String(now));
    localStorage.setItem(LAST_EVENT_AT_KEY, String(now));
    localStorage.setItem(SESSION_UTM_KEY, JSON.stringify(utm));
    localStorage.setItem(SESSION_EVENT_COUNT_KEY, "0");  // 세션당 이벤트 상한 리셋

    return {
      session_id: newSessionId,
      is_new_session: true,
      ...utm,
    };
  } catch {
    // localStorage 실패 → in-memory 임시 세션
    const sid = `${anonId}_${Date.now().toString(36)}`;
    return {
      session_id: sid,
      is_new_session: true,
      utm_source: "direct",
      utm_medium: null,
      utm_campaign: null,
      referrer: null,
      landing_path: typeof window !== "undefined" ? window.location.pathname : null,
    };
  }
}

let cachedUserId: string | null = null;
let userIdFetchPromise: Promise<string | null> | null = null;

async function getCurrentUserId(): Promise<string | null> {
  if (cachedUserId) return cachedUserId;
  if (userIdFetchPromise) return userIdFetchPromise;

  userIdFetchPromise = (async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      cachedUserId = data.user?.id ?? null;
      return cachedUserId;
    } catch {
      return null;
    } finally {
      userIdFetchPromise = null;
    }
  })();

  return userIdFetchPromise;
}

// 로그아웃 시 캐시 리셋용 (auth 훅에서 호출하면 좋음. 안 해도 큰 문제 없음)
export function resetUserEventCache() {
  cachedUserId = null;
}

/**
 * 현재 세션의 유입 채널(UTM)을 읽기만 한다 — getOrRotateSession()과 같은
 * localStorage 키를 보되, 세션을 새로 굴리거나 이벤트를 기록하지 않는다.
 * foreign_requests INSERT처럼 "이 제출이 어느 채널에서 왔는지"만 필요한
 * 곳에서 쓴다(예: 구글애즈 전환 채널 분석).
 */
export function getCurrentUtm(): {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing_path: string | null;
} {
  try {
    const raw = localStorage.getItem(SESSION_UTM_KEY);
    if (!raw) return { utm_source: null, utm_medium: null, utm_campaign: null, landing_path: null };
    const utm = JSON.parse(raw);
    return {
      utm_source: utm.utm_source ?? null,
      utm_medium: utm.utm_medium ?? null,
      utm_campaign: utm.utm_campaign ?? null,
      landing_path: utm.landing_path ?? null,
    };
  } catch {
    return { utm_source: null, utm_medium: null, utm_campaign: null, landing_path: null };
  }
}

/**
 * user_events 테이블에 이벤트 저장. Fire-and-forget.
 * events.ts의 trackEvent()와 병렬로 자동 호출됨.
 *
 * @param eventName 'home_view' | 'flag_created' 등 표준 이벤트명
 * @param properties 이벤트별 추가 데이터 (JSONB로 저장)
 */
export async function trackUserEvent(
  eventName: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  if (typeof window === "undefined") return; // SSR 스킵

  try {
    // 방어 1: event_name 길이 (서버 트리거와 대칭)
    if (!eventName || eventName.length > 64) return;

    // 방어 2: 초당 dedupe — 같은 이벤트 1초 내 중복 방지
    const now = Date.now();
    const last = recentEventCache.get(eventName) ?? 0;
    if (now - last < DEDUPE_WINDOW_MS) return;
    recentEventCache.set(eventName, now);
    // 캐시 크기 폭주 방지 (30개 초과 시 오래된 것부터 제거)
    if (recentEventCache.size > 30) {
      const oldest = [...recentEventCache.entries()].sort((a, b) => a[1] - b[1])[0];
      if (oldest) recentEventCache.delete(oldest[0]);
    }

    // 방어 3: 세션당 이벤트 상한
    try {
      const count = Number(localStorage.getItem(SESSION_EVENT_COUNT_KEY) || 0);
      if (count >= MAX_EVENTS_PER_SESSION) return;
      localStorage.setItem(SESSION_EVENT_COUNT_KEY, String(count + 1));
    } catch {
      // localStorage 실패해도 트래킹은 계속. 무한 루프 위험은 dedupe로 커버.
    }

    // 방어 4: properties 크기 (JSON.stringify 후 4KB 초과 시 스킵)
    const propsJson = JSON.stringify(properties);
    if (propsJson.length > MAX_PROPERTIES_BYTES) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[trackUserEvent] ${eventName} properties too large (${propsJson.length}B), skipped`);
      }
      return;
    }

    const anonId = getOrCreateAnonId();
    const session = getOrRotateSession(anonId);
    const userId = await getCurrentUserId();

    const supabase = createClient();
    // 방어 5: user_id는 auth 세션에서만 가져옴. 클라 임의 값 못 넣도록 인자로 안 받음.
    // RLS가 user_id = auth.uid() 검증하므로 위조 시 INSERT 거부됨.
    const { error } = await supabase.from("user_events").insert({
      anon_id: anonId,
      user_id: userId,
      session_id: session.session_id,
      event_name: eventName,
      utm_source: session.utm_source,
      utm_medium: session.utm_medium,
      utm_campaign: session.utm_campaign,
      referrer: session.referrer,
      landing_path: session.landing_path,
      path: window.location.pathname,
      device_type: detectDeviceType(),
      lang: detectLang(),
      properties,
    });

    if (error && process.env.NODE_ENV === "development") {
      console.warn("[trackUserEvent] insert failed", error.message);
    }
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[trackUserEvent] error", e);
    }
  }
}
