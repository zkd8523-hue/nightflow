import { createClient } from "@/lib/supabase/client";

/**
 * 온보딩 안내 시트의 "다시 보지 않기" 처리.
 *
 * 기록은 계정 단위(users.<flag>, Migration 523)가 원본이지만, 그 UPDATE 가 실패하면
 * "닫았는데 계속 뜬다"로만 드러나고 원인은 아무 데도 안 남는다. PostgREST 의 UPDATE 는
 * RLS 로 0행이 걸러져도 error 가 null 이라 특히 조용하다.
 *
 * 그래서 두 가지를 같이 한다.
 *  1) 기기 단위(localStorage) 표시를 먼저 남긴다 → 서버 기록이 실패해도 그 기기에선 안 뜬다.
 *  2) UPDATE 에 select 를 붙여 실제 반영 행 수를 확인하고, 0행이면 로그를 남긴다.
 */

export type GuideFlag =
  | "offer_credit_guide_seen"
  | "share_join_guide_seen";

const localKey = (flag: GuideFlag, userId: string) => `nf_guide:${flag}:${userId}`;

/** 이 기기에서 이미 닫은 안내인지 */
export function isGuideDismissedLocally(flag: GuideFlag, userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(localKey(flag, userId)) === "1";
  } catch {
    // 사파리 프라이빗 모드 등 localStorage 접근 불가 — 계정 플래그만으로 동작
    return false;
  }
}

/** 안내를 봤다고 기록. 서버 기록 성공 여부를 boolean 으로 돌려준다. */
export async function markGuideSeen(flag: GuideFlag, userId: string): Promise<boolean> {
  try {
    window.localStorage.setItem(localKey(flag, userId), "1");
  } catch {
    // 저장 실패해도 아래 서버 기록은 그대로 진행
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("users")
    .update({ [flag]: true })
    .eq("id", userId)
    .select("id");

  if (error) {
    console.error(`[guideFlag] ${flag} 기록 실패:`, error.message, error.code);
    return false;
  }
  if (!data || data.length === 0) {
    // 에러 없이 0행 = RLS 로 걸러졌거나 id 가 안 맞음. 세션이 클라이언트에 안 실렸을 때 나온다.
    console.error(`[guideFlag] ${flag} 기록이 0행 반영됨 (RLS 차단 또는 세션 불일치). userId=${userId}`);
    return false;
  }
  return true;
}
