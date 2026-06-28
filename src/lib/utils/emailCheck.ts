// 이메일 형식 검증 + 흔한 도메인 오타 "Did you mean?" 넛지.
// 소프트 검증의 입력단계 방어: gmial.com → gmail.com 같은 도메인 오타를 잡는다.
// (도메인/계정 없음은 Resend bounce 웹훅이, 도메인 오타는 여기서 잡는다.)

const POPULAR_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.jp",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "naver.com",
  "kakao.com",
  "qq.com",
  "163.com",
];

// 형식 검증: 흔한 케이스만 (RFC 완전 검증 X — 과하면 정상 주소 거부).
export function isValidEmailFormat(email: string): boolean {
  const e = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

// Levenshtein distance (도메인 비교용, 짧은 문자열이라 단순 DP)
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[n];
}

// 입력 도메인과 가장 가까운 인기 도메인을 찾아, 오타로 의심되면 교정 주소를 반환.
// 정확히 일치하거나(오타 아님) 너무 멀면 null.
export function suggestEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return null;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (!domain.includes(".")) return null;
  if (POPULAR_DOMAINS.includes(domain)) return null; // 정확히 일치 → 오타 아님

  let best: string | null = null;
  let bestDist = Infinity;
  for (const d of POPULAR_DOMAINS) {
    const dist = editDistance(domain, d);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  // 1~2글자 차이만 교정 제안 (그 이상은 다른 도메인일 수 있음)
  if (best && bestDist > 0 && bestDist <= 2) return `${local}@${best}`;
  return null;
}
