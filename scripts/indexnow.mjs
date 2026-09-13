// IndexNow — 새/변경 URL을 Bing(ChatGPT 검색·Copilot의 인덱스)·네이버·Yandex에 즉시 알린다.
// GSC URL 검사와 달리 일일 한도가 없고, 배포 직후 돌리면 새 페이지가 몇 시간 안에 잡힌다.
//
// 사용: node scripts/indexnow.mjs https://nightflow.kr/en/foo https://nightflow.kr/ja/foo
//       node scripts/indexnow.mjs --file urls.txt   (한 줄에 하나)
//
// 키는 public/<key>.txt 로 서빙되는 소유 증명(비밀 아님). 키를 바꾸면 public 파일도 같이 바꿔야 한다.
// 응답 200/202 = 접수. 4xx는 키 파일 미배포(키 파일이 실서버에 먼저 올라가 있어야 함)일 확률이 높다.

import fs from "node:fs";

const HOST = "nightflow.kr";
const KEY = "3ee9a42d4e7cbd31d47e70deffa42ccc";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

let urls = process.argv.slice(2);
const fileIdx = urls.indexOf("--file");
if (fileIdx >= 0) {
  const f = urls[fileIdx + 1];
  urls = fs.readFileSync(f, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}
urls = urls.filter((u) => u.startsWith(`https://${HOST}/`));
if (urls.length === 0) {
  console.error("URL이 없습니다. https://nightflow.kr/ 로 시작하는 절대 URL만 받습니다.");
  process.exit(1);
}
if (urls.length > 10000) { console.error("한 번에 10,000개까지"); process.exit(1); }

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: urls }),
});
console.log(`IndexNow ${res.status} ${res.statusText} — ${urls.length} URL`);
if (!res.ok && res.status !== 202) {
  console.log(await res.text());
  process.exit(1);
}
