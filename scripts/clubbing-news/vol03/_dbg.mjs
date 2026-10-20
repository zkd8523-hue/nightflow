import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1280,height:900} });
await p.goto("http://localhost:3000/", { waitUntil:"domcontentloaded" });
await p.waitForTimeout(7000);
const r = await p.evaluate(() => {
  const rib = document.querySelector(".nf-rib");
  if (!rib) return { found:false };
  const cs = getComputedStyle(rib);
  const par = rib.parentElement;
  return {
    found: true,
    rib: rib.getBoundingClientRect().toJSON(),
    parentTag: par.tagName + "." + par.className.slice(0,60),
    parentPos: getComputedStyle(par).position,
    parentRect: par.getBoundingClientRect().toJSON(),
    ribPos: cs.position, top: cs.top, right: cs.right, zIndex: cs.zIndex,
    overflowParent: getComputedStyle(par).overflow,
  };
});
console.log(JSON.stringify(r,null,1));
await b.close(); process.exit(0);
