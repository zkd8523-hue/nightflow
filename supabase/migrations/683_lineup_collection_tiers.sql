-- 683: 라인업 수집 대상·깊이를 실측 성과로 조정
--
-- 배경: 2026-08-26~09-23 수집 12일치(collection_account_results 1,519행)를 집계한 결과,
-- 감시 중인 101곳 가운데 **공연을 한 건이라도 만들어낸 곳은 32곳뿐**이었다.
-- 나머지 69곳은 12일 동안 글 1,269개를 사들이고(= $2.92, 월 환산 $7.30)
-- 공연 0건을 남겼다. 이 69곳을 빼도 잃는 공연은 0건이다.
--
-- 그래서 clubs 에 수집용 컬럼 두 개를 둔다. 코드가 아니라 데이터로 관리해야
-- 클럽이 추가·삭제돼도 Edge Function 을 다시 배포하지 않는다.
--
--   lineup_collect      수집 대상인가 (false = 건너뜀)
--   lineup_post_limit   이 계정에서 한 번에 받아올 글 수
--
-- post_limit 을 계정마다 따로 두는 이유: Apify 는 **받은 글 수만큼 과금**한다
-- ($0.0023/건). 고정글이 적고 드물게 올리는 계정에 limit 5 를 주면 빈자리를
-- 남의 글로 채워 그것까지 청구된다(2026-09-26 실측). 아래 값은 계정별
-- "런당 실제 받은 글 수"에서 올림한 것이다.
--
-- ⚠️ 요일 기반 건너뛰기는 **하지 않는다.** 공연은 금·토(243/343건)에 몰리지만
--    클럽이 라인업을 올리는 요일은 화 229건·수 234건으로 오히려 주중이 가장 많다.
--    공연 없는 날에 주말 공지를 올리기 때문이다. 화·수를 건너뛰면 가장 중요한
--    날을 놓친다. (드래프트 1,153건의 업로드 시각 KST 기준 집계)

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS lineup_collect BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS lineup_post_limit SMALLINT NOT NULL DEFAULT 3;

COMMENT ON COLUMN clubs.lineup_collect IS
  '인스타 라인업 자동 수집 대상 여부. false 면 collect-club-events 가 건너뛴다.';
COMMENT ON COLUMN clubs.lineup_post_limit IS
  '한 번에 받아올 인스타 글 수. Apify 가 받은 글 수만큼 과금하므로 계정별로 다르다.';

-- 1) 성과 있는 32곳: 켜두고 실측 기반 깊이를 준다

UPDATE clubs SET lineup_collect = true, lineup_post_limit = 5
  WHERE lower(replace(instagram, '@', '')) = 'festivalfestivalseoul';  -- 공연 33건 · 런당 4.3글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 4
  WHERE lower(replace(instagram, '@', '')) = 'rollinghall';  -- 공연 19건 · 런당 2.5글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'hiphopplayacalendar';  -- 공연 18건 · 런당 1.6글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 5
  WHERE lower(replace(instagram, '@', '')) = 'hongdaeff';  -- 공연 10건 · 런당 4.0글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 5
  WHERE lower(replace(instagram, '@', '')) = 'cakeshopseoul';  -- 공연 8건 · 런당 4.1글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'musinsagarage';  -- 공연 6건 · 런당 1.1글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'shape.seoul';  -- 공연 4건 · 런당 1.5글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'waikiki_daejeon';  -- 공연 3건 · 런당 0.7글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'arzu.cheongdam';  -- 공연 3건 · 런당 2.3글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'clubenter_official';  -- 공연 3건 · 런당 1.1글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'boleroseoul';  -- 공연 3건 · 런당 2.2글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 5
  WHERE lower(replace(instagram, '@', '')) = 'sevens7_official_';  -- 공연 3건 · 런당 3.6글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'hongdae_xx';  -- 공연 2건 · 런당 0.7글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'grainhaus.seoul';  -- 공연 2건 · 런당 1.9글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'vurt_seoul';  -- 공연 2건 · 런당 2.4글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 4
  WHERE lower(replace(instagram, '@', '')) = 'breed_official';  -- 공연 2건 · 런당 2.6글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'thehenzclub';  -- 공연 2건 · 런당 1.4글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'club_sabotage';  -- 공연 2건 · 런당 0.7글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'clubair_';  -- 공연 2건 · 런당 1.4글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'jeje_busan';  -- 공연 2건 · 런당 0.8글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'seendosi';  -- 공연 2건 · 런당 0.7글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'pcitykorea';  -- 공연 2건 · 런당 1.8글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'modeci_seoul';  -- 공연 1건 · 런당 2.2글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'outputbusan';  -- 공연 1건 · 런당 0.5글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'hilo.dosan';  -- 공연 1건 · 런당 0.9글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'round.hiphop';  -- 공연 1건 · 런당 1.0글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'club_loopy';  -- 공연 1건 · 런당 1.6글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'orgasmvalley';  -- 공연 1건 · 런당 1.4글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'nyapi_seoul';  -- 공연 1건 · 런당 2.2글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'soapseoul';  -- 공연 1건 · 런당 2.0글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'spacebrickkorea';  -- 공연 1건 · 런당 0.1글
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = '101breaktime';  -- 공연 1건 · 런당 0.3글

-- 2) 12일간 공연 0건인 93곳: 수집에서 제외
--    클럽 자체를 지우는 게 아니다. 상세 페이지·예약은 그대로 살아 있고
--    인스타 수집만 멈춘다. 수동 입력(reference_manual_lineup_entry_sop)은 계속 가능하다.
UPDATE clubs SET lineup_collect = false
  WHERE lower(replace(instagram, '@', '')) IN (
    'groovenspot', 'daynight_itaewon', 'club_ocean_official', 'glow._busan',
    'libertine_club_official', 'hongdae_club.jam', 'atension', 'add_hongdae',
    'teller.seoul', 'offtherecorditaewon', 'larosa_korea', 'lionseoul',
    'hitthebeach2020', 'badass_itaewon_', 'clubauracokr', 'rosso_seoul',
    'timesapgu', 'club_dx_official', 'sinkhole_official_', 'thisisclub25',
    'another_hiphopclub', 'bat_itaewon', 'mad_itaewon', 'gathering_itaewon',
    'clubnb_official', 'hive_itaewon', 'diss_hongdae', 'b1_hongdae',
    'techno.in.hangang', 'luka.seoul', 'veil_social_club', 'dawn_itaewon',
    'clubaceseoul_official', 'clubpurple_hongdae', 'mingindustrial', 'awesomered_omg',
    'muse.muse.seoul', 'plus82seoul', 'coreseoul', 'international_club_offi',
    'club_kbat_official', 'dhell_official', 'clubnasub', 'doze_seoul',
    'sohoseoul_', 'frame__seoul', 'roots.daegu', 'shelterseoul_',
    'color_apgu', 'hype_seoul', 'creambasement', 'clubegg',
    'oops.daegu', 'sanbu_sound', 'melt_busan', 'sole_itaewon',
    'bbcb_seoul', 'hertz.sound', 'hustle_hongdae', 'club_dokkaebi_official',
    'dmseoul', 'muffin__official__', 'clubau_official', 'deeper_itaewon',
    'themansion_itaewon', 'ring.seoul', 'belpos_official', 'dibs_busan',
    'partynextdoor_pub', 'sxseoul', 'clubazit__official', 'peachlounge',
    'fountain_itaewon', 'labamba_hongdae', 'poselounge_itaewon', 'box_seoul',
    'bermuda_hongdae', 'macaronifunkyclub', 'flac.seoul', 'club_bbadda_official',
    'bbcb.seoul', 'luvluvluv.seoul', 'jjmahoneys_seoul', 'villa_records_bar',
    'soyo.kr', 'clubau', 'bunkr02', 'pcitychroma',
    'rap_house_official', 'manhattan_records_seoul', 'lowkeyseoul', 'seanxx_official',
    'xx.noise_lounge'
  );

-- 3) 목록에 없던 신규 클럽은 기본값(수집 on, limit 3)으로 들어온다.
--    한 달 뒤 collection_account_results 로 다시 집계해 성과 없는 곳을 끈다.

-- ── club_name_registry 쪽 ────────────────────────────────────────────────
--
-- 수집 대상은 clubs 뿐 아니라 club_name_registry 에서도 온다(공연장·페스티벌은
-- 클럽으로 등록돼 있지 않다). 생산 1·2위인 축제(공연 33건)·롤링홀(19건)이
-- 바로 여기 있어서, clubs 만 고치면 이들 설정이 통째로 안 먹는다.
ALTER TABLE club_name_registry
  ADD COLUMN IF NOT EXISTS lineup_collect BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS lineup_post_limit SMALLINT NOT NULL DEFAULT 3;

COMMENT ON COLUMN club_name_registry.lineup_collect IS
  '인스타 라인업 자동 수집 대상 여부. clubs.lineup_collect 와 같은 뜻이다.';
COMMENT ON COLUMN club_name_registry.lineup_post_limit IS
  '한 번에 받아올 인스타 글 수. Apify 가 받은 글 수만큼 과금한다.';

-- 성과 있는 곳: 실측 기반 깊이
UPDATE club_name_registry SET lineup_collect = true, lineup_post_limit = 5
  WHERE lower(replace(instagram_handle, '@', '')) = 'festivalfestivalseoul';
UPDATE club_name_registry SET lineup_collect = true, lineup_post_limit = 4
  WHERE lower(replace(instagram_handle, '@', '')) = 'rollinghall';
UPDATE club_name_registry SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram_handle, '@', '')) = 'musinsagarage';
UPDATE club_name_registry SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram_handle, '@', '')) = 'seendosi';
UPDATE club_name_registry SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram_handle, '@', '')) = 'pcitykorea';
UPDATE club_name_registry SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram_handle, '@', '')) = 'spacebrickkorea';
UPDATE club_name_registry SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram_handle, '@', '')) = '101breaktime';

-- registry 에만 있고 위 목록에 없는 핸들은 12일간 공연 0건이었다 → 끈다.
-- (clubs 에도 있는 핸들은 clubs 쪽 설정이 우선이므로 여기서 건드려도 무해하다.)
UPDATE club_name_registry SET lineup_collect = false
  WHERE lower(replace(instagram_handle, '@', '')) NOT IN (
    'festivalfestivalseoul', 'rollinghall', 'musinsagarage', 'seendosi', 'pcitykorea', 'spacebrickkorea', '101breaktime'
  )
  AND lower(replace(instagram_handle, '@', '')) NOT IN (
    SELECT lower(replace(instagram, '@', '')) FROM clubs
    WHERE lineup_collect = true AND instagram IS NOT NULL AND instagram <> ''
  );

CREATE INDEX IF NOT EXISTS idx_registry_lineup_collect
  ON club_name_registry (lineup_collect) WHERE lineup_collect = true;

CREATE INDEX IF NOT EXISTS idx_clubs_lineup_collect
  ON clubs (lineup_collect) WHERE lineup_collect = true;
