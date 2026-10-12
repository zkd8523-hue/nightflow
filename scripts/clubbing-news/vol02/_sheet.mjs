import { chromium } from "playwright";
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
const d = dirname(fileURLToPath(import.meta.url));
const n = Number(process.argv[2] || 10), from = Number(process.argv[3] || 1);
const imgs = Array.from({length:n},(_,i)=>`out/card_${String(i+from).padStart(2,"0")}.png`)
  .map(s=>`<img src="${s}">`).join("");
const html = `<style>body{margin:0;background:#222;display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
img{width:100%;display:block}</style>${imgs}`;
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1700,height:1100}});
await p.goto("file://"+resolve(d,"cards.html")); // base for relative paths
await p.setContent(html.replace(/src="out\//g, `src="file://${resolve(d,"out")}/`));
await p.waitForTimeout(800);
await p.screenshot({path:resolve(d,"_sheet.png"), fullPage:true});
await b.close(); console.log("sheet");
