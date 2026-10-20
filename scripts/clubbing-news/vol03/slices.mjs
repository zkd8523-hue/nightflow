import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:390,height:1200}, deviceScaleFactor:2, colorScheme:"dark" });
await p.goto("http://localhost:3000/weekly/2026-10-22", { waitUntil:"domcontentloaded" });
await p.waitForTimeout(5000);
const H = await p.evaluate(()=>document.body.scrollHeight);
const N = Number(process.argv[2] || 6);
const step = Math.ceil(H / N);
for (let i=0;i<N;i++){
  await p.evaluate(y=>window.scrollTo(0,y), i*step);
  await p.waitForTimeout(700);
  await p.screenshot({ path:`/private/tmp/claude-501/-Users-gimmingi-project-1/fbf8f7d0-c74a-43b7-b286-a2321d930cbe/scratchpad/v3_${i+1}.png` });
}
console.log("slices", N, "H", H);
await b.close();
