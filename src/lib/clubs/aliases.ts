// 클럽별 검색 별칭 (SEO 최적화용)
// 사람들이 실제로 부르는 변형 이름을 메타데이터·JSON-LD에 노출하기 위한 매핑.
// 키는 clubs.id (UUID).
// 첫 번째 원소가 "메인 검색 이름" — 메타 title prefix·H1·본문 우선 표기에 사용됨.
//
// 추정 별칭 다수 포함. 정확하지 않은 부분은 운영자가 검토 후 수정 필요.
export const CLUB_ALIASES: Record<string, string[]> = {
  // ===== 강남 (7곳) =====
  // Club Ace (구 레이스)
  "35de296e-5fdc-435b-baf2-1c7c05538687": [
    "에이스",
    "강남 에이스",
    "ACE",
    "Club ACE",
    "강남 ACE",
    "레이스",
    "강남 레이스",
  ],
  // Core Seoul
  "a0890c9f-ac6e-4c2f-9665-c45667ca10e4": [
    "코어",
    "강남 코어",
    "코어 서울",
    "Core",
  ],
  // DM SEOUL
  "cc7db051-b75d-4c1f-9f95-29f7d8ce70d7": [
    "디엠",
    "강남 디엠",
    "DM",
    "DM 라운지",
    "디엠라운지",
  ],
  // HYPE SEOUL
  "67b2286c-63e9-46a1-bb90-e9ca4ccf6fae": [
    "하잎",
    "하입",
    "강남 하잎",
    "강남 하입",
    "하잎서울",
    "하잎 서울",
    "하입서울",
    "하입 서울",
  ],
  // 아르쥬 청담 라운지
  "c6e747de-140f-4a76-857d-6ed51d09b217": [
    "아르쥬",
    "청담 아르쥬",
    "강남 아르쥬",
  ],
  // 컬러 압구
  "80ba0738-ffbb-4463-b97e-7e68e4c0da60": [
    "컬러",
    "압구정 컬러",
    "강남 컬러",
  ],
  // 플팔
  "6a19815e-c22b-4bc5-8bb5-dd84b872a7b4": [
    "플팔",
    "강남 플팔",
    "Plus82",
    "플러스82",
  ],

  // ===== 광주 (4곳) =====
  // Libertine
  "8b0d2b78-0ba2-4e7f-b0de-a7daf804df8f": ["리버틴", "광주 리버틴"],
  // Muffin
  "80ba91a3-08d9-43f2-b4dc-a1a534db37dc": ["머핀", "광주 머핀"],
  // Round Lounge
  "910966eb-0c36-47d6-94fc-a4f4ab2ef410": [
    "라운드",
    "광주 라운드",
    "라운드 라운지",
  ],
  // Veil Social Club
  "bb929c21-bd6d-4766-85c6-2b51452058da": [
    "베일",
    "광주 베일",
    "베일 클럽",
    "광주 VEIL",
  ],

  // ===== 대구 (8곳) =====
  // AIR
  "4c56e494-beff-47da-b584-eed787083d0c": ["에어", "대구 에어"],
  // AU
  "e7e7c726-3325-40b8-b71d-09b0a2d726b7": [
    "에이유",
    "대구 에이유",
    "대구 AU",
    "AU 대구",
  ],
  // D.hell
  "5d1fd280-7656-491f-a335-9b4dd87c0d2a": ["디헬", "대구 디헬", "D.hell"],
  // EGG
  "6c6a85cf-b56c-419d-ab46-4a8fe4e865a2": ["에그", "대구 에그"],
  // LOOPY
  "366967c8-13cc-46a0-974d-af49d95115a9": ["루피", "대구 루피"],
  // OOPS
  "518de860-13b8-415f-b2e9-a9c0d280f7a5": ["웁스", "대구 웁스"],
  // ROOTS
  "e890590a-7011-4c54-baf5-a298dc8e81fc": ["루츠", "대구 루츠"],
  // 브리드(BREED)
  "5cf5658b-b1ba-4744-a1d0-ae4a60a67828": [
    "브리드",
    "대구 브리드",
    "BREED",
  ],

  // ===== 부산 (9곳) =====
  // Azit
  "c8e912c9-6ac4-45f6-91ec-6eb74e6421d0": ["아지트", "부산 아지트"],
  // BELPOS
  "c40209fe-e131-4594-b9bc-98a833da5f89": ["벨포스", "부산 벨포스"],
  // CREAM
  "555c0e17-315b-44cd-aaf2-78f2c83ee44d": ["크림", "부산 크림"],
  // Club Nasub
  "9aab78dd-6651-4bc5-a3ac-4c65a0c001db": [
    "나수브",
    "부산 나수브",
    "클럽 나수브",
  ],
  // Hit The Beach
  "daf7074f-c3a4-4d6f-9cfb-5ead20e42267": [
    "힛더비치",
    "부산 힛더비치",
  ],
  // JEJE
  "cef298c6-0bff-4bf6-b48e-29bb7bf87fa2": ["제제", "부산 제제"],
  // MELT
  "51f20adf-0439-4e96-8e79-297c33942b88": ["멜트", "부산 멜트"],
  // OUTPUT
  "ade9e272-5cb4-42a1-bcb6-8989762e8423": ["아웃풋", "부산 아웃풋"],
  // Party Next Door
  "c5dd4d29-7eed-4060-9d70-24d4f6631021": [
    "파티넥스트도어",
    "부산 파티넥스트도어",
    "파넥",
    "부산 파넥",
    "PND",
  ],

  // ===== 이태원 (4곳) =====
  // Fountain
  "28f49c9b-377e-4d0d-8b2f-32f9519e245c": ["파운틴", "이태원 파운틴"],
  // Soap Seoul
  "c320833f-8214-4f1a-99ad-389349052a91": [
    "소프",
    "이태원 소프",
    "소프 서울",
    "Soap",
  ],
  // The Mansion
  "ba6372ad-e921-48d4-9212-919ecd0181f5": [
    "맨션",
    "이태원 맨션",
    "더 맨션",
  ],
  // The seoul
  "e1f186f4-504b-4acd-bc06-9e2cff29e1dd": [
    "더 서울",
    "이태원 더 서울",
    "The Seoul",
  ],

  // ===== 홍대 (25곳) =====
  // 25
  "96571129-fea9-4602-b9d1-5b2f6a6543ed": ["홍대 25", "25 홍대"],
  // A:tension
  "9c891ba3-9ab9-442f-b105-dbea5d80b2b0": ["어텐션", "홍대 어텐션"],
  // ADD
  "fb5edbac-ddef-4695-96e6-af047071f20f": ["홍대 ADD", "애드"],
  // Awesome Red
  "11188a87-0d52-4de0-84e3-2ae54bc6f34b": [
    "어썸레드",
    "어썸",
    "홍대 어썸",
  ],
  // B1
  "5d786696-e6b3-472b-bbe8-4923c42b0007": ["비원", "홍대 B1", "홍대 비원"],
  // Box Seoul
  "ce2fbcb7-79c6-4650-b4c4-4f1b6cc044a4": [
    "박스",
    "홍대 박스",
    "박스 서울",
    "Box",
  ],
  // CLUB BERMUDA
  "d912c171-7b9c-40a4-8c89-dc05caf35ebd": [
    "버뮤다",
    "홍대 버뮤다",
    "클럽 버뮤다",
  ],
  // Club FF
  "5174448f-11e6-4660-9e18-f0a9663a1a87": [
    "FF",
    "홍대 FF",
    "클럽 FF",
    "에프에프",
  ],
  // Diss
  "169b7a43-4aa4-479a-b848-4a0ec7b53e18": ["디스", "홍대 디스"],
  // Doze
  "4d0567bf-20cf-4b76-b8ab-79f4cc829a80": ["도즈", "홍대 도즈"],
  // K-BAT 빠따
  "d696db9c-a50a-4d90-8d57-b456559d0c4b": [
    "빠따",
    "홍대 빠따",
    "K-BAT",
    "케이뱃",
  ],
  // K-bat 빠따
  "fa3c81f0-29ab-4756-8f87-8c681b5cde10": [
    "빠따",
    "홍대 빠따",
    "K-bat",
    "케이뱃",
  ],
  // La Rosa
  "4004d7b6-b3d2-4ec4-8c42-32d82405ded0": ["라로사", "홍대 라로사"],
  // Labamba
  "0802610e-70a5-4414-b7fe-3edc91859f9d": ["라밤바", "홍대 라밤바"],
  // Modeci
  "8b2a189f-6c54-4f29-8dfc-e961d23fd0c3": ["모데시", "홍대 모데시"],
  // OCEAN
  "bd820f57-46b6-4d95-822a-4f0cf8e84542": ["오션", "홍대 오션"],
  // Purple
  "e27781b0-8231-4d07-b409-8f624385ec3e": ["퍼플", "홍대 퍼플"],
  // Sabotage
  "7d3e6f02-db91-4543-a764-28c72fba26fb": ["사보타지", "홍대 사보타지"],
  // Sinkhole
  "07b01a77-8c5b-4294-8543-03cbe4a93792": ["싱크홀", "홍대 싱크홀"],
  // THE HENZ CLUB
  "05e65073-95f6-46bf-8955-b4d3e18a9cfd": [
    "헨즈",
    "홍대 헨즈",
    "헨즈 클럽",
  ],
  // XX
  "85d91b4f-1e9d-4281-a8f7-400c22161e43": [
    "엑엑",
    "홍대 엑엑",
    "홍대 XX",
    "더블엑스",
  ],
  // XX2
  "df39186b-b8b0-417f-beab-69a0cf748228": [
    "엑엑2",
    "홍대 엑엑2",
    "홍대 XX2",
    "더블엑스2",
  ],
  // 도깨비 (중복 1)
  "4fbc1eb1-1a63-4594-b79a-4dc459c1de20": ["도깨비", "홍대 도깨비"],
  // 도깨비 (중복 2)
  "93f1081a-250c-402a-a0d4-9b8a309aff57": ["도깨비", "홍대 도깨비"],
  // 인클 서울
  "2753139f-7b0e-439a-8216-c51fa8d5e52d": [
    "인클",
    "홍대 인클",
    "인클서울",
  ],
};

export function getClubAliases(clubId: string): string[] {
  return CLUB_ALIASES[clubId] ?? [];
}

/**
 * "메인 검색 이름" = aliases 배열 첫 원소.
 * 메타 title, sr-only H1, 본문 prefix 등 가장 강한 SEO 시그널 자리에 사용.
 * 별칭이 없는 클럽은 null 반환 → 호출부에서 club.name으로 폴백.
 */
export function getPrimaryAlias(clubId: string): string | null {
  const list = CLUB_ALIASES[clubId];
  return list && list.length > 0 ? list[0] : null;
}

/**
 * 사용자 쿼리에 매칭되는 클럽 ID 목록 반환 (부분일치, 대소문자 무시).
 * 검색창에서 등록명·별칭 둘 다 매칭시키고 싶을 때 사용.
 */
export function findClubIdsByAlias(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return Object.entries(CLUB_ALIASES)
    .filter(([, aliases]) =>
      aliases.some((a) => a.toLowerCase().includes(q))
    )
    .map(([id]) => id);
}
