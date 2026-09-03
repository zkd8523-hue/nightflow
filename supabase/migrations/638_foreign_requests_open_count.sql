-- 외국인 홈("5 requests on-going right now") 신뢰 문구용 카운트 함수.
-- foreign_requests SELECT는 본인 것 또는 admin만 허용(Migration 454)이라
-- anon 클라이언트로는 전체 건수를 못 센다. 행 데이터를 노출하지 않고
-- 개수만 반환하는 SECURITY DEFINER RPC로 우회한다(같은 테이블에 이미
-- 있는 패턴, Migration 489의 check_foreign_request_rate_limit 참조).
CREATE OR REPLACE FUNCTION count_open_foreign_requests()
RETURNS INTEGER
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::INTEGER
  FROM foreign_requests
  WHERE status IN ('new', 'contacted');
$$;

GRANT EXECUTE ON FUNCTION count_open_foreign_requests() TO anon, authenticated;
