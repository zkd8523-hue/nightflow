import { EN_BLOG_RAW } from "@/content/en-blog/posts.generated";

// 영어 블로그(/en/blog) 글 저장소 — src/content/en-blog/<slug>.md (배포용으로 posts.generated.ts에 묶음: node scripts/en-blog-pack.mjs)
// 머리말(--- key: value ---) + 본문 마크다운. 외부 라이브러리 없이 필요한 문법만 직접 변환한다
// (## / ### 제목, 문단, - 목록, 1. 목록, | 표 |, **굵게**, [링크](주소), > 인용).
// 글은 우리가 쓴 것만 들어가므로 HTML은 이스케이프 후 허용된 태그만 만든다.

export type EnBlogPost = {
  slug: string;
  title: string; // <title> 전체(absolute)
  h1: string;
  description: string;
  date: string; // YYYY-MM-DD
  updated: string;
  cta: string; // 예약 버튼 위 한 줄
  area: string; // Seoul / Busan …
  kind: string; // Where to stay / Club guide / Tips
  checked: string; // 사실을 마지막으로 확인한 날
  minutes: number; // 읽는 시간(분)
  hasAffiliate: boolean;
  related: { href: string; label: string }[];
  html: string;
  toc: { id: string; text: string }[];
};

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inline(s: string) {
  let t = esc(s);
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
    const ext = /^https?:\/\//.test(href);
    // 나플 내부 링크는 같은 창, 외부 출처는 새 창 + nofollow
    return ext
      ? `<a href="${href}" target="_blank" rel="nofollow noopener">${label}</a>`
      : `<a href="${href}" data-nf-track="blog_link">${label}</a>`;
  });
  return t;
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function mdToHtml(md: string) {
  const lines = md.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  const toc: { id: string; text: string }[] = [];
  let i = 0;
  let tables = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const h = l.match(/^(#{2,3})\s+(.*)$/);
    if (h) {
      const id = slugify(h[2]);
      if (h[1] === "##") toc.push({ id, text: h[2] });
      out.push(`<h${h[1].length} id="${id}">${inline(h[2])}</h${h[1].length}>`);
      i++; continue;
    }
    if (l.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        `<div class="nf-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`,
      );
      // 첫 비교표 바로 뒤 = 결정 지점 → 페이지가 여기에 예약 버튼을 하나 더 넣는다
      if (++tables === 1) out.push("<!--NF_MID_CTA-->");
      continue;
    }
    if (/^- /.test(l) || /^\d+\. /.test(l)) {
      const ordered = /^\d+\. /.test(l);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\d+\. /.test(lines[i]) : /^- /.test(lines[i]))) {
        items.push(`<li>${inline(lines[i].replace(/^(- |\d+\. )/, ""))}</li>`);
        i++;
      }
      out.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }
    if (l.startsWith("> ")) {
      const q: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) { q.push(inline(lines[i].slice(2))); i++; }
      out.push(`<blockquote>${q.join("<br/>")}</blockquote>`);
      continue;
    }
    const p: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,3}\s|\||- |\d+\. |> )/.test(lines[i])) { p.push(inline(lines[i])); i++; }
    out.push(`<p>${p.join(" ")}</p>`);
  }
  return { html: out.join("\n"), toc };
}

function parse(slug: string, raw: string): EnBlogPost {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`en-blog/${slug}.md: 머리말 없음`);
  const meta: Record<string, string> = {};
  const related: { href: string; label: string }[] = [];
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    if (kv[1] === "related") {
      // related: /en/clubs/hongdae | Hongdae Clubs — Full guide
      const [href, label] = kv[2].split("|").map((s) => s.trim());
      related.push({ href, label });
    } else meta[kv[1]] = kv[2].trim();
  }
  const { html, toc } = mdToHtml(m[2]);
  return {
    slug,
    title: meta.title,
    h1: meta.h1 || meta.title,
    description: meta.description,
    date: meta.date,
    updated: meta.updated || meta.date,
    cta: meta.cta || "Want guaranteed entry or a table? Book with NightFlow — we contact the clubs for you, in English.",
    area: meta.area || "Seoul",
    kind: meta.kind || "Guide",
    checked: meta.checked || meta.updated || meta.date,
    minutes: Math.max(1, Math.round(m[2].split(/\s+/).length / 230)),
    hasAffiliate: /viator\.com|agoda\.com|booking\.com/.test(m[2]),
    related,
    html,
    toc,
  };
}

export function listEnBlogSlugs(): string[] {
  return Object.keys(EN_BLOG_RAW).sort();
}

export function getEnBlogPost(slug: string): EnBlogPost | null {
  const raw = EN_BLOG_RAW[slug];
  return raw ? parse(slug, raw) : null;
}

export function listEnBlogPosts(): EnBlogPost[] {
  return listEnBlogSlugs()
    .map((s) => getEnBlogPost(s)!)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
