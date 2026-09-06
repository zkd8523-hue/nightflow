import { NextResponse } from "next/server";
import { getKrwRates } from "@/lib/utils/currency";

// 클라이언트 컴포넌트(PuzzleForm·ForeignRequestForm)가 환율을 받아가는 통로.
// 이 폼들은 여러 페이지에서 쓰여 서버에서 prop으로 내리면 배관이 지저분해진다.
//
// 캐시 1시간: 예전엔 15일이었는데, 그건 이 라우트가 외부 API를 직접 치던 시절
// 그 호출을 흡수하려던 값이다. 지금은 fx_rate_snapshots(DB)만 읽으므로 부하가
// 거의 없고, 15일을 유지하면 cron이 새 환율을 넣어도 최대 15일간 옛 응답이 나간다.
// 실제로 통화를 4→8개로 늘렸을 때 캐시된 4개짜리 응답이 나가 화면에 "HK$NaN"이
// 찍혔다(2026-09-07). cron이 주 1회이므로 1시간이면 충분히 촘촘하다.
export const revalidate = 3600;

export async function GET() {
  const snapshot = await getKrwRates();
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
