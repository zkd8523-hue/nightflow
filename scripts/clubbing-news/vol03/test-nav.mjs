import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
await p.goto("http://localhost:3000/weekly/2026-10-22", { waitUntil:"networkidle" });
await p.waitForTimeout(2500);
const S="/private/tmp/claude-501/-Users-gimmingi-project-1/fbf8f7d0-c74a-43b7-b286-a2321d930cbe/scratchpad";
await p.screenshot({ path:`${S}/nav_a.png` });           // 제자리
await p.getByRole("button", { name: /^토/ }).click();
await p.waitForTimeout(1500);
await p.screenshot({ path:`${S}/nav_b.png` });           // 붙은 상태
await p.getByRole("button", { name: /^일/ }).click();
await p.waitForTimeout(1500);
await p.screenshot({ path:`${S}/nav_c.png` });
await b.close(); console.log("shots");
