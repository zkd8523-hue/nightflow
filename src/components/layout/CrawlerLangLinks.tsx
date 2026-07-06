// 크롤러(Googlebot)용 언어 링크 세트.
// LangSwitcher는 드롭다운 open 상태에서만 실제 <a>를 렌더링해 크롤러가 못 봄.
// 이 컴포넌트는 sr-only이지만 항상 DOM에 존재해 언어별 페이지가 서로 발견되도록 한다.
// 각 언어 트리(/en, /ja, /zh, /zh-tw) layout에 포함시켜 내부 링크 그래프를 형성.
export function CrawlerLangLinks() {
  return (
    <nav aria-label="Language versions" className="sr-only">
      <a href="/" hrefLang="ko-KR">한국어</a>
      <a href="/en" hrefLang="en-US">English</a>
      <a href="/ja" hrefLang="ja-JP">日本語</a>
      <a href="/zh" hrefLang="zh-CN">简体中文</a>
      <a href="/zh-tw" hrefLang="zh-TW">繁體中文</a>
    </nav>
  );
}
