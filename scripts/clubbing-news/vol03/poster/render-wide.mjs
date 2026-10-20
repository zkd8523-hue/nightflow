import { chromium } from "playwright";
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
const d = dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1080,height:608}, deviceScaleFactor:2 });
await p.goto("file://" + resolve(d,"wide.html"));
await p.waitForTimeout(3500);
await (await p.$("#w")).screenshot({ path: resolve(d,"cover_16x9.png") });
await b.close(); console.log("saved"); process.exit(0);
