-- 624: DJ 이상형 월드컵 — 해외/국내 스타 DJ 후보 추가
--
-- 배경
--   dj-cup 후보 153명은 국내 클럽 라인업 포스터 수집(557+614)에서 자연히
--   쌓인 부분집합이라 전부 언더그라운드/레지던트 DJ다. 스타 DJ(DJ소다,
--   Peggy Gou, DJ Mag Top 100 DJs 2025 상위권 등)는 국내 포스터에 안 뜨므로
--   이 경로를 타지 않는다 — 여기서 djs 테이블에 수동으로 추가한다.
--
--   soundcloud_url이 없는 스타 DJ가 많아(레이블 계약상 믹스셋 비공개) 대신
--   공식 유튜브 대표곡 뮤직비디오 URL을 youtube_url에 넣는다. dj-cup 후보
--   필터(src/app/(main)/dj-cup/page.tsx, youtubeVideoId())는 watch?v=/
--   youtu.be/embed 형식의 "개별 영상" URL만 인정하고 채널 URL은 임베드가
--   막혀 있어 걸러진다 — 그래서 여기 넣는 값은 전부 워치 URL이다.
--
--   resident_club_id는 NULL — 특정 클럽 전속이 아닌 글로벌/게스트 DJ.
--   총 102명: 국내외 아이콘급 20명(직접 선정) + DJ Mag Top 100 DJs 2025
--   11~100위 중 겹치지 않는 78명 + 국내 EDM 프로듀서 2명(Yultron, Raiden).
--   순위 정보는 WebFetch(djmag.com/top100djs)로 실제 확인한 값이며, 유튜브
--   URL은 전부 검색 결과에서 그대로 가져온 값(11자리 영상 ID 검증 완료)이다.

INSERT INTO djs (display_name, slug, instagram, youtube_url, bio, is_test)
VALUES
  -- 한국계 스타
  ('DJ SODA', 'dj-soda', 'djsoda', 'https://www.youtube.com/watch?v=DjNJm9WBaY8', '한국 출신 글로벌 페스티벌 DJ. 국내외 대형 페스티벌 헤드라이너.', false),
  ('Peggy Gou', 'peggy-gou', 'peggygou_', 'https://www.youtube.com/watch?v=kD0en6bbJPI', '한국 출신 글로벌 하우스 DJ/프로듀서. "Starry Night", "It Makes You Forget" 등.', false),

  -- DJ Mag Top 100 DJs 2025 상위권 (EDM 메인스테이지)
  ('David Guetta', 'david-guetta', 'davidguetta', 'https://www.youtube.com/watch?v=90RLzVUuXe4', 'DJ Mag Top 100 DJs 2025 1위. "Titanium", "I''m Good (Blue)" 등.', false),
  ('Martin Garrix', 'martin-garrix', 'martingarrix', 'https://www.youtube.com/watch?v=IPYTxAHeR_o', 'DJ Mag Top 100 DJs 2025 2위. "Animals", "In The Name Of Love" 등.', false),
  ('Alok', 'alok', 'alok', 'https://www.youtube.com/watch?v=zDy8K0o_ksA', 'DJ Mag Top 100 DJs 2025 3위. 브라질 출신 글로벌 DJ.', false),
  ('Dimitri Vegas & Like Mike', 'dimitri-vegas-like-mike', 'dimitrivegaslikemike', 'https://www.youtube.com/watch?v=yldN7geOZfc', 'DJ Mag Top 100 DJs 2025 4위. 벨기에 출신 듀오. "Mammoth" 등.', false),
  ('Timmy Trumpet', 'timmy-trumpet', 'timmytrumpet', 'https://www.youtube.com/watch?v=fmQxJzhR_48', 'DJ Mag Top 100 DJs 2025 6위. 호주 출신, 라이브 트럼펫 연주 DJ. "Freaks" 등.', false),
  ('FISHER', 'fisher', 'fishletmusic', 'https://www.youtube.com/watch?v=wE8Az1EV6UQ', 'DJ Mag Top 100 DJs 2025 7위. 호주 출신 테크하우스 DJ. "Losing It" 등.', false),
  ('Afrojack', 'afrojack', 'afrojack', 'https://www.youtube.com/watch?v=TUoOcDGMgT4', 'DJ Mag Top 100 DJs 2025 8위. 네덜란드 출신 프로듀서. "Take Over Control" 등.', false),
  ('Anyma', 'anyma', 'anyma', 'https://www.youtube.com/watch?v=DnTC2P9kxO8', 'DJ Mag Top 100 DJs 2025 10위. 이탈리아 출신, 멜로딕 테크노/EDM 크로스오버. "Bad Angel" 등.', false),
  ('Alan Walker', 'alan-walker', 'alanwalkermusic', 'https://www.youtube.com/watch?v=c_a3IQFX6v0', '노르웨이 출신 EDM 프로듀서. "Faded" 등 빌보드 차트 히트곡 다수.', false),

  -- 베이스/트랩/덥스텝
  ('Skrillex', 'skrillex', 'skrillex', 'https://www.youtube.com/watch?v=B5OD-MCBqnw', '덥스텝의 대명사. "Scary Monsters and Nice Sprites", "Bangarang" 등. 그래미 다수 수상.', false),
  ('Marshmello', 'marshmello', 'marshmellomusic', 'https://www.youtube.com/watch?v=ALZHF5UqnU4', '헬멧을 쓴 정체불명 콘셉트의 글로벌 EDM DJ. "Alone" 등.', false),
  ('Diplo', 'diplo', 'diplo', 'https://www.youtube.com/watch?v=UFRyNEldHns', '메이저 레이저 멤버, 프로듀서/DJ. "Set Me Free", "Revolution" 등.', false),
  ('Zedd', 'zedd', 'zedd', 'https://www.youtube.com/watch?v=l9Q7GISatW0', '독일 출신 프로듀서. "Clarity" 등 그래미 수상 히트곡.', false),

  -- 테크노/트랜스
  ('Armin van Buuren', 'armin-van-buuren', 'arminvanbuuren', 'https://www.youtube.com/watch?v=BR_DFMUzX4E', 'DJ Mag Top 100 DJs 2025 5위. 트랜스의 대명사. "This Is What It Feels Like" 등.', false),
  ('Charlotte de Witte', 'charlotte-de-witte', 'charlottedewitte', 'https://www.youtube.com/watch?v=fjnSF0K70q4', 'DJ Mag Top 100 DJs 2025 9위. 벨기에 출신 테크노 DJ. KNTXT 레이블 설립자.', false),
  ('Amelie Lens', 'amelie-lens', 'amelie_lens', 'https://www.youtube.com/watch?v=Ww8xnwwDrv0', '벨기에 출신 테크노 DJ. EXHALE 레이블 설립자.', false),

  -- 멀티장르 헤드라이너
  ('Tiësto', 'tiesto', 'tiesto', 'https://www.youtube.com/watch?v=nCg3ufihKyU', '네덜란드 출신, 트랜스에서 EDM/팝 크로스오버까지 아우르는 레전드. "The Business" 등.', false),
  ('Calvin Harris', 'calvin-harris', 'calvinharris', 'https://www.youtube.com/watch?v=DkeiKbqa02g', '스코틀랜드 출신 프로듀서/DJ. "Summer", "One Kiss" 등.', false),

  -- DJ Mag Top 100 DJs 2025 11~100위 나머지 + 국내 EDM 프로듀서 2명
  ('Vintage Culture', 'vintage-culture', 'vintageculture', 'https://www.youtube.com/watch?v=yEKqAaRunx0', '브라질 출신 DJ, DJ Mag 2025 11위, 대표곡 ''Hollywood''', false),
  ('Don Diablo', 'don-diablo', 'dondiablo', 'https://www.youtube.com/watch?v=hHFymqAf-Zo', '네덜란드 DJ, DJ Mag 2025 13위, Future House 장르 개척자', false),
  ('Steve Aoki', 'steve-aoki', 'steveaoki', 'https://www.youtube.com/watch?v=Bfmnx32LWWA', '미국 DJ, DJ Mag 2025 14위, Dim Mak 레이블 설립자', false),
  ('Hardwell', 'hardwell', 'hardwell', 'https://www.youtube.com/watch?v=ppy-fgbPn2s', '네덜란드 DJ, DJ Mag 2025 15위, 대표곡 ''Spaceman''', false),
  ('Black Coffee', 'black-coffee', 'official_blackcoffee', 'https://www.youtube.com/watch?v=17zOUL27cJk', '남아프리카공화국 출신 DJ, DJ Mag 2025 17위, 그래미 수상', false),
  ('W&W', 'ww', 'wandwmusic', 'https://www.youtube.com/watch?v=a5V-U-q7UVo', '네덜란드 듀오 DJ, DJ Mag 2025 18위, 대표곡 ''Bigfoot''', false),
  ('Lost Frequencies', 'lost-frequencies', 'lostfrequencies', 'https://www.youtube.com/watch?v=VjHMDlAPMUw', '벨기에 DJ, DJ Mag 2025 19위, 대표곡 ''Are You With Me''', false),
  ('Keinemusik', 'keinemusik', 'keinemusikcrue', 'https://www.youtube.com/watch?v=u209Fbn1pbo', '독일 베를린 기반 DJ 콜렉티브/레이블, DJ Mag 2025 20위', false),
  ('Reinier Zonneveld', 'reinier-zonneveld', 'reinierzonneveld', 'https://www.youtube.com/watch?v=38szcJnMjcY', '네덜란드 테크노 DJ, DJ Mag 2025 22위', false),
  ('KSHMR', 'kshmr', 'kshmr', 'https://www.youtube.com/watch?v=ux9vr4xfWj4', '미국 DJ, DJ Mag 2025 23위, 대표곡 ''Wildcard''', false),
  ('Carl Cox', 'carl-cox', 'carlcoxofficial', 'https://www.youtube.com/watch?v=51GyVpKDiGU', '영국 테크노 DJ 대부, DJ Mag 2025 25위', false),
  ('Oliver Heldens', 'oliver-heldens', 'oliverheldens', 'https://www.youtube.com/watch?v=kcZMCMI24gs', '네덜란드 DJ, DJ Mag 2025 26위, 대표곡 ''Gecko (Overdrive)''', false),
  ('Jamie Jones', 'jamie-jones', NULL, 'https://www.youtube.com/watch?v=oO38vewDRxU', '웨일스 출신 DJ, DJ Mag 2025 27위, 대표곡 ''My Paradise''', false),
  ('R3hab', 'r3hab', 'r3hab', 'https://www.youtube.com/watch?v=R1bZgnOLizo', '네덜란드계 모로코 DJ, DJ Mag 2025 28위', false),
  ('Nicky Romero', 'nicky-romero', 'nickyromero', 'https://www.youtube.com/watch?v=aYtYu1THEVI', '네덜란드 DJ, DJ Mag 2025 29위, 대표곡 ''Toulouse''', false),
  ('Claptone', 'claptone', 'claptone.official', 'https://www.youtube.com/watch?v=jOHL5y-h-eg', '독일 출신 가면 DJ, DJ Mag 2025 30위', false),
  ('Vini Vici', 'vini-vici', 'vinivicimusic', 'https://www.youtube.com/watch?v=LCJ1NPgvsdA', '이스라엘 사이키델릭 트랜스 듀오, DJ Mag 2025 32위', false),
  ('Fred again..', 'fred-again', 'fredagainagainagainagainagain', 'https://www.youtube.com/watch?v=7exVPb0_KL8', '영국 DJ/프로듀서, DJ Mag 2025 33위', false),
  ('Swedish House Mafia', 'swedish-house-mafia', 'swedishhousemafia', 'https://www.youtube.com/watch?v=1y6smkh6c-0', '스웨덴 DJ 트리오, DJ Mag 2025 34위', false),
  ('Joel Corry', 'joel-corry', 'joelcorry', 'https://www.youtube.com/watch?v=-EpVqICGFuw', '영국 DJ, DJ Mag 2025 35위', false),
  ('Indira Paganotto', 'indira-paganotto', 'indirapaganotto', 'https://www.youtube.com/watch?v=g-T8624a0h0', 'DJ Mag 2025 36위, 스페인 출신 사이키델릭 테크노 프로듀서', false),
  ('Eric Prydz', 'eric-prydz', 'ericprydz', 'https://www.youtube.com/watch?v=zWv8MJBTcyE', 'DJ Mag 2025 37위, 스웨덴 출신 프로그레시브 하우스 거장, 대표곡 "Opus"', false),
  ('Paul van Dyk', 'paul-van-dyk', 'paulvandyk', 'https://www.youtube.com/watch?v=1BUk1q-NKtY', 'DJ Mag 2025 39위, 독일 트랜스 씬의 전설', false),
  ('DJ Snake', 'dj-snake', 'djsnake', 'https://www.youtube.com/watch?v=HMUDVMiITOU', 'DJ Mag 2025 40위, 프랑스 출신 프로듀서, 대표곡 "Turn Down for What"', false),
  ('Dom Dolla', 'dom-dolla', 'domdolla', 'https://www.youtube.com/watch?v=U6Xz8foh7XQ', 'DJ Mag 2025 41위, 호주 출신 테크하우스 프로듀서', false),
  ('The Martinez Brothers', 'the-martinez-brothers', 'themartinezbros', 'https://www.youtube.com/watch?v=KM0hLHkWiXk', 'DJ Mag 2025 43위, 뉴욕 브롱크스 출신 하우스 듀오', false),
  ('Bassjackers', 'bassjackers', 'bassjackers', 'https://www.youtube.com/watch?v=kzAzyH6dG8o', 'DJ Mag 2025 45위, 네덜란드 출신 빅룸/일렉트로 하우스 듀오', false),
  ('John Summit', 'john-summit', 'johnsummit', 'https://www.youtube.com/watch?v=J5pEHqOn7i0', 'DJ Mag 2025 46위, 미국 시카고 출신 테크하우스 프로듀서', false),
  ('Quintino', 'quintino', 'quintino', 'https://www.youtube.com/watch?v=jDrqb5xQwN4', 'DJ Mag 2025 47위, 네덜란드 출신 빅룸 하우스 프로듀서', false),
  ('Michael Bibi', 'michael-bibi', 'michael_bibi_', 'https://www.youtube.com/watch?v=g8oADIuyWYU', 'DJ Mag 2025 48위, 영국 출신 테크하우스 프로듀서', false),
  ('Boris Brejcha', 'boris-brejcha', 'borisbrejcha', 'https://www.youtube.com/watch?v=iSsG5DuOlQ0', 'DJ Mag 2025 49위, 독일 출신 하이테크 미닛 테크노 창시자', false),
  ('Korolova', 'korolova', 'korolova.dj', 'https://www.youtube.com/watch?v=ymOx9TIDREU', 'DJ Mag 2025 50위, 우크라이나 출신 멜로딕 테크노 프로듀서', false),
  ('Alesso', 'alesso', 'alesso', 'https://www.youtube.com/watch?v=K0-VU9cti0g', 'DJ Mag 2025 51위, 스웨덴 출신 프로그레시브 하우스 프로듀서', false),
  ('James Hype', 'james-hype', 'jameshype', 'https://www.youtube.com/watch?v=1j2IfI9FW90', 'DJ Mag 2025 52위, 영국 출신 테크하우스 프로듀서', false),
  ('Maddix', 'maddix', 'maddixmusic', 'https://www.youtube.com/watch?v=0U-_CVq2GfU', 'DJ Mag 2025 53위, 네덜란드 출신 테크노/레이브 프로듀서', false),
  ('HUGEL', 'hugel', 'hugelthug', 'https://www.youtube.com/watch?v=PM_vom0emsk', 'DJ Mag 2025 54위, 프랑스 출신 하우스 프로듀서', false),
  ('Solomun', 'solomun', 'solomun', 'https://www.youtube.com/watch?v=5Fc9A6mLHJU', 'DJ Mag 2025 55위, 보스니아 출신 딥하우스 거장', false),
  ('Mochakk', 'mochakk', 'mochakk', 'https://www.youtube.com/watch?v=4iKfR3UBDpQ', 'DJ Mag 2025 56위, 브라질 출신 하우스 DJ', false),
  ('Lilly Palmer', 'lilly-palmer', 'lilly_palmerdj', 'https://www.youtube.com/watch?v=WUZ6YatesjY', 'DJ Mag 2025 57위, 독일 출신 테크노 프로듀서', false),
  ('Nora En Pure', 'nora-en-pure', 'noraenpure', 'https://www.youtube.com/watch?v=0ejKRXKrBjg', 'DJ Mag 2025 58위, 스위스 출신 딥하우스 프로듀서', false),
  ('ATB', 'atb', 'atbandre', 'https://www.youtube.com/watch?v=5A9OIIapSko', '독일 출신 트랜스 DJ, DJ Mag 59위, 대표곡 "9PM (Till I Come)"', false),
  ('Deborah De Luca', 'deborah-de-luca', 'deborahdeluca', 'https://www.youtube.com/watch?v=X45abjKq39A', '이탈리아 테크노 DJ, DJ Mag 60위', false),
  ('Above & Beyond', 'above-and-beyond', 'aboveandbeyond', 'https://www.youtube.com/watch?v=ll5ykbAumD4', '영국 트랜스 DJ 트리오, DJ Mag 61위', false),
  ('Sara Landry', 'sara-landry', 'saralandrydj', 'https://www.youtube.com/watch?v=EPCu7vvS2uY', '미국 출신 하드 테크노 DJ, DJ Mag 62위', false),
  ('Nervo', 'nervo', 'nervomusic', 'https://www.youtube.com/watch?v=DKdeBpn6PRw', '호주 쌍둥이 자매 DJ 듀오, DJ Mag 63위', false),
  ('Sub Zero Project', 'sub-zero-project', 'subzeroproject', 'https://www.youtube.com/watch?v=hlr0dKBU-Gs', '네덜란드 하드스타일 듀오, DJ Mag 64위', false),
  ('Kölsch', 'kolsch', 'kolschofficial', 'https://www.youtube.com/watch?v=IrvRK9UW_Vk', '덴마크 출신 프로그레시브 하우스 DJ, DJ Mag 65위', false),
  ('Lucas & Steve', 'lucas-and-steve', 'lucasandsteve', 'https://www.youtube.com/watch?v=84bv7WV0SGo', '네덜란드 프로그레시브 하우스 듀오, DJ Mag 66위', false),
  ('Nico Moreno', 'nico-moreno', 'nicomoreno_music', 'https://www.youtube.com/watch?v=4np-Qz7NbzE', '프랑스 출신 인더스트리얼 하드 테크노 DJ, DJ Mag 67위', false),
  ('GORDO', 'gordo', NULL, 'https://www.youtube.com/watch?v=1lXPa-DgUX0', '미국 DJ(전 Carnage), DJ Mag 68위', false),
  ('PAWSA', 'pawsa', 'pawsaofficial', 'https://www.youtube.com/watch?v=71pEDGmcllM', '영국 런던 출신 테크하우스 DJ, DJ Mag 69위', false),
  ('The Chainsmokers', 'the-chainsmokers', 'thechainsmokers', 'https://www.youtube.com/watch?v=0zGcUoRlhmw', '미국 프로듀서 듀오, DJ Mag 70위', false),
  ('Liu', 'liu', NULL, 'https://www.youtube.com/watch?v=-R3AYMx-8gk', '브라질 출신 하우스/테크하우스 DJ, DJ Mag 71위', false),
  ('Mike Williams', 'mike-williams', 'mikewilliams', 'https://www.youtube.com/watch?v=jh-uM1V1wCQ', '네덜란드 빅룸/퓨처 하우스 DJ, DJ Mag 72위', false),
  ('ARTBAT', 'artbat', 'artbatmusic', 'https://www.youtube.com/watch?v=50zeHzEwgoI', '우크라이나 멜로딕 테크노 듀오, DJ Mag 73위', false),
  ('KAAZE', 'kaaze', 'iamkaaze', 'https://www.youtube.com/watch?v=CtXGtXyRvgI', '스웨덴 빅룸/전자음악 DJ, DJ Mag 74위', false),
  ('Miss Monique', 'miss-monique', 'djmissmonique', 'https://www.youtube.com/watch?v=wp7l4pbqsFo', '우크라이나 멜로딕 테크노 DJ, DJ Mag 75위', false),
  ('Burak Yeter', 'burak-yeter', 'burakyeter', 'https://www.youtube.com/watch?v=Y1_VsyLAGuk', '터키 출신 프로듀서, DJ Mag 76위', false),
  ('Mau P', 'mau-p', 'maup', 'https://www.youtube.com/watch?v=juuIhW8V1Xw', '네덜란드 테크하우스 DJ, DJ Mag 77위', false),
  ('Le Twins', 'le-twins', 'officialletwins', 'https://www.youtube.com/watch?v=HW6tC0a038k', '멕시코 몬테레이 출신 쌍둥이 자매 DJ 듀오, DJ Mag 78위', false),
  ('I Hate Models', 'i-hate-models', 'ihatemodels1', 'https://www.youtube.com/watch?v=Oo9d1xo9xpk', '프랑스 테크노 DJ, DJ Mag 2025 79위', false),
  ('Marnik', 'marnik', 'marnikofficial', 'https://www.youtube.com/watch?v=oJa7Kr7_9dw', '벨기에 프로그레시브 하우스 DJ, DJ Mag 2025 80위', false),
  ('Chris Stussy', 'chris-stussy', 'chrisstussydj', 'https://www.youtube.com/watch?v=J333E2rDY3o', '네덜란드 하우스 DJ, DJ Mag 2025 81위', false),
  ('Deadmau5', 'deadmau5', 'deadmau5', 'https://www.youtube.com/watch?v=4ky-gventQo', '캐나다 프로그레시브 하우스 전설, DJ Mag 2025 82위', false),
  ('Fedde Le Grand', 'fedde-le-grand', NULL, 'https://www.youtube.com/watch?v=HcpmgQPFTTs', '네덜란드 하우스 DJ, DJ Mag 2025 84위', false),
  ('Ferry Corsten', 'ferry-corsten', 'ferrycorsten', 'https://www.youtube.com/watch?v=51hU717Eakc', '네덜란드 트랜스 DJ, DJ Mag 2025 85위', false),
  ('Plastik Funk', 'plastik-funk', 'plastikfunk', 'https://www.youtube.com/watch?v=T83D1esTkek', '독일 하우스 듀오, DJ Mag 2025 86위', false),
  ('DubVision', 'dubvision', 'dubvision', 'https://www.youtube.com/watch?v=CkkbaDsAu0M', '네덜란드 프로그레시브 하우스 듀오, DJ Mag 2025 87위', false),
  ('B Jones', 'b-jones', 'bjonesdj', 'https://www.youtube.com/watch?v=xagV6LQAiqQ', '미국 여성 EDM DJ, DJ Mag 2025 88위', false),
  ('Giuseppe Ottaviani', 'giuseppe-ottaviani', 'giuseppeottaviani', 'https://www.youtube.com/watch?v=y8GNDDxElz4', '이탈리아 트랜스 DJ, DJ Mag 2025 89위', false),
  ('Cuebrick', 'cuebrick', 'cuebrick_dj', 'https://www.youtube.com/watch?v=jT3X0LijsIk', '독일 댄스 프로듀서, DJ Mag 2025 90위', false),
  ('Mariana Bo', 'mariana-bo', 'djmarianabo', 'https://www.youtube.com/watch?v=UUusFDXfA-o', '멕시코 테크노 DJ, DJ Mag 2025 91위', false),
  ('MEDUZA', 'meduza', NULL, 'https://www.youtube.com/watch?v=KE2SSftvFU4', '이탈리아 하우스 트리오, DJ Mag 2025 92위', false),
  ('VINAI', 'vinai', 'vinaiofficial', 'https://www.youtube.com/watch?v=oPVTuCt2NF0', '이탈리아 형제 빅룸/EDM 듀오, DJ Mag 2025 94위', false),
  ('Chris Lake', 'chris-lake', 'chrislake', 'https://www.youtube.com/watch?v=lFREEtKRGr0', '영국 테크 하우스 DJ, DJ Mag 2025 95위', false),
  ('Faustix', 'faustix', 'faustix', 'https://www.youtube.com/watch?v=gwih6iC7-dY', '미국 EDM 프로듀서, DJ Mag 2025 96위', false),
  ('Honey Dijon', 'honey-dijon', 'honeydijon', 'https://www.youtube.com/watch?v=s20SXULLg7g', '미국 시카고 출신 하우스 DJ, DJ Mag 2025 97위', false),
  ('Nils van Zandt', 'nils-van-zandt', 'nilsvanzandt', 'https://www.youtube.com/watch?v=b1K5lldpoiU', '벨기에 EDM DJ, DJ Mag 2025 98위', false),
  ('Topic', 'topic', 'topic', 'https://www.youtube.com/watch?v=JZtcHk9XBaE', '독일 댄스 프로듀서, DJ Mag 2025 99위', false),
  ('Marlon Hoffstadt', 'marlon-hoffstadt', 'marlonhoffstadt', 'https://www.youtube.com/watch?v=tny4BjfU9hY', '독일 DJ, DJ Mag 2025 100위', false),
  ('Yultron', 'yultron', 'yultron', 'https://www.youtube.com/watch?v=M2zrC1QF7Zo', '한국 EDM 프로듀서, 박재범과의 협업으로 유명', false),
  ('Raiden', 'raiden', 'dj_raiden_', 'https://www.youtube.com/watch?v=N2dsnGc7TFk', '한국(SM엔터테인먼트 소속) DJ/프로듀서', false)
ON CONFLICT (slug) DO NOTHING;

-- 별칭 등록 — 557 규약: 검색/매칭용 정규화 표기.
-- 이 마이그레이션에서 새로 만든 102개 슬러그 전부에 별칭을 건다(단순화를
-- 위해 이름으로 나열하지 않고, 이 파일이 INSERT한 djs 전체를 그대로 재사용).
WITH new_djs AS (
  SELECT id, display_name FROM djs
  WHERE slug IN (
    'dj-soda', 'peggy-gou', 'david-guetta', 'martin-garrix', 'alok',
    'dimitri-vegas-like-mike', 'timmy-trumpet', 'fisher', 'afrojack', 'anyma',
    'alan-walker', 'skrillex', 'marshmello', 'diplo', 'zedd',
    'armin-van-buuren', 'charlotte-de-witte', 'amelie-lens', 'tiesto', 'calvin-harris',
    'vintage-culture', 'don-diablo', 'steve-aoki', 'hardwell', 'black-coffee',
    'ww', 'lost-frequencies', 'keinemusik', 'reinier-zonneveld', 'kshmr',
    'carl-cox', 'oliver-heldens', 'jamie-jones', 'r3hab', 'nicky-romero',
    'claptone', 'vini-vici', 'fred-again', 'swedish-house-mafia', 'joel-corry',
    'indira-paganotto', 'eric-prydz', 'paul-van-dyk', 'dj-snake', 'dom-dolla',
    'the-martinez-brothers', 'bassjackers', 'john-summit', 'quintino', 'michael-bibi',
    'boris-brejcha', 'korolova', 'alesso', 'james-hype', 'maddix',
    'hugel', 'solomun', 'mochakk', 'lilly-palmer', 'nora-en-pure',
    'atb', 'deborah-de-luca', 'above-and-beyond', 'sara-landry', 'nervo',
    'sub-zero-project', 'kolsch', 'lucas-and-steve', 'nico-moreno', 'gordo',
    'pawsa', 'the-chainsmokers', 'liu', 'mike-williams', 'artbat',
    'kaaze', 'miss-monique', 'burak-yeter', 'mau-p', 'le-twins',
    'i-hate-models', 'marnik', 'chris-stussy', 'deadmau5', 'fedde-le-grand',
    'ferry-corsten', 'plastik-funk', 'dubvision', 'b-jones', 'giuseppe-ottaviani',
    'cuebrick', 'mariana-bo', 'meduza', 'vinai', 'chris-lake',
    'faustix', 'honey-dijon', 'nils-van-zandt', 'topic', 'marlon-hoffstadt',
    'yultron', 'raiden'
  )
)
INSERT INTO dj_aliases (dj_id, alias, normalized)
SELECT id, display_name, lower(regexp_replace(display_name, '[^a-zA-Z0-9가-힣]', '', 'g'))
FROM new_djs
ON CONFLICT (normalized) DO NOTHING;

-- 국문 표기 별칭 (검색 매칭용)
INSERT INTO dj_aliases (dj_id, alias, normalized)
SELECT d.id, v.alias, v.normalized
FROM (
  VALUES
    ('dj-soda', 'DJ소다', 'dj소다'),
    ('peggy-gou', '페기구', '페기구'),
    ('david-guetta', '데이빗게타', '데이빗게타'),
    ('martin-garrix', '마틴개릭스', '마틴개릭스'),
    ('tiesto', '티에스토', '티에스토'),
    ('calvin-harris', '캘빈해리스', '캘빈해리스'),
    ('alan-walker', '알란워커', '알란워커'),
    ('marshmello', '마시멜로', '마시멜로'),
    ('skrillex', '스크릴렉스', '스크릴렉스'),
    ('armin-van-buuren', '아민반뷰렌', '아민반뷰렌')
) AS v(slug, alias, normalized)
JOIN djs d ON d.slug = v.slug
ON CONFLICT (normalized) DO NOTHING;
