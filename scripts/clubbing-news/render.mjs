// 클러빙 뉴스 아티팩트 카드 9장을 1080x1350 PNG로 찍는다.
// 아티팩트 CSS를 그대로 쓰되, 카드를 고정 폭으로 그린 뒤 scale로 키운다
// (aspect-ratio 반응형이라 1080 폭으로 바로 찍으면 비율이 깨진다).
import { chromium } from "playwright";
import { mkdirSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] || resolve(__dirname, "out");

mkdirSync(outDir, { recursive: true });
if (existsSync(outDir)) {
  for (const f of readdirSync(outDir)) if (f.endsWith(".png")) unlinkSync(resolve(outDir, f));
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
await page.goto("file://" + resolve(__dirname, "cards.html"));
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1500); // 웹폰트

const shots = await page.$$(".nf-frame");
let i = 1;
for (const s of shots) {
  const name = `card_${String(i).padStart(2, "0")}.png`;
  await s.screenshot({ path: resolve(outDir, name) });
  console.log("saved:", name);
  i++;
}
await browser.close();
