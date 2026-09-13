"use client";

import { useEffect, useState } from "react";
import { detectArea, ROOM_LABEL } from "@/lib/chat/areas";
import { getCurrentCoords } from "@/lib/geo/currentCoords";
import { fetchNearestClubsAnyArea } from "@/lib/clubs/nearestClubs";

/**
 * "지금(또는 마지막으로) 어느 동네에 있었나" — 홈 개인화용(당신을 뛰게 할 DJ 카드 등).
 * 반환값은 clubs.area 라벨("홍대"·"부산"·"대구"…)이라 카드의 club_area 와 바로 비교된다.
 *
 * 판정 순서
 *   1) 강남·홍대·이태원 반경(detectArea) — 서울은 동네 단위가 의미 있어 먼저 본다
 *   2) 그 밖이면 가장 가까운 클럽의 area — 부산에 서 있으면 부산 클럽이 가장 가깝다.
 *      너무 멀면(NEAREST_MAX_KM) "클럽이 있는 도시가 아니다"로 보고 null.
 *
 * useAreaVerification과 다른 점: 서버에 아무것도 남기지 않고, **권한 팝업을
 * 절대 띄우지 않는다.** 홈을 열자마자 위치 권한을 물으면 대부분 거절하고,
 * iOS 는 한 번 거절하면 앱 설정에 들어가기 전엔 다시 못 묻는다 — LIVE 인증·
 * 지도처럼 "왜 위치가 필요한지"가 분명한 자리에서 이미 허용한 사람에게만
 * 조용히 적용한다.
 *
 * "마지막 위치"를 기억한다: 결과를 localStorage 에 7일 보관하고, 홈에 오면
 * 그 값을 즉시 쓴 뒤 30분이 지났을 때만 뒤에서 GPS 로 갱신한다. 부산에서 한 번
 * 잡힌 사람은 다음날 지하철에서 앱을 열어도(위치가 늦거나 실패해도) 부산 클럽
 * 부터 본다.
 */
const CACHE_KEY = "nf_last_area_v2";
/** 이 안이면 GPS 를 다시 켜지 않는다 */
const FRESH_MS = 30 * 60 * 1000;
/** 이보다 오래된 "마지막 위치"는 버린다 — 일주일 전 출장지가 붙어 있으면 이상하다 */
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
/** 가장 가까운 클럽이 이보다 멀면 클럽 도시 밖 */
const NEAREST_MAX_KM = 30;

type Cached = { area: string | null; at: number };

function readCache(): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cached;
    if (typeof c.at !== "number" || Date.now() - c.at > KEEP_MS) return null;
    return c;
  } catch {
    return null;
  }
}

function writeCache(area: string | null) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ area, at: Date.now() } satisfies Cached));
  } catch {
    /* 프라이빗 모드 등 — 캐시 없이도 동작한다 */
  }
}

/** 이미 허용된 상태인지만 본다. 묻지 않는다. */
async function hasGrantedPermission(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Geolocation } = await import("@capacitor/geolocation");
      const perm = await Geolocation.checkPermissions();
      return perm.location === "granted" || perm.coarseLocation === "granted";
    }
  } catch {
    /* 웹으로 폴백 */
  }
  if (typeof navigator === "undefined" || !("permissions" in navigator)) return false;
  try {
    const st = await navigator.permissions.query({ name: "geolocation" });
    return st.state === "granted";
  } catch {
    // Permissions API 가 geolocation 을 모르는 브라우저 — 팝업 위험이 있으니 안 건드린다
    return false;
  }
}

/** 좌표 → 클럽 area 라벨. 서울 3동네 반경 → 가장 가까운 클럽 순. */
async function resolveArea(lat: number, lng: number): Promise<string | null> {
  const seoul = detectArea(lat, lng);
  if (seoul) return ROOM_LABEL[seoul];
  const [nearest] = await fetchNearestClubsAnyArea(lat, lng, 1);
  if (!nearest || nearest.distance_km > NEAREST_MAX_KM) return null;
  return nearest.area || null;
}

/** 비프로덕션에서만 ?area=부산 / ?area=hongdae 로 강제 — GPS 없는 데스크톱에서 확인용 */
function readDevOverride(): string | null {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === "production") return null;
  const forced = new URLSearchParams(window.location.search).get("area");
  if (!forced) return null;
  if (forced === "gangnam" || forced === "hongdae" || forced === "itaewon") return ROOM_LABEL[forced];
  return forced;
}

export function useDetectedArea(): string | null {
  /* 첫 렌더는 항상 null 이어야 한다 — 서버는 캐시를 모르니 여기서 localStorage 를
     읽으면 hydration 이 어긋난다. 캐시는 effect 에서 읽는다. */
  const [area, setArea] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const forced = readDevOverride();
    if (forced) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setArea(forced);
      return;
    }

    // 마지막 위치를 먼저 쓴다 — GPS 가 늦거나 실패해도 그 동네부터 보여준다
    const cached = readCache();
    if (cached) {
      setArea(cached.area);
      if (Date.now() - cached.at < FRESH_MS) return;
    }

    (async () => {
      if (!(await hasGrantedPermission())) return;
      try {
        const { latitude, longitude } = await getCurrentCoords();
        const found = await resolveArea(latitude, longitude);
        if (cancelled) return;
        writeCache(found);
        setArea(found);
      } catch {
        /* 위치 실패는 개인화만 빠지는 것 — 마지막 위치가 있으면 그대로, 없으면 기본 순서 */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return area;
}
