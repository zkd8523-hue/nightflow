-- ============================================================================
-- Migration 706: 클럽 19곳 자리 목록(clubs.seat_zones) — 테이블맵 기준 (2026-11-02)
--
-- 704에서 Club Ace·DM SEOUL만 넣었고, 나머지 예약 클럽은 담당자 제안서에서 자리를 글로 적고 있었다.
-- 각 클럽 평면도(floor_plan_urls)에 적힌 번호 그대로 옮겼다. 바 좌석(바 둘레 번호)은 704와 같이 뺐다.
-- 지도에 안 보이는 번호는 넣지 않았다 — 클럽 확인 후 추가한다.
-- 데이터만 바꾼다(컬럼은 704). 같은 클럽에 다시 실행해도 결과가 같다.
-- ============================================================================

-- 아르쥬 청담 라운지 — 벽면 T0–T13 포함
UPDATE clubs SET seat_zones = '[
  {"key":"A","label":"A존","label_en":"A tables","space":null,"seats":["A0","A1","A2","A3","A4","A5","A6"]},
  {"key":"H","label":"H존","label_en":"H tables","space":null,"seats":["H1","H2","H3","H4","H5"]},
  {"key":"B","label":"B존","label_en":"B tables","space":null,"seats":["B1","B2","B3","B4"]},
  {"key":"C","label":"C존","label_en":"C tables","space":null,"seats":["C1","C2","C3","C4"]},
  {"key":"V","label":"V존","label_en":"V tables","space":null,"seats":["V1","V2","V3","V4","V5","V6"]},
  {"key":"T","label":"T존","label_en":"T tables","space":null,"seats":["T0","T1","T2","T3","T4","T5","T6","T7","T8","T9","T10","T11","T12","T13"]},
  {"key":"R","label":"룸","label_en":"Rooms","space":null,"seats":["R1","R2"]},
  {"key":"S","label":"스탠딩","label_en":"Standing tables","space":null,"seats":["S1","S2","S3","S4","S5","S6","S7","S8","S9","S10","S11","S12","S13","S14","S15","S16","S17","S18","S19","S20","S21","S22","S23","S24","S25","S26","S27","S28","S29","S30"]}
]'::jsonb WHERE id = 'c6e747de-140f-4a76-857d-6ed51d09b217';

-- Core Seoul — 바 좌석 1–28 제외
UPDATE clubs SET seat_zones = '[
  {"key":"T","label":"T존","label_en":"T tables","space":null,"seats":["T1","T2","T3","T4","T5","T6","T7"]},
  {"key":"D","label":"D존","label_en":"D tables","space":null,"seats":["D1","D2","D3","D4","D5"]},
  {"key":"V","label":"V존","label_en":"V tables","space":null,"seats":["V1","V2"]},
  {"key":"R","label":"룸","label_en":"Room","space":null,"seats":["R1"]},
  {"key":"S","label":"스탠딩","label_en":"Standing tables","space":null,"seats":["S1","S2","S3","S4"]}
]'::jsonb WHERE id = 'a0890c9f-ac6e-4c2f-9665-c45667ca10e4';

-- HYPE SEOUL
UPDATE clubs SET seat_zones = '[
  {"key":"N","label":"테이블","label_en":"Tables","space":null,"seats":["1","2","3","4","5","6","7","8","9","10","11","12","13","14"]},
  {"key":"V","label":"V존","label_en":"V tables","space":null,"seats":["V1","V2"]},
  {"key":"DS","label":"DJ 옆","label_en":"DJ-side table","space":null,"seats":["DS"]},
  {"key":"S","label":"스탠딩","label_en":"Standing tables","space":null,"seats":["S1","S2","S3","S4","S5","S6","S7","S8","S9","S10","S11","S12"]}
]'::jsonb WHERE id = '67b2286c-63e9-46a1-bb90-e9ca4ccf6fae';

-- Color Apgu — 바 좌석 01–46 제외
UPDATE clubs SET seat_zones = '[
  {"key":"C","label":"C존","label_en":"C tables","space":null,"seats":["C1","C2","C3","C4","C5","C6","C7","C8","C9","C10","C11","C12","C13","C14","C15"]},
  {"key":"R","label":"룸","label_en":"Room","space":null,"seats":["R1"]},
  {"key":"DS","label":"DJ 옆","label_en":"DJ-side tables","space":null,"seats":["DS1","DS2"]},
  {"key":"GS","label":"GS","label_en":"GS table","space":null,"seats":["GS"]},
  {"key":"S","label":"스탠딩","label_en":"Standing tables","space":null,"seats":["S1","S2","S3","S4","S5","S6","S7","S8","S9"]}
]'::jsonb WHERE id = '80ba0738-ffbb-4463-b97e-7e68e4c0da60';

-- Veil Social Club
UPDATE clubs SET seat_zones = '[
  {"key":"T1","label":"T1존","label_en":"T1 tables","space":null,"seats":["T1-1","T1-2","T1-3","T1-4"]},
  {"key":"T2","label":"T2존","label_en":"T2 tables","space":null,"seats":["T2-1","T2-2","T2-3","T2-4","T2-5","T2-6","T2-7"]},
  {"key":"T3","label":"T3존","label_en":"T3 tables","space":null,"seats":["T3-1","T3-2","T3-3","T3-4","T3-5","T3-6","T3-7","T3-8"]},
  {"key":"VS","label":"소파","label_en":"Sofas","space":null,"seats":["VS1","VS2"]},
  {"key":"DJ","label":"DJ 옆","label_en":"DJ-side tables","space":null,"seats":["DJ1","DJ2"]},
  {"key":"S","label":"스탠딩","label_en":"Standing tables","space":null,"seats":["S1","S2","S3","S4"]}
]'::jsonb WHERE id = 'bb929c21-bd6d-4766-85c6-2b51452058da';

-- 브리드(BREED)
UPDATE clubs SET seat_zones = '[
  {"key":"B","label":"B존","label_en":"B tables","space":null,"seats":["B1","B2","B3","B4","B5","B6","B7","B8","B9","B10","B11","B12"]},
  {"key":"S","label":"스탠딩","label_en":"Standing tables","space":null,"seats":["S1","S2","S3","S4","S5","S6","S7","S8","S9","S10","S11","S12"]}
]'::jsonb WHERE id = '5cf5658b-b1ba-4744-a1d0-ae4a60a67828';

-- D.hell
UPDATE clubs SET seat_zones = '[
  {"key":"G","label":"G존","label_en":"G tables","space":null,"seats":["G1","G2","G3","G4"]},
  {"key":"B","label":"B존","label_en":"B tables","space":null,"seats":["B1","B2","B3","B4","B5","B6","B7","B8"]},
  {"key":"T","label":"T존","label_en":"T tables","space":null,"seats":["T1","T2","T3","T4","T5","T6","T7","T8","T9","T10"]},
  {"key":"D","label":"DJ 옆","label_en":"DJ-side tables","space":null,"seats":["D1","D2","D3"]},
  {"key":"S","label":"스탠딩","label_en":"Standing tables","space":null,"seats":["S1","S2","S3","S4","S5","S6"]}
]'::jsonb WHERE id = '5d1fd280-7656-491f-a335-9b4dd87c0d2a';

-- BELPOS
UPDATE clubs SET seat_zones = '[
  {"key":"N","label":"테이블","label_en":"Tables","space":null,"seats":["1","2","3","4","5","6","7","8","9","10","11","12"]},
  {"key":"D","label":"DJ 옆","label_en":"DJ-side tables","space":null,"seats":["D1","D2"]},
  {"key":"S","label":"스탠딩","label_en":"Standing tables","space":null,"seats":["S1","S2","S3","S4","S5","S6","S7","S8","S9"]}
]'::jsonb WHERE id = 'c40209fe-e131-4594-b9bc-98a833da5f89';

-- 그루브&스팟 — 층이 둘이라 번호 앞에 3F-/2F- 붙임. 3F DB3–DB6은 지도에 안 보여 뺌. 2F 혼술바존 H1–H32는 바 좌석이라 제외
UPDATE clubs SET seat_zones = '[
  {"key":"3T","label":"테이블","label_en":"3F tables","space":"3F EDM존(Spot)","seats":["3F-T1","3F-T2","3F-T3","3F-T4","3F-T5","3F-T6","3F-T7","3F-T8","3F-T9","3F-T10","3F-T11","3F-T12","3F-T13"]},
  {"key":"3L","label":"L존","label_en":"3F L tables","space":"3F EDM존(Spot)","seats":["3F-L1","3F-L2","3F-L3","3F-L4","3F-L5","3F-L6","3F-L7","3F-L8","3F-L9","3F-L10","3F-L11","3F-L12"]},
  {"key":"3D","label":"D존","label_en":"3F D tables","space":"3F EDM존(Spot)","seats":["3F-D1","3F-D2"]},
  {"key":"3DB","label":"DJ 옆","label_en":"3F DJ-side tables","space":"3F EDM존(Spot)","seats":["3F-DB1","3F-DB2","3F-DB7","3F-DB8"]},
  {"key":"3S","label":"스탠딩","label_en":"3F standing tables","space":"3F EDM존(Spot)","seats":["3F-S1","3F-S2","3F-S3","3F-S4","3F-S5","3F-S6","3F-S7"]},
  {"key":"2T","label":"테이블","label_en":"2F tables","space":"2F 힙합존(Groove)","seats":["2F-T1","2F-T2","2F-T3","2F-T4","2F-T5","2F-T6","2F-T7"]},
  {"key":"2L","label":"L존","label_en":"2F L tables","space":"2F 힙합존(Groove)","seats":["2F-L1","2F-L2","2F-L3","2F-L4","2F-L5","2F-L6"]},
  {"key":"2S","label":"스탠딩","label_en":"2F standing tables","space":"2F 힙합존(Groove)","seats":["2F-S1","2F-S2","2F-S3","2F-S4","2F-S5","2F-S6","2F-S7","2F-S8","2F-S9","2F-S10","2F-S11"]}
]'::jsonb WHERE id = '0d24b754-6c1d-40f6-badd-b398d03a4b3f';

-- Gathering
UPDATE clubs SET seat_zones = '[
  {"key":"N","label":"테이블","label_en":"Tables","space":null,"seats":["1","2","3","4","5","6","7","8"]},
  {"key":"E","label":"E","label_en":"Table E","space":null,"seats":["E"]},
  {"key":"W","label":"벽면","label_en":"Wall tables","space":null,"seats":["A","B","C","D"]},
  {"key":"BR","label":"바 옆","label_en":"Bar-side tables","space":null,"seats":["9","10","11"]}
]'::jsonb WHERE id = 'b1a2f63f-6e0a-4643-a99b-da301f54c4e6';

-- Day&night — 바 좌석 BAR1–6 제외
UPDATE clubs SET seat_zones = '[
  {"key":"A","label":"A존","label_en":"A tables","space":null,"seats":["A1","A2","A3","A4","A5"]},
  {"key":"B","label":"B존","label_en":"B tables","space":null,"seats":["B1","B2","B3","B4","B5","B6","B7","B8"]},
  {"key":"C","label":"C존","label_en":"C tables","space":null,"seats":["C1","C2","C3","C4","C5"]},
  {"key":"M","label":"M존","label_en":"M tables","space":null,"seats":["M1","M2"]},
  {"key":"X","label":"X존","label_en":"X tables","space":null,"seats":["X1","X2","X3"]},
  {"key":"S","label":"스탠딩","label_en":"Standing tables","space":null,"seats":["S1","S2","S3","S4","S5","S6","S7","S8","S9","S10","S11","S12","S13","S14","S15","S16","S17"]}
]'::jsonb WHERE id = '103400ee-b647-428f-ae76-07131a720dc6';

-- Dawn
UPDATE clubs SET seat_zones = '[
  {"key":"W","label":"W존","label_en":"W tables","space":null,"seats":["W1","W2","W3","W4"]},
  {"key":"V","label":"V존","label_en":"V tables","space":null,"seats":["V1","V2","V3","V4"]},
  {"key":"SV","label":"SV","label_en":"SV table","space":null,"seats":["SV"]},
  {"key":"AS","label":"스탠딩","label_en":"Standing tables","space":null,"seats":["AS1","AS2","AS3","AS4","AS5","AS6","AS7","AS8","AS9"]}
]'::jsonb WHERE id = 'dafb3e5c-919d-4cbc-9363-6e8797dcf631';

-- OCEAN — 바 좌석 BT1–5, CT1–2 제외
UPDATE clubs SET seat_zones = '[
  {"key":"A","label":"A존","label_en":"A tables","space":null,"seats":["A1","A2","A3","A4","A5","A6","A7","A8","A9","A10","A11","A12","A13"]},
  {"key":"B","label":"B존","label_en":"B tables","space":null,"seats":["B1","B2","B3","B4","B5","B6","B7"]},
  {"key":"C","label":"C존","label_en":"C tables","space":null,"seats":["C1","C2"]},
  {"key":"BS","label":"BS존","label_en":"BS tables","space":null,"seats":["BS1","BS2","BS3"]},
  {"key":"D","label":"DJ 옆","label_en":"DJ-side table","space":null,"seats":["D1"]},
  {"key":"S","label":"스탠딩","label_en":"Standing tables","space":null,"seats":["S1","S2","S3","S4","S5","S6"]}
]'::jsonb WHERE id = 'bd820f57-46b6-4d95-822a-4f0cf8e84542';

-- La Rosa — 지도의 VVIP ZONE은 예약 화면 표현 규칙대로 'K존'으로 표기
UPDATE clubs SET seat_zones = '[
  {"key":"V","label":"V존","label_en":"V tables","space":null,"seats":["V1","V2","V3","V4"]},
  {"key":"T","label":"T존","label_en":"T tables","space":null,"seats":["T1","T2","T3"]},
  {"key":"K","label":"K존","label_en":"K tables","space":null,"seats":["1K","2K","3K","4K"]},
  {"key":"G","label":"G존","label_en":"G tables","space":null,"seats":["G1","G2"]},
  {"key":"S","label":"스탠딩","label_en":"Standing tables","space":null,"seats":["S1","S2","S3","S4","S5","S6","S7","S8","S9"]}
]'::jsonb WHERE id = '4004d7b6-b3d2-4ec4-8c42-32d82405ded0';

-- CLUB BERMUDA — 지도에 S1·S2·S5·S6 없음. 지도가 'EDM ZONE'만 있음 — 다른 층·존이 있으면 지도 추가 필요
UPDATE clubs SET seat_zones = '[
  {"key":"M","label":"M존","label_en":"M tables","space":null,"seats":["M1","M2","M3","M4","M5","M6","M7","M8","M9","M10","M11","M12"]},
  {"key":"E","label":"E존","label_en":"E tables","space":null,"seats":["E1","E2","E3","E4","E5"]},
  {"key":"F","label":"F존(2층)","label_en":"F tables (2F)","space":null,"seats":["F1","F2"]},
  {"key":"S","label":"스탠딩","label_en":"Standing tables","space":null,"seats":["S3","S4","S7","S8","S9"]}
]'::jsonb WHERE id = 'd912c171-7b9c-40a4-8c89-dc05caf35ebd';

-- K-bat 빠따
UPDATE clubs SET seat_zones = '[
  {"key":"BOOTH","label":"부스","label_en":"Booths","space":null,"seats":["Booth1","Booth2","Booth3","Booth4"]},
  {"key":"T","label":"T존","label_en":"T tables","space":null,"seats":["T1","T2","T3","T4"]},
  {"key":"A","label":"A존","label_en":"A tables","space":null,"seats":["A1","A2","A3","A4","A5"]},
  {"key":"B","label":"B존","label_en":"B tables","space":null,"seats":["B1","B2","B3","B4"]},
  {"key":"C","label":"C존","label_en":"C tables","space":null,"seats":["C1","C2","C3","C4"]},
  {"key":"D","label":"D존","label_en":"D tables","space":null,"seats":["D1","D2","D3","D4","D5"]}
]'::jsonb WHERE id = 'fa3c81f0-29ab-4756-8f87-8c681b5cde10';

-- 도깨비 — 지도에 C1·D1·D4 없음
UPDATE clubs SET seat_zones = '[
  {"key":"T","label":"T존","label_en":"T tables","space":null,"seats":["T1","T2","T3"]},
  {"key":"A","label":"A존","label_en":"A tables","space":null,"seats":["A1","A2","A3","A4"]},
  {"key":"B","label":"B존","label_en":"B tables","space":null,"seats":["B1","B2","B3","B4","B5","B6"]},
  {"key":"C","label":"C존","label_en":"C tables","space":null,"seats":["C2","C3","C4","C5","C6"]},
  {"key":"D","label":"D존","label_en":"D tables","space":null,"seats":["D2","D3","D5","D6"]},
  {"key":"E","label":"E존","label_en":"E tables","space":null,"seats":["E1","E2","E3","E4","E5","E6","E7"]},
  {"key":"SB","label":"서브바 옆","label_en":"Sub-bar tables","space":null,"seats":["SB1","SB2","SB3"]},
  {"key":"DR","label":"DR","label_en":"DR table","space":null,"seats":["DR"]},
  {"key":"S","label":"스탠딩","label_en":"Standing tables","space":null,"seats":["S1","S2","S3","S4"]}
]'::jsonb WHERE id = '93f1081a-250c-402a-a0d4-9b8a309aff57';

-- Azit
UPDATE clubs SET seat_zones = '[
  {"key":"T","label":"T존","label_en":"T tables","space":null,"seats":["T1","T2","T3","T4","T5","T6","T7","T8","T9","T10","T11","T12","T13","T14","T15","T16"]},
  {"key":"V","label":"V존","label_en":"V tables","space":null,"seats":["V1","V2","V3","V4","V5","V6","V7","V8","V9","V10"]},
  {"key":"Z","label":"Z존","label_en":"Z tables","space":null,"seats":["Z1","Z2","Z3","Z4","Z5","Z6","Z7","Z8","Z9","Z10","Z11","Z12"]}
]'::jsonb WHERE id = 'c8e912c9-6ac4-45f6-91ec-6eb74e6421d0';

-- +82 — 지도에 S4 없음
UPDATE clubs SET seat_zones = '[
  {"key":"N","label":"테이블","label_en":"Tables","space":null,"seats":["1","2","3","4","5","6","7","8","9","10","11","12","13"]},
  {"key":"D","label":"DJ 옆","label_en":"DJ-side tables","space":null,"seats":["D1","D2"]},
  {"key":"S","label":"스탠딩","label_en":"Standing tables","space":null,"seats":["S1","S2","S3","S5"]}
]'::jsonb WHERE id = '6a19815e-c22b-4bc5-8bb5-dd84b872a7b4';
