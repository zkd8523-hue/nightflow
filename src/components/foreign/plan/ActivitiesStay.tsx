"use client";

// 활동 메인 상단 숙소 줄 — 아래 지역 칩(Seoul/Busan/Suwon/Gyeongju)을 누르면 그 지역에 맞춰 바뀐다.
// 칩 상태는 TourRegionFilter가 갖고 있어 window 이벤트로 알려 받는다(서버 컴포넌트인 허브 구조를 안 바꾸려고).
// 숙소를 큐레이션한 곳은 서울(홍대·이태원·강남)과 부산뿐 — Suwon은 서울에서 가는 투어라 서울, Gyeongju는 부산에서 가는 투어라 부산.
import { useEffect, useState } from "react";
import { AgodaStrip } from "@/components/affiliate/AgodaStrip";

export const TOUR_REGION_EVENT = "nf-tour-region";

const AREA_FOR: Record<string, string> = { All: "seoul", Seoul: "seoul", Suwon: "seoul", Busan: "busan", Gyeongju: "busan" };

export function ActivitiesStay() {
  const [region, setRegion] = useState("All");
  useEffect(() => {
    const on = (e: Event) => setRegion((e as CustomEvent<string>).detail ?? "All");
    window.addEventListener(TOUR_REGION_EVENT, on);
    return () => window.removeEventListener(TOUR_REGION_EVENT, on);
  }, []);
  return <AgodaStrip lang="en" placement="night_activities" area={AREA_FOR[region] ?? "seoul"} showFilters={false} />;
}
