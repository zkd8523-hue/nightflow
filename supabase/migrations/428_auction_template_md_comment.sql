-- 428: 조각 템플릿에 "파트너 한마디"(md_comment) 저장/복원 지원
-- 템플릿에서 조각을 불러올 때 md_comment 칸이 항상 비어있던 문제 해결.
ALTER TABLE auction_templates
  ADD COLUMN IF NOT EXISTS md_comment TEXT;
