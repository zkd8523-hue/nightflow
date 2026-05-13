-- Migration 162: Kakao 프로필 이미지 HTTP → HTTPS 정규화
-- 배경: Capacitor WebView(HTTPS)에서 HTTP 이미지가 Mixed Content로 차단되어
--       프로필 이미지가 깨진 아이콘으로 표시되는 문제 해결.
-- 안전성: idempotent (재실행해도 효과 동일). Kakao CDN은 동일 경로를 HTTPS로 제공.

UPDATE users
SET profile_image = REPLACE(profile_image, 'http://', 'https://')
WHERE profile_image LIKE 'http://%';
