import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:390,height:900} });
await p.goto("http://localhost:3000/weekly/2026-10-15", { waitUntil:"networkidle" });
await p.waitForTimeout(2500);
const tr = p.getByRole("button", { name: "하우스" });
const tk = p.getByRole("button", { name: "일렉트로" });
await tr.scrollIntoViewIfNeeded();
const st = async (l) => `house=${await tr.getAttribute("aria-pressed")} electro=${await tk.getAttribute("aria-pressed")}  ${l}`;
console.log(await st("초기"));
await tr.click(); await p.waitForTimeout(600); console.log(await st("하우스 켬"));
await tr.click(); await p.waitForTimeout(600); console.log(await st("하우스 끔  ← 여기가 문제였음"));
await tr.click(); await p.waitForTimeout(400);
await tk.click(); await p.waitForTimeout(600); console.log(await st("하우스→일렉트로 전환"));
// 연타
for (let i=0;i<6;i++){ await tk.click(); await p.waitForTimeout(120); }
await p.waitForTimeout(700); console.log(await st("일렉트로 6연타 후"));
await b.close();
