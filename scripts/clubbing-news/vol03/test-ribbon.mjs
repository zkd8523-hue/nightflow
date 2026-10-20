import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2, colorScheme:"dark" });
await p.goto("http://localhost:3000/", { waitUntil:"domcontentloaded" });
await p.waitForTimeout(5000);
const el = await p.$(".nf-rib");
console.log("NEW 리본:", el ? "있음" : "없음");
if (el) {
  const card = await p.$("a[href='/weekly/2026-10-22']");
  await (card ?? el).scrollIntoViewIfNeeded();
  await p.waitForTimeout(900);
  await p.screenshot({ path:"/private/tmp/claude-501/-Users-gimmingi-project-1/fbf8f7d0-c74a-43b7-b286-a2321d930cbe/scratchpad/ribbon.png" });
}
await b.close();
