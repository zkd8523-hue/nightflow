const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1];
const supabase = createClient(url, key);

async function seed() {
  try {
    console.log("Starting DB seeding for App Store Review...");

    // 1-1. Update actual club names and thumbnail URLs to avoid real-world trademark issues and use beautiful club images
    await supabase.from('clubs').update({ 
      name: 'Club ECLIPSE',
      thumbnail_url: 'https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/auction-images/club-thumbnails/103400ee-b647-428f-ae76-07131a720dc6/17790012193N.png'
    }).eq('id', '35de296e-5fdc-435b-baf2-1c7c05538687');
    
    await supabase.from('clubs').update({ 
      name: 'ORION',
      thumbnail_url: 'https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/auction-images/club-thumbnails/cc7db051-b75d-4c1f-9f95-29f7d8ce70d7/17790014033N.png'
    }).eq('id', 'bd820f57-46b6-4d95-822a-4f0cf8e84542');

    // 1. Get clubs and MDs
    const { data: clubs } = await supabase.from('clubs').select('id, name');
    const { data: mds } = await supabase.from('users').select('id, name, role').eq('role', 'md');

    if (!clubs || clubs.length === 0) {
      console.error("No clubs found in DB. Cannot seed.");
      return;
    }
    if (!mds || mds.length === 0) {
      console.error("No MDs found in DB. Cannot seed.");
      return;
    }

    const clubAce = clubs.find(c => c.name.includes("Club ECLIPSE")) || clubs[0];
    const ocean = clubs.find(c => c.name.includes("ORION")) || clubs[0];
    const md = mds[0];

    console.log("Using Club:", clubAce.name, "ID:", clubAce.id);
    console.log("Using Club 2:", ocean.name, "ID:", ocean.id);
    console.log("Using MD:", md.name || "Test MD", "ID:", md.id);

    // 2. Clear old expired draft/active/scheduled share auctions to keep feed clean
    const { error: deleteErr } = await supabase
      .from('auctions')
      .delete()
      .eq('listing_type', 'share')
      .in('status', ['active', 'scheduled', 'draft']);
    
    console.log("Deleted old share auctions:", deleteErr || "None");

    // 3. Define future dates (e.g. 1 year in the future)
    const futureDateStr = "2027-05-20";
    const futureDateTime = "2027-05-20T15:00:00.000Z";

    // 4. Insert 3 beautiful active share auctions
    const mockShares = [
      {
        md_id: md.id,
        club_id: clubAce.id,
        title: "🔥 Club ECLIPSE 금요일 메인 돔테이블 1/N 조각",
        event_date: "2027-05-20",
        table_type: "VIP",
        min_people: 2,
        max_people: 6,
        includes: ["돔 페리뇽 2병", "아르망디 1병", "과일 안주 세트", "음료 무제한"],
        notes: "메인 돔 자리 예약 완료했습니다. 현재 4명 확정이고 2명 추가 모집합니다. 매너 좋으신 분들 환영해요!",
        original_price: 1500000,
        start_price: 250000,
        reserve_price: 0,
        status: "active",
        auction_start_at: new Date().toISOString(),
        auction_end_at: "2027-05-20T15:00:00.000Z",
        listing_type: "share",
        duration_minutes: 0,
        price_per_seat: 250000,
        total_seats: 6,
        seats_claimed: 4,
        share_deadline: "2027-05-20T15:00:00.000Z",
        kakao_open_chat_url: "https://open.kakao.com/o/gNRAV7ui",
        thumbnail_url: "https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/auction-images/club-thumbnails/103400ee-b647-428f-ae76-07131a720dc6/17790012193N.png",
        target_male: 3,
        target_female: 3,
        external_male: 2,
        external_female: 2
      },
      {
        md_id: md.id,
        club_id: ocean.id,
        title: "✨ ORION 토요일 메인 일렉존 테이블 조각원 구합니다",
        event_date: "2027-05-21",
        table_type: "Standard",
        min_people: 2,
        max_people: 8,
        includes: ["하프 샴페인 4병", "보드카 1병", "에너지드링크 무제한"],
        notes: "주말 일렉존 핫한 자리입니다. 부담 없이 1/N으로 엔빵해서 재밌게 노실 분들 편하게 톡방 들어오세요!",
        original_price: 800000,
        start_price: 100000,
        reserve_price: 0,
        status: "active",
        auction_start_at: new Date().toISOString(),
        auction_end_at: "2027-05-21T15:00:00.000Z",
        listing_type: "share",
        duration_minutes: 0,
        price_per_seat: 100000,
        total_seats: 8,
        seats_claimed: 5,
        share_deadline: "2027-05-21T15:00:00.000Z",
        kakao_open_chat_url: "https://open.kakao.com/o/gNRAV7ui",
        thumbnail_url: "https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/auction-images/club-thumbnails/cc7db051-b75d-4c1f-9f95-29f7d8ce70d7/17790014033N.png",
        target_male: 4,
        target_female: 4,
        external_male: 3,
        external_female: 2
      },
      {
        md_id: md.id,
        club_id: clubAce.id,
        title: "👑 ECLIPSE 힙합존 테이블 가성비 조각 모임",
        event_date: "2027-05-22",
        table_type: "Standard",
        min_people: 1,
        max_people: 5,
        includes: ["샴페인 2병", "포트와인 1병"],
        notes: "힙존 음악 좋아하시는 분들 함께 놀아요! 남녀 성비 맞춰서 재밌게 달립니다.",
        original_price: 450000,
        start_price: 90000,
        reserve_price: 0,
        status: "active",
        auction_start_at: new Date().toISOString(),
        auction_end_at: "2027-05-22T15:00:00.000Z",
        listing_type: "share",
        duration_minutes: 0,
        price_per_seat: 90000,
        total_seats: 5,
        seats_claimed: 2,
        share_deadline: "2027-05-22T15:00:00.000Z",
        kakao_open_chat_url: "https://open.kakao.com/o/gNRAV7ui",
        thumbnail_url: "https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/auction-images/club-thumbnails/bb929c21-bd6d-4766-85c6-2b51452058da/17790017603N.png",
        target_male: 2,
        target_female: 3,
        external_male: 1,
        external_female: 1
      }
    ];

    const { data: insertedShares, error: insertErr } = await supabase
      .from('auctions')
      .insert(mockShares)
      .select('id, title');

    console.log("Successfully inserted mock share auctions:", insertedShares, insertErr || "");

    // 5. Query active puzzles to see if they're expired or empty
    const { count: puzzlesCount } = await supabase
      .from('puzzles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open')
      .gt('expires_at', new Date().toISOString());

    if (!puzzlesCount || puzzlesCount === 0) {
      console.log("No active puzzles found. Seeding mock puzzles...");
      const { data: users } = await supabase.from('users').select('id, name').limit(3);
      if (users && users.length > 0) {
        const leader = users[0];
        const mockPuzzles = [
          {
            leader_id: leader.id,
            area: "강남",
            event_date: futureDateStr,
            kakao_open_chat_url: "https://open.kakao.com/o/gNRAV7ui",
            gender_pref: "any",
            age_pref: "any",
            vibe_pref: "chill",
            budget_per_person: 150000,
            target_count: 6,
            current_count: 3,
            status: "open",
            expires_at: futureDateTime
          },
          {
            leader_id: leader.id,
            area: "홍대",
            event_date: futureDateStr,
            kakao_open_chat_url: "https://open.kakao.com/o/gNRAV7ui",
            gender_pref: "any",
            age_pref: "early_20s",
            vibe_pref: "active",
            budget_per_person: 80000,
            target_count: 8,
            current_count: 4,
            status: "open",
            expires_at: futureDateTime
          }
        ];
        const { data: insertedPuzzles, error: puzzleErr } = await supabase
          .from('puzzles')
          .insert(mockPuzzles)
          .select('id');
        console.log("Successfully inserted mock puzzles:", insertedPuzzles, puzzleErr || "");
      }
    } else {
      console.log(`Already have ${puzzlesCount} active puzzles. Bypassing puzzle seeding.`);
    }

    console.log("DB Seeding completed successfully!");
  } catch (err) {
    console.error("Seeding execution error:", err);
  }
}

seed();
