import { chromium } from "playwright";
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
const d = dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:880,height:1168} });
await p.goto("file://" + resolve(d,"layouts.html"));
await p.waitForTimeout(2500);
for (const id of ["s1","s2","s3"]) {
  await (await p.$("#"+id)).screenshot({ path: resolve(d, `poster_${id}.png`) });
  console.log("saved", id);
}
await b.close(); process.exit(0);
