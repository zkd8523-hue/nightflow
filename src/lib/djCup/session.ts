const SESSION_KEY = "nf_djcup_session";

// crypto.randomUUID는 iOS 15 Safari 미지원 — userEvents.ts의 uuidv4()와 동일한 폴백.
// (모듈 간 사설 함수를 공유하지 않고 여기 자체로 두는 이유: djCup은 user_events와
// 독립된 레이트리밋 단위라 굳이 그쪽 anon_id를 재사용하면 안 된다 — 사람 단위가 아니라
// "이 게임 세션" 단위가 맞다.)
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

/** 이 브라우저의 DJ컵 세션 UUID. submit_dj_cup_result()의 레이트리밋 단위.
 *  시크릿 모드/재설치마다 새로 생기는 걸 받아들인다 — 정상 유저를 오탐하지
 *  않는 게 캐주얼 어뷰징을 100% 막는 것보다 우선이다. */
export function getOrCreateDjCupSession(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = uuidv4();
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // 시크릿 모드 등 localStorage 접근 실패 — 세션 유지 없이 매번 새 UUID
    return uuidv4();
  }
}
