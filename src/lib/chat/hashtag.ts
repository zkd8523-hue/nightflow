/**
 * 와글 해시태그 파싱·렌더링 헬퍼
 */

/** 본문에서 # 시작 단어 추출 (한글·영문·숫자 조합) */
export function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\p{L}\p{N}_]+/gu);
  if (!matches) return [];
  return matches.map((m) => m.slice(1)); // # 제거
}

/** 입력 중인 커서 위치 기준으로 현재 # 토큰 추출 (자동완성용)
 *  예: "오늘 #아레 갈래?" + cursor=7 → "아레"
 *  - 커서 직전에 # 가 있고, 공백 없는 단어가 연속될 때만 활성
 *  - 없으면 null
 */
export function getCurrentHashtagToken(
  text: string,
  cursor: number
): { token: string; start: number; end: number } | null {
  if (cursor <= 0) return null;
  // 커서 왼쪽으로 거슬러 올라가며 # 또는 공백/줄바꿈 찾기
  let i = cursor - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === "#") {
      // # 발견 — # 이후 ~ 커서까지가 token
      const token = text.slice(i + 1, cursor);
      // token 안에 공백 있으면 무효
      if (/\s/.test(token)) return null;
      return { token, start: i, end: cursor };
    }
    if (/\s/.test(ch)) return null;
    i--;
  }
  return null;
}

/** 본문을 해시태그 단위로 토큰화 (렌더링용)
 *  - knownClubNames에 들어있는 이름(띄어쓰기 포함 가능)을 longest-match-first로 먼저 매칭 → 'club' 토큰
 *  - 남는 #단어(공백 없는 영문/한글/숫자)는 'tag' 토큰 (자유 해시태그)
 *  - 그 외는 'text' 토큰
 *  반환: [{type:'text', value:'오늘 '}, {type:'club', name:'Club Ace', raw:'#Club Ace'}, ...]
 */
export type ChatToken =
  | { type: "text"; value: string }
  | { type: "tag"; value: string; raw: string }
  | { type: "club"; name: string; raw: string }
  | { type: "link"; href: string; raw: string };

/** 본문에서 URL 시작 위치 매칭 (http(s):// 또는 www.)
 *  - 뒤따르는 문장부호(.,!?)나 닫는 괄호는 URL에서 제외
 */
const URL_RE = /^(https?:\/\/|www\.)[^\s<>"']+/i;

/** URL 끝에 붙은 문장부호 잘라내기 — "링크는 https://a.com/b 입니다." 같은 케이스 */
function trimUrlTail(url: string): string {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    if (".,!?;:'\"".includes(ch)) {
      end--;
      continue;
    }
    // 짝이 맞지 않는 닫는 괄호만 제거
    if (ch === ")" || ch === "]" || ch === "}") {
      const open = ch === ")" ? "(" : ch === "]" ? "[" : "{";
      const slice = url.slice(0, end);
      const opens = slice.split(open).length - 1;
      const closes = slice.split(ch).length - 1;
      if (closes > opens) {
        end--;
        continue;
      }
    }
    break;
  }
  return url.slice(0, end);
}

export function tokenizeChatContent(
  text: string,
  knownClubNames: string[] = []
): ChatToken[] {
  const tokens: ChatToken[] = [];

  // longest-match-first 위해 클럽명 길이 내림차순 정렬
  const sortedClubs = [...knownClubNames].sort(
    (a, b) => b.length - a.length
  );

  let i = 0;
  let pendingText = "";

  function flushText() {
    if (pendingText.length > 0) {
      tokens.push({ type: "text", value: pendingText });
      pendingText = "";
    }
  }

  while (i < text.length) {
    // 0) URL 매칭 — # 보다 먼저 (URL 안의 #fragment 가 해시태그로 잘리는 것 방지)
    //    단어 중간(예: 이메일 a@www.x.com)에서는 시작하지 않도록 직전 문자 확인
    const prevCh = i > 0 ? text[i - 1] : " ";
    if (
      (text[i] === "h" || text[i] === "H" || text[i] === "w" || text[i] === "W") &&
      /[\s(\[{]/.test(prevCh)
    ) {
      const m = text.slice(i).match(URL_RE);
      if (m) {
        const raw = trimUrlTail(m[0]);
        if (raw.length > 0) {
          flushText();
          tokens.push({
            type: "link",
            href: /^www\./i.test(raw) ? `https://${raw}` : raw,
            raw,
          });
          i += raw.length;
          continue;
        }
      }
    }

    if (text[i] === "#") {
      // 1) 클럽명 매칭 (가장 긴 것부터)
      let matched: string | null = null;
      for (const name of sortedClubs) {
        const candidate = text.slice(i + 1, i + 1 + name.length);
        if (candidate === name) {
          matched = name;
          break;
        }
      }
      if (matched) {
        flushText();
        tokens.push({
          type: "club",
          name: matched,
          raw: `#${matched}`,
        });
        i += 1 + matched.length;
        continue;
      }

      // 2) 자유 해시태그 (공백 전까지)
      const m = text.slice(i).match(/^#([\p{L}\p{N}_]+)/u);
      if (m) {
        flushText();
        tokens.push({
          type: "tag",
          value: m[1],
          raw: m[0],
        });
        i += m[0].length;
        continue;
      }
    }
    pendingText += text[i];
    i++;
  }
  flushText();
  return tokens;
}

/** 본문에서 첫 번째 링크 URL 추출 (미리보기 카드용). 없으면 null. */
export function firstLinkInContent(text: string): string | null {
  for (const t of tokenizeChatContent(text)) {
    if (t.type === "link") return t.href;
  }
  return null;
}
