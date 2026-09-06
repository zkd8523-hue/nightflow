-- 659: clubs.open_dows — 클럽이 영업하는 요일(기계 판독용)
--
-- 배경: 지금까지 영업일 정보는 operating_hours 자유 텍스트뿐이었다
-- ("금/토 22:00-05:00", "화~일 22:00-08:00 (월 휴무)", "연중무휴 21:00 OPEN" …).
-- 사람이 읽기엔 충분하지만 예약 폼이 "이 클럽 이 날 쉬는데요"를 판단할 수 없어,
-- 손님이 휴무일로 요청을 넣고 운영자가 뒤늦게 되돌리는 일이 생긴다.
-- 요일 배열을 따로 둔다 — operating_hours는 사람이 읽는 안내로 그대로 남긴다
-- (시간대·층별 차이 같은 건 배열로 표현할 수 없고, 그럴 필요도 없다).
--
-- 0=일 … 6=토 (JS Date.getDay()와 같은 규칙 — 프론트에서 변환 없이 바로 쓴다).
-- NULL = "아직 모름"이며 이때는 아무 날짜도 막지 않는다. 빈 배열({})이 아니라
-- NULL을 기본값으로 두는 이유 — 정보가 없는 것과 "영업일이 없다"는 다르다.
-- 잘못 비워두면 그 클럽은 어떤 날짜로도 예약할 수 없게 되므로, 모르면 열어둔다.

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS open_dows SMALLINT[];

COMMENT ON COLUMN clubs.open_dows IS
  '영업 요일 (0=일 ~ 6=토, JS getDay 기준). NULL이면 미설정 — 날짜 제한을 걸지 않는다. operating_hours(자유 텍스트)는 사람이 읽는 안내용으로 별도 유지.';

-- 값이 들어간다면 0~6만 허용한다. 범위를 벗어난 값이 섞이면 프론트 달력이
-- 조용히 어긋나기만 하고 아무도 눈치채지 못한다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clubs_open_dows_range'
  ) THEN
    ALTER TABLE clubs ADD CONSTRAINT clubs_open_dows_range CHECK (
      open_dows IS NULL OR (
        array_length(open_dows, 1) IS NOT NULL
        AND open_dows <@ ARRAY[0,1,2,3,4,5,6]::SMALLINT[]
      )
    );
  END IF;
END $$;

-- ── 초기값 백필 ──────────────────────────────────────────────
-- 예약 폼에 실제로 뜨는 클럽(강남·홍대·이태원, 썸네일 있음, 테스트/가이드숨김 제외)
-- 75개 중, operating_hours 텍스트에서 요일을 확정할 수 있는 71개만 채운다.
-- 나머지 4개(Frame Seoul, BBCB, OFF THE RECORD, Jam)는 원문에 요일 정보가 아예
-- 없어 NULL로 남긴다 — 추측해서 막느니 열어두는 쪽이 안전하다.
--
-- 값은 operating_hours를 파싱해 생성했고(scripts/parse-open-dows.js), 사람이
-- 눈으로 한 번 확인한 결과다. 주석의 요일이 그 클럽에 실제로 들어간 값이다.
-- 이미 값이 있는 행은 건드리지 않는다 — 운영자가 손으로 고친 걸 덮으면 안 된다.

UPDATE clubs AS c
   SET open_dows = v.dows
  FROM (VALUES
    ('6a19815e-c22b-4bc5-8bb5-dd84b872a7b4'::uuid, ARRAY[5,6]::SMALLINT[]), -- +82 (금토)
    ('96571129-fea9-4602-b9d1-5b2f6a6543ed'::uuid, ARRAY[0,2,3,4,5,6]::SMALLINT[]), -- 25 (일화수목금토)
    ('9c891ba3-9ab9-442f-b105-dbea5d80b2b0'::uuid, ARRAY[5,6]::SMALLINT[]), -- A:tension (금토)
    ('fb5edbac-ddef-4695-96e6-af047071f20f'::uuid, ARRAY[0,3,4,5,6]::SMALLINT[]), -- ADD (일수목금토)
    ('b935e7dd-11d9-460a-9388-dbdaacce8a0c'::uuid, ARRAY[0,1,2,3,4,5,6]::SMALLINT[]), -- AURA (일월화수목금토)
    ('11188a87-0d52-4de0-84e3-2ae54bc6f34b'::uuid, ARRAY[0,1,2,3,4,5,6]::SMALLINT[]), -- Awesome Red (일월화수목금토)
    ('5d786696-e6b3-472b-bbe8-4923c42b0007'::uuid, ARRAY[0,1,2,3,4,5,6]::SMALLINT[]), -- B1 (일월화수목금토)
    ('424d93ec-b9d4-4a78-8723-862e56b4f6c6'::uuid, ARRAY[0,4,5,6]::SMALLINT[]), -- BADASS (일목금토)
    ('88c4f774-47ab-4ac8-8233-bdb667d89efe'::uuid, ARRAY[0,4,5,6]::SMALLINT[]), -- BAT (일목금토)
    ('be5ce0bb-9629-486a-ac70-615c31647fdc'::uuid, ARRAY[4,5,6]::SMALLINT[]), -- Bolero (목금토)
    ('ce2fbcb7-79c6-4650-b4c4-4f1b6cc044a4'::uuid, ARRAY[0,1,2,3,4,5,6]::SMALLINT[]), -- Box Seoul (일월화수목금토)
    ('0b95bc54-7c74-4098-90b8-52747240bde5'::uuid, ARRAY[4,5,6]::SMALLINT[]), -- Cakeshop (목금토)
    ('35de296e-5fdc-435b-baf2-1c7c05538687'::uuid, ARRAY[0,2,3,4,5,6]::SMALLINT[]), -- Club Ace (일화수목금토)
    ('d912c171-7b9c-40a4-8c89-dc05caf35ebd'::uuid, ARRAY[0,4,5,6]::SMALLINT[]), -- CLUB BERMUDA (일목금토)
    ('5174448f-11e6-4660-9e18-f0a9663a1a87'::uuid, ARRAY[0,4,5,6]::SMALLINT[]), -- Club FF (일목금토)
    ('80ba0738-ffbb-4463-b97e-7e68e4c0da60'::uuid, ARRAY[5,6]::SMALLINT[]), -- Color Apgu (금토)
    ('a0890c9f-ac6e-4c2f-9665-c45667ca10e4'::uuid, ARRAY[5,6]::SMALLINT[]), -- Core Seoul (금토)
    ('dafb3e5c-919d-4cbc-9363-6e8797dcf631'::uuid, ARRAY[0,3,4,5,6]::SMALLINT[]), -- Dawn (일수목금토)
    ('103400ee-b647-428f-ae76-07131a720dc6'::uuid, ARRAY[0,2,3,4,5,6]::SMALLINT[]), -- Day&night (일화수목금토)
    ('bfdba3b8-1f04-49a8-91b8-7fa7f9e2012f'::uuid, ARRAY[4,5,6]::SMALLINT[]), -- Deeper (목금토)
    ('169b7a43-4aa4-479a-b848-4a0ec7b53e18'::uuid, ARRAY[0,1,2,3,4,5,6]::SMALLINT[]), -- Diss (일월화수목금토)
    ('cc7db051-b75d-4c1f-9f95-29f7d8ce70d7'::uuid, ARRAY[5,6]::SMALLINT[]), -- DM SEOUL (금토)
    ('4d0567bf-20cf-4b76-b8ab-79f4cc829a80'::uuid, ARRAY[0,3,4,5,6]::SMALLINT[]), -- Doze (일수목금토)
    ('eaa6c017-d9ac-454a-a709-1637ebadbfef'::uuid, ARRAY[5,6]::SMALLINT[]), -- Flac Seoul (금토)
    ('28f49c9b-377e-4d0d-8b2f-32f9519e245c'::uuid, ARRAY[0,1,2,3,4,5,6]::SMALLINT[]), -- Fountain (일월화수목금토)
    ('b1a2f63f-6e0a-4643-a99b-da301f54c4e6'::uuid, ARRAY[0,1,2,3,4,5,6]::SMALLINT[]), -- Gathering (일월화수목금토)
    ('a034d4cd-9937-46f7-b0a1-fef6d351ddba'::uuid, ARRAY[5,6]::SMALLINT[]), -- Grain Haus (금토)
    ('8fd3fe35-5d1a-4543-98ec-e4b979dbcca3'::uuid, ARRAY[5,6]::SMALLINT[]), -- Hertz (금토)
    ('19fb6d10-6e57-44ce-b82d-62ca8129bb4a'::uuid, ARRAY[0,3,4,5,6]::SMALLINT[]), -- Hilo (일수목금토)
    ('25eec112-29d5-4848-a14d-af2bb953ea0e'::uuid, ARRAY[0,1,2,3,4,5,6]::SMALLINT[]), -- HIVE (일월화수목금토)
    ('818e7809-dcce-422c-9e48-a1ead9bad07f'::uuid, ARRAY[5,6]::SMALLINT[]), -- Hustle (금토)
    ('67b2286c-63e9-46a1-bb90-e9ca4ccf6fae'::uuid, ARRAY[5,6]::SMALLINT[]), -- HYPE SEOUL (금토)
    ('fa3c81f0-29ab-4756-8f87-8c681b5cde10'::uuid, ARRAY[0,1,2,3,4,5,6]::SMALLINT[]), -- K-bat 빠따 (일월화수목금토)
    ('4004d7b6-b3d2-4ec4-8c42-32d82405ded0'::uuid, ARRAY[5,6]::SMALLINT[]), -- La Rosa (금토)
    ('0802610e-70a5-4414-b7fe-3edc91859f9d'::uuid, ARRAY[5,6]::SMALLINT[]), -- Labamba (금토)
    ('d2f51061-2095-4732-a999-654a1ab98905'::uuid, ARRAY[4,5,6]::SMALLINT[]), -- Lion Super Club (목금토)
    ('5e7a3ea9-d8af-42f1-bbe2-34ab0d2da09f'::uuid, ARRAY[0,1,2,3,4,5,6]::SMALLINT[]), -- LOBBY 157 (일월화수목금토)
    ('007ccc36-feef-4777-b01b-159016062a2d'::uuid, ARRAY[5,6]::SMALLINT[]), -- LUKA (금토)
    ('d643cb38-2a71-41dd-b094-716b066acaa1'::uuid, ARRAY[0,1,2,3,4,5,6]::SMALLINT[]), -- Macaroni Funky Club (일월화수목금토)
    ('2dafc5c8-a8ea-4d9b-8b9e-b48c593647e0'::uuid, ARRAY[5,6]::SMALLINT[]), -- MAD (금토)
    ('7e3ef209-68fa-4c81-a534-91597e62677e'::uuid, ARRAY[5,6]::SMALLINT[]), -- MING (금토)
    ('8b2a189f-6c54-4f29-8dfc-e961d23fd0c3'::uuid, ARRAY[5,6]::SMALLINT[]), -- Modeci (금토)
    ('a03fccb9-4382-4f59-9b8a-04da468b8bfd'::uuid, ARRAY[5,6]::SMALLINT[]), -- MUSE SEOUL (금토)
    ('8f853e14-1589-44cd-b7b3-c4db5ad770af'::uuid, ARRAY[0,1,2,3,4,5,6]::SMALLINT[]), -- NB2 (일월화수목금토)
    ('24242c73-8155-4fdc-b17e-daa8fe94e597'::uuid, ARRAY[5,6]::SMALLINT[]), -- NYAPI (금토)
    ('bd820f57-46b6-4d95-822a-4f0cf8e84542'::uuid, ARRAY[0,1,2,3,4,5,6]::SMALLINT[]), -- OCEAN (일월화수목금토)
    ('09c88d88-b460-446a-8f9b-b6f301944c98'::uuid, ARRAY[1,2,3,4,5,6]::SMALLINT[]), -- Orgasm Valley (월화수목금토)
    ('c645d2e5-0d2e-4a0f-9860-fbbc1ba89b12'::uuid, ARRAY[5,6]::SMALLINT[]), -- Paper (금토)
    ('7d06b1ff-7d87-47b6-a05b-295c51d59bfb'::uuid, ARRAY[0,1,3,4,5,6]::SMALLINT[]), -- POSE (일월수목금토)
    ('e27781b0-8231-4d07-b409-8f624385ec3e'::uuid, ARRAY[0,3,4,5,6]::SMALLINT[]), -- Purple (일수목금토)
    ('50894c35-b00f-4939-955e-ec1cb5c516a4'::uuid, ARRAY[5,6]::SMALLINT[]), -- RING (금토)
    ('5b1b99a9-e4fc-4f01-858a-8f359f153c70'::uuid, ARRAY[4,5,6]::SMALLINT[]), -- Rosso (목금토)
    ('7d3e6f02-db91-4543-a764-28c72fba26fb'::uuid, ARRAY[3,4,5,6]::SMALLINT[]), -- Sabotage (수목금토)
    ('8e52fffe-1783-4b7a-a6b4-4eeb1a065621'::uuid, ARRAY[5,6]::SMALLINT[]), -- Shape (금토)
    ('2e842b41-bb69-4beb-a9a4-c3a1d301c451'::uuid, ARRAY[5,6]::SMALLINT[]), -- Shelter (금토)
    ('07b01a77-8c5b-4294-8543-03cbe4a93792'::uuid, ARRAY[0,1,2,3,4,5,6]::SMALLINT[]), -- Sinkhole (일월화수목금토)
    ('c320833f-8214-4f1a-99ad-389349052a91'::uuid, ARRAY[5,6]::SMALLINT[]), -- Soap Seoul (금토)
    ('073f76b9-c5b6-4fcd-bfae-1333c1b310fa'::uuid, ARRAY[3,4,5,6]::SMALLINT[]), -- Soho Seoul (수목금토)
    ('7174ef04-69b4-41c2-a127-e205889da72f'::uuid, ARRAY[0,1,2,3,4,5,6]::SMALLINT[]), -- SOLE (일월화수목금토)
    ('e06d15fc-e59a-469a-8563-a0b56ac220b4'::uuid, ARRAY[4,5,6]::SMALLINT[]), -- SX (목금토)
    ('8a6a9e42-42b2-4a45-85bd-32c0cac194a2'::uuid, ARRAY[5,6]::SMALLINT[]), -- Teller (금토)
    ('05e65073-95f6-46bf-8955-b4d3e18a9cfd'::uuid, ARRAY[5,6]::SMALLINT[]), -- THE HENZ CLUB (금토)
    ('ba6372ad-e921-48d4-9212-919ecd0181f5'::uuid, ARRAY[0,1,2,5,6]::SMALLINT[]), -- The Mansion (일월화금토)
    ('82ec2528-7118-40c8-87f2-1eaefc19c514'::uuid, ARRAY[4,5,6]::SMALLINT[]), -- Times (목금토)
    ('8d7c74c8-21a0-4b5b-9df2-8f49daeb0764'::uuid, ARRAY[5,6]::SMALLINT[]), -- vurt. (금토)
    ('85d91b4f-1e9d-4281-a8f7-400c22161e43'::uuid, ARRAY[0,3,4,5,6]::SMALLINT[]), -- XX (일수목금토)
    ('df39186b-b8b0-417f-beab-69a0cf748228'::uuid, ARRAY[5,6]::SMALLINT[]), -- XX2 (금토)
    ('93f1081a-250c-402a-a0d4-9b8a309aff57'::uuid, ARRAY[1,2,3,4,5,6]::SMALLINT[]), -- 도깨비 (월화수목금토)
    ('c6e747de-140f-4a76-857d-6ed51d09b217'::uuid, ARRAY[0,3,4,5,6]::SMALLINT[]), -- 아르쥬 청담 라운지 (일수목금토)
    ('2753139f-7b0e-439a-8216-c51fa8d5e52d'::uuid, ARRAY[0,1,2,3,4,5,6]::SMALLINT[]), -- 인클 서울 (일월화수목금토)
    ('41cdc939-dd08-4d15-bb6e-ad4ae94b6b26'::uuid, ARRAY[5,6]::SMALLINT[]) -- 코어라운지 (금토)
  ) AS v(id, dows)
 WHERE c.id = v.id
   AND c.open_dows IS NULL;
