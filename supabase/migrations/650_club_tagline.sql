-- ============================================================================
-- Migration 650: 클럽 한 줄 소개(tagline)
--
-- 배경: 외국인 트랙에서 예약 가능한 클럽이 19곳으로 추려졌다. 목록이 짧아지니
--      이름만 나열하는 게 아까워졌다 — 손님은 "Gathering"과 "Dawn" 중 무엇이
--      자기한테 맞는지 판단할 근거가 하나도 없다.
--
--      기존 태그(genre:hiphop, smoking:allowed …)를 이어붙이는 방법도 있었지만
--      글맛이 기계적이고, 19곳 중 2곳은 태그가 아예 비어 빈칸이 된다.
--      19곳이면 사람이 직접 쓸 수 있는 분량이라 손으로 쓴 문장을 넣는다.
--
-- 언어별로 따로 받는다: 기계 번역하면 이 기능의 값어치(사람이 고른 표현)가
-- 사라진다. ko는 한국인 트랙에서도 쓸 수 있게 같이 둔다.
-- 비어 있으면 화면에서 그 줄을 통째로 접는다(빈칸을 보여주지 않는다).
-- ============================================================================

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS tagline_ko    TEXT CHECK (tagline_ko    IS NULL OR length(tagline_ko)    <= 80),
  ADD COLUMN IF NOT EXISTS tagline_en    TEXT CHECK (tagline_en    IS NULL OR length(tagline_en)    <= 120),
  ADD COLUMN IF NOT EXISTS tagline_ja    TEXT CHECK (tagline_ja    IS NULL OR length(tagline_ja)    <= 80),
  ADD COLUMN IF NOT EXISTS tagline_zh    TEXT CHECK (tagline_zh    IS NULL OR length(tagline_zh)    <= 60),
  ADD COLUMN IF NOT EXISTS tagline_zh_tw TEXT CHECK (tagline_zh_tw IS NULL OR length(tagline_zh_tw) <= 60);

COMMENT ON COLUMN clubs.tagline_ko IS '클럽 한 줄 소개(한국어). 카드에 이름 아래로 붙는다. 비면 그 줄을 숨긴다.';
COMMENT ON COLUMN clubs.tagline_en IS '클럽 한 줄 소개(영어). 라틴 문자는 같은 뜻이라도 길어져 상한을 늘려 잡았다.';
