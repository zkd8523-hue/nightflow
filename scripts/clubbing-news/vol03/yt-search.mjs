// 유튜브 검색 결과 페이지에서 상위 영상을 뽑는다(API 키 불필요).
// ytInitialData 안의 videoRenderer 를 읽는다.
const QUERIES = process.argv.slice(2);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

for (const q of QUERIES) {
  const r = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%253D%253D`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
  });
  const html = await r.text();
  const m = html.match(/var ytInitialData = (\{.+?\});<\/script>/s);
  if (!m) { console.log(`\n### ${q}\n  (파싱 실패)`); continue; }
  const data = JSON.parse(m[1]);
  const out = [];
  const walk = (o) => {
    if (!o || typeof o !== "object" || out.length >= 6) return;
    if (o.videoRenderer) {
      const v = o.videoRenderer;
      out.push({
        id: v.videoId,
        title: v.title?.runs?.[0]?.text,
        ch: v.ownerText?.runs?.[0]?.text ?? v.longBylineText?.runs?.[0]?.text,
        len: v.lengthText?.simpleText,
        views: v.viewCountText?.simpleText,
        date: v.publishedTimeText?.simpleText,
      });
    }
    for (const k of Object.keys(o)) walk(o[k]);
  };
  walk(data);
  console.log(`\n### ${q}`);
  for (const v of out.slice(0, 5))
    console.log(`  ${v.id} | ${v.len ?? "-"} | ${v.views ?? "-"} | ${v.ch} | ${v.title}`);
}
