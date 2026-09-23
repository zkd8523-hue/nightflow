-- ============================================================================
-- Migration 671: 추천 클럽 "왜 여기를 추천하나" 한 문단
--
-- 배경(2026-09-23): Mig 670으로 지역별 추천 1곳(area_pick)에 카드 강조를 붙였다.
-- 그런데 그 클럽 상세를 열면 첫 화면이 구글 리뷰 캐러셀이고, Day&night는 4.3점인데
-- 노출 5개 중 4개가 "인종차별·문지기가 안 들여보냄"이다. 우리가 추천해 놓고 손님이
-- "왜 이걸 추천했지?"를 먼저 묻게 된다. 그 질문에 리뷰보다 먼저 답하는 블록이 필요하다.
--
-- tagline(Mig 650)과 같은 방식 — 언어별 손글, 기계 번역 없음, 비면 블록 자체를 접는다.
-- tagline이 "무엇인가"(한 줄)라면 이건 "왜 우리가 골랐나"(한 문단). 둘은 겹치지 않는다.
-- area_pick=false인 클럽에 값이 있어도 렌더하지 않는다 — 추천이 아닌데 추천 사유가
-- 보이면 그게 더 이상하다. 플래그가 게이트, 이 컬럼은 내용.
--
-- 길이 상한은 tagline의 약 3배. 카드가 아니라 상세 시트라 문단이 들어갈 자리가 있다.
-- ============================================================================

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS pick_reason_ko    TEXT CHECK (pick_reason_ko    IS NULL OR length(pick_reason_ko)    <= 240),
  ADD COLUMN IF NOT EXISTS pick_reason_en    TEXT CHECK (pick_reason_en    IS NULL OR length(pick_reason_en)    <= 360),
  ADD COLUMN IF NOT EXISTS pick_reason_ja    TEXT CHECK (pick_reason_ja    IS NULL OR length(pick_reason_ja)    <= 240),
  ADD COLUMN IF NOT EXISTS pick_reason_zh    TEXT CHECK (pick_reason_zh    IS NULL OR length(pick_reason_zh)    <= 180),
  ADD COLUMN IF NOT EXISTS pick_reason_zh_tw TEXT CHECK (pick_reason_zh_tw IS NULL OR length(pick_reason_zh_tw) <= 180);

COMMENT ON COLUMN clubs.pick_reason_en IS
  '지역별 추천(area_pick) 클럽에만 렌더되는 "왜 여기를 추천하나" 문단(영어). 상세 시트에서 구글 리뷰보다 위에 놓인다. 비면 블록 숨김(Migration 671).';
COMMENT ON COLUMN clubs.pick_reason_ko IS '추천 사유(한국어). pick_reason_en 참조.';
COMMENT ON COLUMN clubs.pick_reason_ja IS '추천 사유(일본어). pick_reason_en 참조.';
COMMENT ON COLUMN clubs.pick_reason_zh IS '추천 사유(간체). pick_reason_en 참조.';
COMMENT ON COLUMN clubs.pick_reason_zh_tw IS '추천 사유(번체). pick_reason_en 참조.';

-- 문구는 사장님이 쓴다. 아래는 Day&night 하나만 톤 참고용으로 넣는다 —
-- 리뷰의 "문지기·인종차별" 우려를 정면으로 받아서, 예약이 그 문제를 푸는 이유로 연결한다.
-- 나머지 3곳(Ace·BERMUDA·Groove & Spot)은 비워 두어 블록이 안 뜬다. 채우면 그때 뜬다.
UPDATE clubs SET
  pick_reason_en = 'The reviews are honest: the door here is strict, and walk-ins get turned away — especially groups of guys and non-Koreans. That is exactly why we book it. A table in your name means the bouncer is expecting you, not judging you. Once inside, it is the most international hip-hop floor in Itaewon and it does not stop until 7am.',
  pick_reason_ko = '리뷰 그대로예요. 여기 문이 까다롭고, 워크인은 특히 남자끼리·외국인 그룹이 자주 돌려보내져요. 그래서 우리가 예약을 잡아드립니다. 이름으로 테이블이 잡혀 있으면 문지기는 심사하는 게 아니라 기다리는 거예요. 들어가면 이태원에서 가장 국제적인 힙합 플로어고, 7시까지 안 멈춥니다.',
  pick_reason_ja = 'レビュー通り、ここは入口が厳しく、飛び込みは特に男性グループ・外国人が断られやすい。だからこそ予約する価値がある。名前でテーブルが入っていれば、ドアマンは審査ではなく出迎えになる。中は梨泰院で最も国際色の強いヒップホップフロアで、朝7時まで止まらない。',
  pick_reason_zh = '评价说的没错：这里门口很严，walk-in 常被拒，尤其是纯男生和外国人团。正因如此才值得预订——桌位登记了你的名字，保安是在等你，不是在审你。进去之后是梨泰院最国际化的嘻哈舞池，一直开到早上7点。',
  pick_reason_zh_tw = '評價說的沒錯：這裡門口很嚴，walk-in 常被拒，尤其是純男生和外國人團。正因如此才值得訂位——包廂登記了你的名字，保全是在等你，不是在審你。進去之後是梨泰院最國際化的嘻哈舞池，一直開到早上7點。'
WHERE name_en = 'Day&night' AND area = '이태원' AND deleted_at IS NULL;
