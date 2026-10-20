import { chromium } from "playwright";
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
const d = dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1080,height:1350} });
await p.goto("file://" + resolve(d,"fonts.html"));
await p.waitForTimeout(4000);
for (const id of ["f1","f2","f3"]) {
  const el = await p.$("#"+id);
  await el.screenshot({ path: resolve(d, `font_${id}.png`) });
  // 띠만 잘라 비교용으로 따로 저장
  const box = await (await p.$("#"+id+" .band")).boundingBox();
  await p.screenshot({ path: resolve(d, `fontband_${id}.png`), clip: box });
  console.log("saved", id);
}
await b.close(); process.exit(0);
