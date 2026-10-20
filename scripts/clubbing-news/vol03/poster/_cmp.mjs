import { chromium } from "playwright";
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
const d = dirname(fileURLToPath(import.meta.url));
const rows = [["검은고딕 (지금)","band_b1.png"],["1 · Pretendard Black","fontband_f1.png"],
               ["2 · Noto Sans KR 900","fontband_f2.png"],["3 · 나눔명조 EB","fontband_f3.png"]];
const html = `<style>body{margin:0;background:#2A2A2A;font-family:system-ui;padding:18px}
h3{color:#EEE;font-size:17px;margin:16px 0 7px;font-weight:700}
img{display:block;width:1080px}</style>` +
 rows.map(([t,f],i)=>`<h3>${t}</h3><img src="${f}" ${i===0?'style="object-fit:none;object-position:0 -1050px;height:300px"':''}>`).join("");
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1130,height:1500} });
await p.goto("file://"+resolve(d,"fonts.html"));
await p.setContent(html.replace(/src="/g, `src="file://${d}/`));
await p.waitForTimeout(1200);
await p.screenshot({ path: resolve(d,"_fontcmp.png"), fullPage:true });
await b.close(); process.exit(0);
