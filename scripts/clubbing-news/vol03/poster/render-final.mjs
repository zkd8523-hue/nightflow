import { chromium } from "playwright";
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
const d = dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1200,height:1400} });
await p.goto("file://" + resolve(d,"final.html"));
await p.waitForTimeout(4000);
for (const [id,out] of [["ig","final_ig_4x5.png"],["home","final_home_16x9.png"],["art","final_article_3x2.png"]]) {
  await (await p.$("#"+id)).screenshot({ path: resolve(d, out) });
  console.log("saved", out);
}
await b.close(); process.exit(0);
