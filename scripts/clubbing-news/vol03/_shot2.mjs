import { chromium } from "playwright";
const S="/private/tmp/claude-501/-Users-gimmingi-project-1/fbf8f7d0-c74a-43b7-b286-a2321d930cbe/scratchpad";
const b = await chromium.launch();
// 아티클 첫 화면
const p = await b.newPage({ viewport:{width:390,height:1000}, deviceScaleFactor:2, colorScheme:"dark" });
await p.goto("http://localhost:3000/weekly/2026-10-22", { waitUntil:"domcontentloaded" });
await p.waitForTimeout(6000);
await p.screenshot({ path:`${S}/art_top.png` });
// 홈 카드 — /weekly 목록에도 같은 표지가 쓰이므로 그걸로 확인
const q = await b.newPage({ viewport:{width:390,height:900}, deviceScaleFactor:2, colorScheme:"dark" });
await q.goto("http://localhost:3000/weekly", { waitUntil:"domcontentloaded" });
await q.waitForTimeout(5000);
await q.screenshot({ path:`${S}/weekly_list.png` });
await b.close(); process.exit(0);
