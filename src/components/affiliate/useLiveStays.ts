"use client";

// 아고다 숙소의 사진·그날 가격·평점(서버 프록시 /api/agoda/stays). AgodaStrip·KoStaySlot 공용.
// 키가 없거나 실패하면 빈 Map — 카드는 정적 사진·평점과 "가격 보기"로 그대로 동작한다.

import { useEffect, useState } from "react";
import type { StayQuery } from "@/lib/affiliate/agoda";

export interface LiveStay {
  hid: number; name: string; image: string | null; price: number | null;
  rating: number | null; reviews: number | null; landingUrl: string | null;
  stars?: number | null;
}

export function useLiveStays(area: string, stay: StayQuery, enabled = true): Map<number, LiveStay> {
  const [live, setLive] = useState<Map<number, LiveStay>>(new Map());
  const checkInKey = stay.checkIn ?? "";
  useEffect(() => {
    if (!enabled) return;
    let off = false;
    const qs = new URLSearchParams({ area });
    if (stay.checkIn) qs.set("checkIn", stay.checkIn);
    if (stay.nights) qs.set("nights", String(stay.nights));
    if (stay.adults) qs.set("adults", String(stay.adults));
    fetch(`/api/agoda/stays?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { hotels?: LiveStay[] } | null) => {
        if (off || !j?.hotels?.length) return;
        setLive(new Map(j.hotels.map((x) => [x.hid, x])));
      })
      .catch(() => {});
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, checkInKey, stay.nights, stay.adults, enabled]);
  return live;
}

/** 큐레이션 없는 도시(대구·인천 등) — 서버가 도시 검색으로 고른 숙소 목록(가격·사진 포함) */
export function useCityStays(cityKey: string, stay: StayQuery, enabled = true): LiveStay[] {
  const [list, setList] = useState<LiveStay[]>([]);
  const checkInKey = stay.checkIn ?? "";
  useEffect(() => {
    if (!enabled || !cityKey) return;
    let off = false;
    const qs = new URLSearchParams({ city: cityKey });
    if (stay.checkIn) qs.set("checkIn", stay.checkIn);
    if (stay.nights) qs.set("nights", String(stay.nights));
    if (stay.adults) qs.set("adults", String(stay.adults));
    fetch(`/api/agoda/stays?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { hotels?: LiveStay[] } | null) => {
        if (!off) setList(j?.hotels ?? []);
      })
      .catch(() => {});
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityKey, checkInKey, stay.nights, stay.adults, enabled]);
  return list;
}
