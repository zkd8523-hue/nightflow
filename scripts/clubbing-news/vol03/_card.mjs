import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1000,height:760}, deviceScaleFactor:2, colorScheme:"dark" });
await p.goto("http://localhost:3000/weekly", { waitUntil:"domcontentloaded" });
await p.waitForTimeout(6000);
await p.screenshot({ path:"/private/tmp/claude-501/-Users-gimmingi-project-1/fbf8f7d0-c74a-43b7-b286-a2321d930cbe/scratchpad/card.png" });
await b.close(); process.exit(0);
