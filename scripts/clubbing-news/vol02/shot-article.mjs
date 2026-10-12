// 카드 9장째에 넣을 아티클 화면 스샷. 라이브 페이지를 폰 폭으로 찍는다.
import { chromium } from "playwright";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 330 },
  deviceScaleFactor: 3,
  colorScheme: "dark",
});
await page.goto("https://nightflow.kr/weekly/2026-10-15", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.screenshot({ path: resolve(__dirname, "img/article-shot.png") });
console.log("saved article-shot.png");
await browser.close();
