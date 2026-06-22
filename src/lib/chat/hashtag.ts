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
  | { type: "club"; name: string; raw: string };

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
