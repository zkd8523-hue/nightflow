-- 데모 깃발 시드 제거 (캡처 완료 후 실행)
-- seed_demo_puzzle.sql 실행 결과를 모두 되돌림

BEGIN;

DELETE FROM puzzle_offers
WHERE puzzle_id = 'aaaaaaaa-bbbb-cccc-dddd-000000000001';

DELETE FROM puzzle_members
WHERE puzzle_id = 'aaaaaaaa-bbbb-cccc-dddd-000000000001';

DELETE FROM puzzles
WHERE id = 'aaaaaaaa-bbbb-cccc-dddd-000000000001';

COMMIT;

-- 알림 로그가 남아있을 경우 추가 정리 (선택)
-- DELETE FROM in_app_notifications WHERE action_url LIKE '%aaaaaaaa-bbbb-cccc-dddd-000000000001%';
