// 1호 CSS(_style.html) + 3호 본문(_body.html) → cards.html
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const d = dirname(fileURLToPath(import.meta.url));
const head = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gothic+A1:wght@400;700;800;900&family=IBM+Plex+Mono:wght@400;600;700&display=swap">
`;
writeFileSync(
  resolve(d, "cards.html"),
  head + readFileSync(resolve(d, "_style.html"), "utf8") + "</head><body>\n" +
    readFileSync(resolve(d, "_body.html"), "utf8") + "\n</body></html>"
);
console.log("cards.html 생성");
