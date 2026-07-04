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

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30분 무활동 = 새 세션

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

function getOrCreateAnonId(): string {
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = uuidv4();
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
  if (path.startsWith("/zh/") || path === "/zh") return "zh";
  const q = new URLSearchParams(window.location.search).get("lang");
  if (q === "en" || q === "ja" || q === "zh") return q;
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
    const anonId = getOrCreateAnonId();
    const session = getOrRotateSession(anonId);
    const userId = await getCurrentUserId();

    const supabase = createClient();
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
