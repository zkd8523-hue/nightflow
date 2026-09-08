-- ============================================================================
-- Migration 632: 630 의 잘못된 links_checked_at 백필 되돌리기
-- 날짜: 2026-09-09
-- 선행: 630, discover-dj-links Edge Function 재배포(2026-09-09, 아래 참조)
--
-- 무엇이 잘못됐나:
--   630 은 "8/30 에 이미 조회된 DJ 는 다시 보지 말자"며 412명에 그날 시각을
--   박았다. 8/30 에 실제로 프로필 스캔이 있었던 건 맞다(Apify 실행 기록:
--   14:52~15:17 KST, CHUNK=30 배치 53회). 그래서 백필 자체가 통째로 틀린 건
--   아니다.
--
--   문제는 **그날 스캔이 사운드클라우드만 봤다**는 것이다.
--     git show ff11e29e:scripts/discover-dj-soundcloud.mjs:166
--       .filter(d => !d.deleted_at && !d.is_test && d.instagram && !d.soundcloud_url)
--   유튜브 지원은 그로부터 6시간 뒤(7d3c42b0, 8/30 21:00 KST)에 들어왔고,
--   djs.youtube_url 컬럼도 8/31 에 생겼다(Migration 613).
--
--   즉 사클을 못 찾은 채 stamp 된 DJ 들은 **유튜브·링크트리를 볼 기회가 아예
--   없었는데** "조회함"으로 기록돼 90일간 재조회에서 빠졌다. 실측 256명.
--   @kingmck 이 그 예다 — 링크트리에 soundcloud.com/kingmck 가 있는데,
--   630 의 stamp 때문에 영영 안 보게 돼 있었다.
--
-- 왜 전부가 아니라 일부만 되돌리나:
--   사클을 이미 찾은 156명은 그날 스캔이 제대로 동작한 증거다. 그들은 지금
--   대상 조건(사클·유튜브 둘 다 없음)에서 어차피 빠지므로 건드릴 필요가 없다.
--
-- ⚠️ 순서: Edge Function 을 먼저 고쳐 배포해야 한다.
--   고치기 전 버전은 Apify 호출이 실패해도 조용히 넘어가면서 links_checked_at 을
--   찍었다(2026-09-06 실측: checked:0 인데 HTTP 200). 그 상태로 리셋하면
--   크레딧 소진·토큰 만료 때 "안 봤는데 봤다"가 또 쌓인다.
--   → 2026-09-09 배포분에서 apify() 가 예외를 던지고, 실패한 배치는 stamp 하지
--     않도록 고쳤다. 비공개 계정도 stamp 하지 않는다(볼 수 없었을 뿐이므로).
-- ============================================================================

-- 1) 백필 stamp 코호트
--    is_test 가드: Edge Function 이 어차피 is_test=false 로 거르므로 지금은
--    영향이 없지만(현재 해당 0명), 조건을 함수와 맞춰 둔다.
UPDATE djs
SET links_checked_at = NULL
WHERE links_checked_at = TIMESTAMPTZ '2026-08-30 12:00:00+09'
  AND soundcloud_url IS NULL
  AND youtube_url IS NULL
  AND deleted_at IS NULL
  AND is_test = false;

-- 2) 병합 survivor 가 물려받았을 수 있는 stamp 되돌리기.
--    merge-djs-by-instagram.mjs 가 FIELDS 배열에 links_checked_at 을 넣어 둬서
--    drop 행의 조회 이력이 survivor 에게 상속될 수 있었다(그 스크립트에서 제거함).
--
--    ※ 실행 결과 0건이었다. 19개 병합 그룹을 전수 확인하니 링크 없는 survivor 는
--      전부 stamp 가 NULL 이었다 — if (!keep[f]) 조건이라 survivor 나 drop 쪽에
--      찍힌 게 없으면 상속 자체가 일어나지 않았다. 잠재 버그였지 실제 오염은
--      아니었다. 재실행해도 안전하도록 남겨 둔다.
UPDATE djs d
SET links_checked_at = NULL
WHERE d.deleted_at IS NULL
  AND d.soundcloud_url IS NULL
  AND d.youtube_url IS NULL
  AND d.is_test = false
  AND d.links_checked_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM djs x
    WHERE x.deleted_at >= TIMESTAMPTZ '2026-09-08 00:00:00+09'
      AND lower(x.instagram) = lower(d.instagram)
      AND x.id <> d.id
  );

-- 확인 (Edge Function 의 대상 조건과 동일하게 is_test 까지 맞춘다):
--   SELECT count(*) FROM djs
--   WHERE links_checked_at IS NULL AND instagram IS NOT NULL
--     AND soundcloud_url IS NULL AND youtube_url IS NULL
--     AND deleted_at IS NULL AND is_test = false;
--   → 적용 결과: 15명 → 276명 (1번이 256건 리셋, 2번은 0건)
--
-- 소진 속도: Edge Function 이 1회 50명(MAX_PER_RUN), cron 하루 1회이므로
-- 약 6일에 걸쳐 처리된다. 비용은 271 × $0.0023 = 약 $0.62.
