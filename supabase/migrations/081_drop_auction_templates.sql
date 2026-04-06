-- 경매 템플릿 기능 제거: 템플릿 없이도 충분히 빠르게 등록 가능
DROP TRIGGER IF EXISTS enforce_template_limit ON auction_templates;
DROP TRIGGER IF EXISTS templates_updated_at ON auction_templates;
DROP FUNCTION IF EXISTS check_template_limit();
DROP TABLE IF EXISTS auction_templates;
