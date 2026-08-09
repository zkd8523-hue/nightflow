// 410 Gone 응답 본문.
//
// 왜 미들웨어에서 HTML을 직접 만드나:
// Next.js App Router의 page.tsx에서는 임의 상태코드(410)를 낼 수 없다. notFound()는 404 고정이고,
// 스트리밍이 시작되면 상태코드 자체를 못 바꾼다(2026-08-09 소프트 404 장애와 같은 원리).
// 이 코드베이스는 이미 /md/<slug> 308 리다이렉트를 같은 이유로 미들웨어에서 처리하고 있다.
//
// 410은 "있었지만 영구히 사라짐" — 만료된 깃발처럼 되살아나지 않는 리소스에 맞는 신호다.
// 404(없음)보다 색인 제거가 확실하고, 307(임시 이동)처럼 "원래 주소는 살려둬"라는
// 모순된 신호를 남기지 않는다.

const ESCAPE: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPE[c]);

export function gonePageHtml(opts: {
  /** 페이지 제목 (예: "종료된 깃발") */
  title: string;
  /** 본문 안내 문구 */
  message: string;
  /** 홈 버튼 라벨 */
  homeLabel: string;
  /** 홈 경로 (한국어 "/" · 외국어 "/en" 등) */
  homeHref: string;
  lang?: string;
}): string {
  const { title, message, homeLabel, homeHref, lang = "ko" } = opts;
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${esc(title)} | 나플</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 24px; background: #0A0A0A; color: #FAFAFA;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  }
  .card { width: 100%; max-width: 420px; text-align: center; }
  .icon {
    width: 88px; height: 88px; margin: 0 auto 28px; border-radius: 999px;
    background: #1C1C1E; border: 1px solid #2C2C2E;
    display: flex; align-items: center; justify-content: center; font-size: 38px;
  }
  h1 { margin: 0 0 12px; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
  p { margin: 0 0 32px; font-size: 15px; line-height: 1.65; color: #A1A1AA; }
  .home {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; height: 56px; border-radius: 16px;
    background: #FAFAFA; color: #0A0A0A; font-size: 16px; font-weight: 800;
    text-decoration: none;
  }
  .home:active { opacity: .9; }
  .langs { margin-top: 20px; font-size: 12px; color: #71717A; }
  .langs a { color: #71717A; text-decoration: underline; margin: 0 6px; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">🏳️</div>
    <h1>${esc(title)}</h1>
    <p>${esc(message)}</p>
    <a class="home" href="${esc(homeHref)}">🏠 ${esc(homeLabel)}</a>
    <div class="langs">
      <a href="/en">English</a>·<a href="/ja">日本語</a>·<a href="/zh">中文</a>
    </div>
  </div>
</body>
</html>`;
}
