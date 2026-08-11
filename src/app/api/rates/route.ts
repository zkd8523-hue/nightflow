import { NextResponse } from "next/server";
import { getKrwRates } from "@/lib/utils/currency";

// 클라이언트 컴포넌트(PuzzleForm·ForeignRequestForm)가 환율을 받아가는 통로.
// 이 폼들은 여러 페이지에서 쓰여 서버에서 prop으로 내리면 배관이 지저분해진다.
// 실제 외부 호출은 getKrwRates()의 Next fetch 캐시(15일)가 흡수하므로 API 부하는 없다.
export const revalidate = 1296000; // 15일 (Next는 리터럴만 인식 — 계산식 불가)

export async function GET() {
  const snapshot = await getKrwRates();
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=1296000" },
  });
}
