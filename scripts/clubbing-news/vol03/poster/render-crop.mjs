import { chromium } from "playwright";
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
const d = dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1260,height:720}, deviceScaleFactor:2 });
await p.goto("file://" + resolve(d,"crop.html"));
await p.waitForTimeout(1800);
await (await p.$("#c")).screenshot({ path: resolve(d,"wide_tight.png") });
await b.close(); console.log("saved"); process.exit(0);
