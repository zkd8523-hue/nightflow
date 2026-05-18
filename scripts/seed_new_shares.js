const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim().replace(/['"]/g, '');
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim().replace(/['"]/g, '');
const supabase = createClient(url, key);

const mdId = '758c0ce7-ed5d-4b18-8946-83bb0c09e35b'; // 테스트MD1

const today = new Date();
const formatKSTDate = (daysAhead) => {
  const d = new Date(today);
  d.setDate(d.getDate() + daysAhead);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
};

const getISOStringForTime = (daysAhead, hourKST) => {
  const d = new Date(today);
  d.setDate(d.getDate() + daysAhead);
  d.setUTCHours(hourKST - 9, 0, 0, 0); // KST is UTC+9
  return d.toISOString();
};

async function runSeed() {
  console.log("🚀 Starting insertion of 3 dummy share posts...");

  // 1. Find the new clubs by name
  const clubNames = ['LUNA Gangnam', 'ECLIPSE Seoul', 'PRISM Hongdae'];
  const { data: clubs, error: clubsError } = await supabase
    .from('clubs')
    .select('id, name')
    .in('name', clubNames);

  if (clubsError) {
    console.error("❌ Error fetching clubs:", clubsError);
    return;
  }

  if (!clubs || clubs.length < 3) {
    console.error(`❌ Could not find all 3 clubs in the database. Found: ${clubs ? clubs.length : 0}`);
    console.log("Clubs found:", clubs);
    return;
  }

  const lunaClub = clubs.find(c => c.name === 'LUNA Gangnam');
  const eclipseClub = clubs.find(c => c.name === 'ECLIPSE Seoul');
  const prismClub = clubs.find(c => c.name === 'PRISM Hongdae');

  console.log(`✅ Found all 3 clubs:`);
  console.log(`   - LUNA Gangnam: ${lunaClub.id}`);
  console.log(`   - ECLIPSE Seoul: ${eclipseClub.id}`);
  console.log(`   - PRISM Hongdae: ${prismClub.id}`);

  // 2. Link MD to clubs in club_partners (Safe, non-destructive, using upsert)
  console.log("🔗 Linking MD to new clubs in club_partners...");
  const partnerEntries = clubs.map(club => ({
    club_id: club.id,
    md_id: mdId,
    role: 'owner'
  }));

  const { error: partnerError } = await supabase
    .from('club_partners')
    .upsert(partnerEntries, { onConflict: 'club_id,md_id' });

  if (partnerError) {
    console.warn("⚠️ Warning/Error inserting club_partners:", partnerError.message);
  } else {
    console.log("✅ club_partners linked successfully!");
  }

  // 3. Define the 3 mock share listings
  const mockShares = [
    {
      md_id: mdId,
      club_id: lunaClub.id,
      title: "🔥 [테스트] LUNA Gangnam 메인 돔테이블 1/N 조각원 모집",
      event_date: formatKSTDate(3),
      table_type: "VIP",
      min_people: 2,
      max_people: 6,
      includes: ["돔 페리뇽 2병", "아르망디 1병", "과일 안주 세트", "음료 무제한"],
      notes: "테스트용 메인 돔테이블 조각 모임입니다. 기존 유저 데이터 및 클럽명에 전혀 영향을 주지 않습니다.",
      original_price: 1500000,
      start_price: 250000,
      reserve_price: 0,
      status: "active",
      auction_start_at: new Date().toISOString(),
      auction_end_at: getISOStringForTime(3, 22),
      listing_type: "share",
      duration_minutes: 0,
      price_per_seat: 250000,
      total_seats: 6,
      seats_claimed: 0,
      share_deadline: getISOStringForTime(3, 22),
      kakao_open_chat_url: "https://open.kakao.com/o/gNRAV7ui",
      target_male: 3,
      target_female: 3,
      external_male: 2,
      external_female: 2,
      external_attendees: 4
    },
    {
      md_id: mdId,
      club_id: eclipseClub.id,
      title: "✨ [테스트] ECLIPSE Seoul 토요일 VIP 테이블 엔빵 조각원 구합니다",
      event_date: formatKSTDate(4),
      table_type: "VIP",
      min_people: 2,
      max_people: 8,
      includes: ["하프 샴페인 4병", "보드카 1병", "에너지드링크 무제한"],
      notes: "테스트용 ECLIPSE Seoul 핫한 VIP 테이블 조각 모임입니다. 부담 없이 1/N로 달릴 분들 드루오세요!",
      original_price: 800000,
      start_price: 100000,
      reserve_price: 0,
      status: "active",
      auction_start_at: new Date().toISOString(),
      auction_end_at: getISOStringForTime(4, 22),
      listing_type: "share",
      duration_minutes: 0,
      price_per_seat: 100000,
      total_seats: 8,
      seats_claimed: 0,
      share_deadline: getISOStringForTime(4, 22),
      kakao_open_chat_url: "https://open.kakao.com/o/gNRAV7ui",
      target_male: 4,
      target_female: 4,
      external_male: 3,
      external_female: 2,
      external_attendees: 5
    },
    {
      md_id: mdId,
      club_id: prismClub.id,
      title: "👑 [테스트] PRISM Hongdae 가성비 조각 파티 (성비 맞춰 모집!)",
      event_date: formatKSTDate(5),
      table_type: "Standard",
      min_people: 1,
      max_people: 5,
      includes: ["샴페인 2병", "포트와인 1병"],
      notes: "테스트용 홍대 힙존 가성비 조각 모임입니다. 성비 잘 맞춰서 재밌게 노실 분 환영!",
      original_price: 450000,
      start_price: 90000,
      reserve_price: 0,
      status: "active",
      auction_start_at: new Date().toISOString(),
      auction_end_at: getISOStringForTime(5, 22),
      listing_type: "share",
      duration_minutes: 0,
      price_per_seat: 90000,
      total_seats: 5,
      seats_claimed: 0,
      share_deadline: getISOStringForTime(5, 22),
      kakao_open_chat_url: "https://open.kakao.com/o/gNRAV7ui",
      target_male: 2,
      target_female: 3,
      external_male: 1,
      external_female: 1,
      external_attendees: 2
    }
  ];

  console.log("📝 Inserting 3 dummy share auctions...");
  const { data: inserted, error: insertError } = await supabase
    .from('auctions')
    .insert(mockShares)
    .select('id, title, event_date');

  if (insertError) {
    console.error("❌ Error inserting dummy posts:", insertError);
  } else {
    console.log("🎉 Successfully inserted 3 dummy posts!");
    inserted.forEach(item => {
      console.log(`   - ID: ${item.id} | Title: "${item.title}" | Event Date: ${item.event_date}`);
    });
  }
}

runSeed().catch(console.error);
