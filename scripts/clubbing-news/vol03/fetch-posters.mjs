// 인스타 embed 페이지를 헤드리스로 띄워 포스터 이미지와 캡션을 긁는다.
// (로그인 없음 · 공개 게시물만 · 보호 계정 브라우저 프로필 사용 안 함)
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const d = dirname(fileURLToPath(import.meta.url));
mkdirSync(resolve(d,"img"), { recursive: true });

const POSTS = {
  evianchrist: "DeTn_smT9sL",   // 10.23 케이크샵
  botl:        "DerCOACCo-d",   // 10.24 루카
  vurt:        "DeYfphSD3y5",   // 10.24 vurt.
  rosso:       "DeqvtNSoAnh",   // 10.24 로쏘
  hertz:       "DeqQtcyKuA8",   // 10.23 헤르츠
  tamana:      "DeZDde1EoDh",   // 10.25 축제
};

const b = await chromium.launch();
const out = {};
for (const [name, id] of Object.entries(POSTS)) {
  const p = await b.newPage({ viewport: { width: 700, height: 900 }, deviceScaleFactor: 2 });
  try {
    await p.goto(`https://www.instagram.com/p/${id}/embed/captioned/`, { waitUntil: "networkidle", timeout: 45000 });
    await p.waitForTimeout(2500);
    const info = await p.evaluate(() => {
      const img = [...document.querySelectorAll("img")]
        .map(i => ({ src: i.currentSrc || i.src, w: i.naturalWidth, h: i.naturalHeight }))
        .filter(i => i.w > 240).sort((a, b) => b.w * b.h - a.w * a.h)[0];
      const cap = document.querySelector(".Caption")?.innerText || "";
      return { img, cap };
    });
    out[name] = { id, ...info };
    if (info.img?.src) {
      const buf = await (await p.request.get(info.img.src)).body();
      writeFileSync(resolve(d, `img/${name}.jpg`), buf);
      console.log(`${name}: ${info.img.w}x${info.img.h}  ${buf.length}B`);
    } else console.log(`${name}: 이미지 못 찾음`);
  } catch (e) { console.log(`${name}: ${e.message.split("\n")[0]}`); }
  await p.close();
}
writeFileSync(resolve(d, "captions.json"), JSON.stringify(out, null, 1));
await b.close();
