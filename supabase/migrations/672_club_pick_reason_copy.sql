-- ============================================================================
-- Migration 672: 추천 사유 4곳 문구 확정 (사장님 지정, 2026-09-23)
--
-- 671에서 Day&night 하나만 톤 참고용으로 넣고 나머지 3곳은 비워 뒀다.
-- 사장님이 실제 추천 이유를 줬다 — "왜 이 클럽인가"를 말하는 문구라 671의 리뷰 방어형
-- 초안보다 낫다. Day&night도 같은 방향으로 다시 쓴다.
--
--   Day&night   한국인·외국인 자타공인 이태원 1위
--   Club Ace    한국 최대 럭셔리 클럽
--   BERMUDA     홍대 최대 EDM, 젊음의 에너지
--   Groove&Spot 부산 젊은이들의 성지, 힙합·EDM 둘 다
--
-- 원칙: "1위·최대·성지"는 사장님 판단이라 그대로 쓴다. 리뷰의 문지기 우려는 한 줄로만
-- 받고(무시하면 리뷰가 바로 아래라 거짓말처럼 읽힘), 부정 표현("no scam"류)은 쓰지 않는다
-- — 광고 랜딩 때 정한 규칙과 같다. 671 컬럼·CHECK 상한 그대로.
-- ============================================================================

UPDATE clubs SET
  pick_reason_ko    = '한국인도 외국인도 인정하는 이태원 1위. 문이 까다롭기로 유명한데, 이름으로 테이블이 잡혀 있으면 그 문은 열립니다. 이태원에서 가장 국제적인 힙합 플로어, 새벽 7시까지.',
  pick_reason_en    = 'The undisputed #1 in Itaewon — Koreans and foreigners agree. The door is famously strict, and a table in your name is what opens it. The most international hip-hop floor in Itaewon, running until 7am.',
  pick_reason_ja    = '韓国人も外国人も認める梨泰院No.1。入口が厳しいことで有名だが、名前でテーブルが入っていればその扉は開く。梨泰院で最も国際色の強いヒップホップフロア、朝7時まで。',
  pick_reason_zh    = '韩国人和外国人公认的梨泰院第一。门口出了名的严，但桌位登记了你的名字，门就会开。梨泰院最国际化的嘻哈舞池，一直到早上7点。',
  pick_reason_zh_tw = '韓國人和外國人公認的梨泰院第一。門口出了名的嚴，但包廂登記了你的名字，門就會開。梨泰院最國際化的嘻哈舞池，一直到早上7點。'
WHERE name_en = 'Day&night' AND area = '이태원' AND deleted_at IS NULL;

UPDATE clubs SET
  pick_reason_ko    = '한국 최대 럭셔리 클럽. 강남 최고의 무대와 사운드는 테이블에서 즐기는 곳이라, 외국인은 테이블 없이 입장이 어렵습니다. 그래서 우리가 테이블부터 잡아드립니다.',
  pick_reason_en    = 'Korea''s largest luxury club. The best stage and sound in Gangnam are built around tables — which is why foreigners without one struggle at the door. So we book the table first. Walk in as a guest, not a walk-in.',
  pick_reason_ja    = '韓国最大のラグジュアリークラブ。江南最高のステージとサウンドはテーブルで楽しむ場所で、外国人はテーブルなしだと入場が難しい。だから私たちがまずテーブルを押さえる。',
  pick_reason_zh    = '韩国最大的奢华夜店。江南最好的舞台和音响是围着桌位设计的，所以外国人没有桌位很难进门。我们先帮你订好桌位，以客人的身份进场。',
  pick_reason_zh_tw = '韓國最大的奢華夜店。江南最好的舞台和音響是圍著包廂設計的，所以外國人沒有包廂很難進門。我們先幫你訂好包廂，以客人的身份進場。'
WHERE name_en = 'Club Ace' AND area = '강남' AND deleted_at IS NULL;

UPDATE clubs SET
  pick_reason_ko    = '홍대 최대 EDM 클럽. 젊음의 에너지가 가장 진한 곳으로, 홍대의 밤을 한 번에 느끼고 싶다면 여기입니다. 테이블을 잡아두면 줄 없이 그 에너지 한가운데로 들어갑니다.',
  pick_reason_en    = 'Hongdae''s biggest EDM club, and where its young energy runs highest. If you want the whole Hongdae night in one room, this is it. Book a table and you walk straight into the middle of it — no line.',
  pick_reason_ja    = '弘大最大のEDMクラブ。若さのエネルギーが最も濃い場所で、弘大の夜を一度に味わうならここ。テーブルを押さえておけば、並ばずにそのエネルギーの真ん中へ。',
  pick_reason_zh    = '弘大最大的EDM夜店，年轻能量最浓的地方。想一次感受弘大的夜晚，就是这里。订好桌位，不用排队，直接走进那股能量的正中央。',
  pick_reason_zh_tw = '弘大最大的EDM夜店，年輕能量最濃的地方。想一次感受弘大的夜晚，就是這裡。訂好包廂，不用排隊，直接走進那股能量的正中央。'
WHERE name_en = 'CLUB BERMUDA' AND area = '홍대' AND deleted_at IS NULL;

UPDATE clubs SET
  pick_reason_ko    = '부산 젊은이들의 성지. 두 층에서 힙합과 EDM을 한 번에 즐길 수 있는, 부산에서 가장 큰 클럽입니다. 해운대의 밤을 제대로 보내고 싶다면 여기서 시작하세요.',
  pick_reason_en    = 'Where Busan''s young crowd goes. Two floors, hip-hop and EDM under one roof — the biggest club in the city. If you want to do Busan nightlife properly, start here.',
  pick_reason_ja    = '釜山の若者の聖地。2フロアでヒップホップとEDMを一度に楽しめる、釜山最大のクラブ。海雲台の夜をちゃんと過ごすなら、ここから。',
  pick_reason_zh    = '釜山年轻人的圣地。两层楼，嘻哈和EDM一次全有，釜山最大的夜店。想好好体验釜山的夜生活，从这里开始。',
  pick_reason_zh_tw = '釜山年輕人的聖地。兩層樓，嘻哈和EDM一次全有，釜山最大的夜店。想好好體驗釜山的夜生活，從這裡開始。'
WHERE name_en = 'Groove & Spot' AND area = '부산' AND deleted_at IS NULL;
