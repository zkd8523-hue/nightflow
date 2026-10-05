-- 687: 수집 대상 재판정 — 라인업과 공연을 모두 기준으로
--
-- ⚠️ Migration 683 은 잘못된 기준으로 50곳을 껐다.
--
-- 683 은 성과를 `club_events`(밴드·공연) 로만 쟀다. 그런데 클럽은 밴드 공연을 올리지
-- 않는다 — DJ 라인업을 올리고 그건 `club_lineups` 에 쌓인다. 그래서 "12일간 0건" 으로
-- 보인 클럽들이 실제로는 라인업을 꾸준히 만들고 있었다.
--
-- 실측(2026-10-05):
--   수집 ON 29곳  → club_lineups 270건
--   683 이 끈 50곳 → club_lineups 365건   ← 끈 쪽이 더 많았다
--
-- 놓치던 곳: 라이온 슈퍼클럽 24 · Club Nasub 16 · Azit 15 · Times 14 · OCEAN 14 ·
--            Dawn 14 · Peach Lounge(수원) 13 — 경기권이 통째로 빠져 있었다
--
-- 이 누락은 뉴스레터에 직접 영향이 있다. 래퍼 게스트 공연(수원 클럽의 더콰이엇 같은)은
-- 도어 현매라 티켓 플랫폼에 없고, StagePick 888건에도 0건이다. 인스타가 유일한 소스인데
-- 정작 그 클럽들을 안 보고 있었다.
--
-- 새 기준: **club_lineups 2건 이상 OR club_events 1건 이상**.
--   두 번째 조건이 필요한 이유 — 와이키키(대전)는 라인업 1건뿐이지만 기리보이 등
--   래퍼 게스트 공연을 9건 올렸다. 라인업만 보면 이런 곳이 잘린다.
--
-- 비용 실측: 월 $3.64 → 약 $8. Starter $19 안에서 $11 남는다.

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS lineup_collect BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS lineup_post_limit SMALLINT NOT NULL DEFAULT 3;

-- 1) 라인업이든 공연이든 실적이 있는 곳을 켠다 (깊이는 계정별 실측 수신량)
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'boleroseoul';  -- 이태원 Bolero · 라인업 17 공연 46
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'grainhaus.seoul';  -- 이태원 Grain Haus · 라인업 13 공연 49
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'thehenzclub';  -- 홍대 THE HENZ CLUB · 라인업 13 공연 40
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'lionseoul';  -- 강남 Lion Super Club · 라인업 24 공연 20 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'nyapi_seoul';  -- 이태원 NYAPI · 라인업 29 공연 15
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'modeci_seoul';  -- 홍대 Modeci · 라인업 16 공연 23
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'orgasmvalley';  -- 강남 Orgasm Valley · 라인업 35 공연 1
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 5
  WHERE lower(replace(instagram, '@', '')) = 'hongdaeff';  -- 홍대 Club FF · 라인업 14 공연 20
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 5
  WHERE lower(replace(instagram, '@', '')) = 'cakeshopseoul';  -- 이태원 Cakeshop · 라인업 17 공연 11
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'soapseoul';  -- 이태원 Soap Seoul · 라인업 14 공연 11
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 4
  WHERE lower(replace(instagram, '@', '')) = 'sevens7_official_';  -- 대전 Sevens · 라인업 3 공연 18
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'breed_official';  -- 대구 브리드(BREED) · 라인업 17 공연 4
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'doze_seoul';  -- 홍대 Doze · 라인업 13 공연 7 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'timesapgu';  -- 강남 Times · 라인업 14 공연 5 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'shape.seoul';  -- 이태원 Shape · 라인업 9 공연 10
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'rosso_seoul';  -- 이태원 Rosso · 라인업 10 공연 8 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 5
  WHERE lower(replace(instagram, '@', '')) = 'clubazit__official';  -- 부산 Azit · 라인업 15 공연 2 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'dawn_itaewon';  -- 이태원 Dawn · 라인업 14 공연 3 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'clubnasub';  -- 부산 Club Nasub · 라인업 16 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'peachlounge';  -- 수원 Peach Lounge · 라인업 13 공연 3 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'vurt_seoul';  -- 홍대 vurt. · 라인업 11 공연 4
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'clubair_';  -- 대구 AIR · 라인업 13 공연 1
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 5
  WHERE lower(replace(instagram, '@', '')) = 'luka.seoul';  -- 강남 LUKA · 라인업 12 공연 2 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'hertz.sound';  -- 이태원 Hertz · 라인업 12 공연 2 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'club_ocean_official';  -- 홍대 OCEAN · 라인업 14 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'box_seoul';  -- 홍대 Box Seoul · 라인업 8 공연 6 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'club_loopy';  -- 대구 LOOPY · 라인업 9 공연 4
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'clubenter_official';  -- 수원 Club Enter · 라인업 11 공연 2
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'teller.seoul';  -- 이태원 Teller · 라인업 12 공연 1 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'color_apgu';  -- 강남 Color Apgu · 라인업 12 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'dibs_busan';  -- 부산 Dibs · 라인업 12 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 4
  WHERE lower(replace(instagram, '@', '')) = 'belpos_official';  -- 부산 BELPOS · 라인업 11 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'hongdae_xx';  -- 홍대 XX2 · 라인업 11 공연 0
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'mingindustrial';  -- 홍대 MING · 라인업 10 공연 1 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'jeje_busan';  -- 부산 JEJE · 라인업 1 공연 10
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'sanbu_sound';  -- 부산 Sanbu Sound Bar · 라인업 11 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'waikiki_daejeon';  -- 대전 Waikiki · 라인업 1 공연 9
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'another_hiphopclub';  -- 대전 Club Another · 라인업 2 공연 8 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'shelterseoul_';  -- 이태원 Shelter · 라인업 10 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'macaronifunkyclub';  -- 홍대 Macaroni Funky Club · 라인업 9 공연 1 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 5
  WHERE lower(replace(instagram, '@', '')) = 'veil_social_club';  -- 광주 Veil Social Club · 라인업 6 공연 3 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 4
  WHERE lower(replace(instagram, '@', '')) = 'dhell_official';  -- 대구 D.hell · 라인업 8 공연 1 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'frame__seoul';  -- 강남 Frame Seoul · 라인업 7 공연 2 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'bermuda_hongdae';  -- 홍대 CLUB BERMUDA · 라인업 6 공연 3 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'themansion_itaewon';  -- 이태원 The Mansion · 라인업 8 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'hive_itaewon';  -- 이태원 HIVE · 라인업 8 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'arzu.cheongdam';  -- 강남 아르쥬 청담 라운지 · 라인업 5 공연 2
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'flac.seoul';  -- 이태원 Flac Seoul · 라인업 7 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'club_dx_official';  -- 대전 DX · 라인업 1 공연 6 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'libertine_club_official';  -- 광주 Libertine · 라인업 6 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'round.hiphop';  -- 광주 Round Lounge · 라인업 4 공연 2
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'club_sabotage';  -- 홍대 Sabotage · 라인업 1 공연 5
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'sole_itaewon';  -- 이태원 SOLE · 라인업 6 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'muffin__official__';  -- 광주 Muffin · 라인업 3 공연 3 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'techno.in.hangang';  -- 부산 Techno In Hangang · 라인업 5 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 3
  WHERE lower(replace(instagram, '@', '')) = 'bbcb.seoul';  -- 이태원 BBCB · 라인업 5 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'ring.seoul';  -- 이태원 RING · 라인업 5 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'hongdae_xx';  -- 홍대 XX · 라인업 4 공연 0
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'groovenspot';  -- 부산 그루브&스팟 · 라인업 3 공연 1 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'muse.muse.seoul';  -- 강남 MUSE SEOUL · 라인업 3 공연 1 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 4
  WHERE lower(replace(instagram, '@', '')) = 'coreseoul';  -- 강남 Core Seoul · 라인업 3 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'outputbusan';  -- 부산 OUTPUT · 라인업 2 공연 1
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'thisisclub25';  -- 홍대 25 · 라인업 3 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'clubegg';  -- 대구 EGG · 라인업 2 공연 1 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'clubaceseoul_official';  -- 강남 Club Ace · 라인업 3 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'bat_itaewon';  -- 이태원 BAT · 라인업 2 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'gathering_itaewon';  -- 이태원 Gathering · 라인업 2 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'mad_itaewon';  -- 이태원 MAD · 라인업 2 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'roots.daegu';  -- 대구 ROOTS · 라인업 2 공연 0 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'glow._busan';  -- 부산 Glow · 라인업 0 공연 1 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'awesomered_omg';  -- 홍대 Awesome Red · 라인업 0 공연 1 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'melt_busan';  -- 부산 MELT · 라인업 0 공연 1 · 683에서 잘못 꺼짐
UPDATE clubs SET lineup_collect = true, lineup_post_limit = 2
  WHERE lower(replace(instagram, '@', '')) = 'hustle_hongdae';  -- 홍대 Hustle · 라인업 0 공연 1 · 683에서 잘못 꺼짐

-- 2) 라인업·공연 모두 없는 곳만 끈다. 클럽 상세·예약은 그대로이고 인스타 수집만 멈춘다.
UPDATE clubs SET lineup_collect = false
  WHERE lower(replace(instagram, '@', '')) IN (
    'hongdae_club.jam', 'atension', 'clubauracokr', 'badass_itaewon_',
    'diss_hongdae', 'club_bbadda_official', 'b1_hongdae', 'hype_seoul',
    'club_dokkaebi_official', 'hilo.dosan', 'offtherecorditaewon', 'add_hongdae',
    'plus82seoul', 'hitthebeach2020', 'daynight_itaewon', 'sinkhole_official_',
    'fountain_itaewon', 'clubnb_official', 'poselounge_itaewon', 'clubpurple_hongdae',
    'oops.daegu', 'creambasement', 'larosa_korea', 'dmseoul',
    'sohoseoul_', 'sxseoul', 'partynextdoor_pub', 'labamba_hongdae',
    'deeper_itaewon'
  );

-- 확인:
--   SELECT count(*) FILTER (WHERE lineup_collect) FROM clubs
--   WHERE status='approved' AND NOT is_test AND deleted_at IS NULL;
--   → 73 근처여야 한다.
