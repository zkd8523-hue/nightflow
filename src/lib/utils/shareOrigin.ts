// 공유 링크에 쓸 origin.
//
// window.location.origin을 그대로 쓰면 로컬 개발(localhost:3000)에서 공유한 링크가
// "http://localhost:3000/flags/..." 로 나간다. 그러면:
//   - 카카오 스크래퍼가 og:image를 못 긁어 카드 썸네일이 회색 placeholder로 뜬다
//   - 링크를 받은 사람 폰에서는 자기 폰의 localhost를 찾아가 열리지 않는다
//   - 보낸 본인 PC에서만 열리는데, 그마저 앱/홈으로 떨어져 "공유가 홈으로 간다"로 보인다
// → 로컬·프리뷰에서는 항상 프로덕션 도메인으로 공유 링크를 만든다.
//   (프로덕션에서는 지금까지처럼 실제 origin 사용 — 도메인이 바뀌어도 따라간다)
const PRODUCTION_ORIGIN = "https://nightflow.kr";

export function getShareOrigin(): string {
  if (typeof window === "undefined") return PRODUCTION_ORIGIN;
  const { origin, hostname } = window.location;
  // localhost / 사설 IP(폰 실기기 테스트) / vercel 프리뷰 → 외부에서 못 여는 주소
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local") ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    hostname.endsWith(".vercel.app");
  return isLocal ? PRODUCTION_ORIGIN : origin;
}
