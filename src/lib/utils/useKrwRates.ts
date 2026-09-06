"use client";

import { useEffect, useState } from "react";
import { FALLBACK_SNAPSHOT, CURRENCY_ORDER, type KrwRates, type RateSnapshot } from "@/lib/utils/currency";

/**
 * 빠진 통화를 폴백으로 메운다. 통화를 늘렸을 때 아직 구 통화만 담긴 응답이
 * 오면(캐시된 /api/rates, 아직 안 돈 cron) 새 통화가 undefined가 되고
 * 화면에 "HK$NaN"이 그대로 찍힌다 — 실제로 그렇게 나갔다.
 */
function withFallback(raw: Partial<KrwRates> | undefined): KrwRates | null {
  if (!raw || typeof raw.USD !== "number") return null;
  const merged = { ...FALLBACK_SNAPSHOT.rates } as KrwRates;
  for (const c of CURRENCY_ORDER) {
    const v = raw[c];
    if (typeof v === "number" && Number.isFinite(v)) merged[c] = v;
  }
  return merged;
}

// 모듈 스코프 캐시 — 한 세션에서 /api/rates를 한 번만 호출한다.
let cached: RateSnapshot | null = null;
let inflight: Promise<RateSnapshot> | null = null;

async function load(): Promise<RateSnapshot> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = fetch("/api/rates")
    .then((r) => (r.ok ? r.json() : FALLBACK_SNAPSHOT))
    .then((j: RateSnapshot) => {
      const rates = withFallback(j?.rates);
      cached = rates ? { ...j, rates } : FALLBACK_SNAPSHOT;
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
