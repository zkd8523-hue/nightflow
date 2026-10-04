// 영어 블로그 md → src/content/en-blog/posts.generated.ts 로 묶는다.
// 블로그 페이지는 요청 때 그려져서(Vercel 서버) md 파일을 직접 읽으면 배포본에 파일이 없을 수 있다.
// 글을 추가·수정하면: node scripts/en-blog-pack.mjs
import fs from "node:fs";
import path from "node:path";
const dir = path.join(process.cwd(), "src/content/en-blog");
const raw = {};
for (const f of fs.readdirSync(dir).sort()) {
  if (!f.endsWith(".md") || f.startsWith("_")) continue;
  raw[f.slice(0, -3)] = fs.readFileSync(path.join(dir, f), "utf8");
}
// 사진(Unsplash) 배치 — _images.json { slug: { hero, inline: [{ after: "## 제목", ... }] } }
const imgPath = path.join(dir, "_images.json");
const images = fs.existsSync(imgPath) ? JSON.parse(fs.readFileSync(imgPath, "utf8")) : {};
const out = `// 자동 생성 — 직접 고치지 말고 md·_images.json을 고친 뒤 node scripts/en-blog-pack.mjs\nimport type { EnBlogImages } from "@/lib/enBlog";\nexport const EN_BLOG_RAW: Record<string, string> = ${JSON.stringify(raw, null, 1)};\nexport const EN_BLOG_IMAGES: Record<string, EnBlogImages> = ${JSON.stringify(images, null, 1)};\n`;
fs.writeFileSync(path.join(dir, "posts.generated.ts"), out);
console.log(`en-blog: ${Object.keys(raw).length}편 묶음`);
