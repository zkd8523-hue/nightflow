#!/usr/bin/env node
// build-cards-html.mjs가 만든 cards.html의 .card 섹션들을 하나씩 1080x1350 PNG로 찍는다.
//
// 실행: node scripts/cardnews/render-cards.mjs cards.html out/2026-09-02
//   -> out/2026-09-02/card_00_cover.png, card_01_클럽명.png, ...

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , htmlPath, outDir] = process.argv;
if (!htmlPath || !outDir) {
  console.error("사용법: node render-cards.mjs <cards.html> <출력디렉토리>");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const html = readFileSync(htmlPath, "utf-8");
const tmpHtmlPath = resolve(outDir, "_render.html");
writeFileSync(tmpHtmlPath, html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
await page.goto("file://" + tmpHtmlPath);

const cards = await page.$$(".card");
let i = 0;
for (const card of cards) {
  const label = i === 0 ? "cover" : (await card.$eval(".club-name", (el) => el.textContent).catch(() => `card${i}`));
  const safeLabel = String(label).replace(/[^\w가-힣()]/g, "_").slice(0, 30);
  const filename = `card_${String(i).padStart(2, "0")}_${safeLabel}.png`;
  await card.screenshot({ path: resolve(outDir, filename) });
  console.log("saved:", filename);
  i++;
}

await browser.close();
