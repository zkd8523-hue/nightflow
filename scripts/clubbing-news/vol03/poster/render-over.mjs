import { chromium } from "playwright";
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
const d = dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1080,height:1350} });
await p.goto("file://" + resolve(d,"over.html"));
await p.waitForTimeout(3000);
for (const id of ["o1","o2","o3"]) {
  await (await p.$("#"+id)).screenshot({ path: resolve(d, `over_${id}.png`) });
  console.log("saved", id);
}
await b.close(); process.exit(0);
