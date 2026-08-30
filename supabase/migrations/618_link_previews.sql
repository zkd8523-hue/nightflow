-- Migration 618: 채팅 링크 OG 미리보기 캐시
-- - 와글/파티챗/DM 본문의 URL을 카톡처럼 제목·설명·썸네일 카드로 표시
-- - URL 단위 공용 캐시 (같은 오픈채팅 링크가 반복 공유되므로 메시지별 저장은 낭비)
-- - 조회는 누구나(익명 포함), 쓰기는 서버(service role)만 — SSRF 방어를 서버 라우트에 집중

CREATE TABLE IF NOT EXISTS link_previews (
  -- 정규화된 URL의 sha256 — 원본 URL이 길어도 PK 길이 고정
  url_hash TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  image_url TEXT,
  site_name TEXT,
  -- 가져오기 실패(404·타임아웃·비HTML 등) 기록 → 실패한 URL 재시도 폭주 방지
  fetch_failed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 오래된 캐시 정리/갱신 대상 조회용
CREATE INDEX IF NOT EXISTS idx_link_previews_updated
  ON link_previews (updated_at);

ALTER TABLE link_previews ENABLE ROW LEVEL SECURITY;

-- 채팅은 비로그인도 열람 가능하므로 익명 읽기 허용
DROP POLICY IF EXISTS "Anyone can read link previews" ON link_previews;
CREATE POLICY "Anyone can read link previews" ON link_previews
  FOR SELECT USING (true);

-- INSERT/UPDATE 정책 없음 = service role만 기록 (RLS 우회)

COMMENT ON TABLE link_previews IS
  '채팅 본문 URL의 OG 메타 캐시. /api/link-preview 가 서버에서 채우고 클라이언트는 읽기만 한다.';
COMMENT ON COLUMN link_previews.url_hash IS
  '정규화된 URL의 sha256 hex. 클라이언트도 같은 방식으로 계산해 조회한다.';
COMMENT ON COLUMN link_previews.fetch_failed IS
  'true면 미리보기 카드 없이 링크 텍스트만 표시. 재시도는 updated_at 기준으로 제한.';
