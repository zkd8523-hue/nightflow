"use client";

import { useEffect, useState } from "react";
import { FALLBACK_SNAPSHOT, type RateSnapshot } from "@/lib/utils/currency";

// 모듈 스코프 캐시 — 한 세션에서 /api/rates를 한 번만 호출한다.
let cached: RateSnapshot | null = null;
let inflight: Promise<RateSnapshot> | null = null;

async function load(): Promise<RateSnapshot> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = fetch("/api/rates")
    .then((r) => (r.ok ? r.json() : FALLBACK_SNAPSHOT))
    .then((j: RateSnapshot) => {
      cached = j?.rates ? j : FALLBACK_SNAPSHOT;
      return cached;
    })
    .catch(() => FALLBACK_SNAPSHOT)
    .finally(() => { inflight = null; });
  return inflight;
}

/**
 * 환율 스냅샷. 최초엔 폴백값을 즉시 돌려주고(깜빡임·로딩상태 없음),
 * 실제 환율이 도착하면 갱신된다. 실패해도 폴백으로 계속 동작.
 */
export function useKrwRates(): RateSnapshot {
  const [snap, setSnap] = useState<RateSnapshot>(cached ?? FALLBACK_SNAPSHOT);
  useEffect(() => {
    let alive = true;
    load().then((s) => { if (alive) setSnap(s); });
    return () => { alive = false; };
  }, []);
  return snap;
}
