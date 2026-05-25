-- Migration 241: expire_old_hotdeals() cron 등록
-- ends_at 지난 active 핫딜을 매 분마다 expired로 전환

SELECT cron.schedule(
  'expire-old-hotdeals',
  '*/20 * * * *',
  $$ SELECT expire_old_hotdeals(); $$
);
