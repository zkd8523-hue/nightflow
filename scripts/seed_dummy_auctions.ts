import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seedAuctions() {
  // Get an MD user
  const { data: users, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("role", "md")
    .limit(1);

  if (userError || !users || users.length === 0) {
    console.error("No MD users found", userError);
    return;
  }
  const sellerId = users[0].id;
  
  // Date calculations
  const now = new Date();
  const todayAt10PM = new Date();
  todayAt10PM.setHours(22, 0, 0, 0);
  
  const tomorrowAt11PM = new Date();
  tomorrowAt11PM.setDate(tomorrowAt11PM.getDate() + 1);
  tomorrowAt11PM.setHours(23, 0, 0, 0);

  const nextWeekAt10PM = new Date();
  nextWeekAt10PM.setDate(nextWeekAt10PM.getDate() + 5);
  nextWeekAt10PM.setHours(22, 0, 0, 0);

  // Common fields for auctions
  const dummyAuctions = [
    // --- 오늘특가 (Today) ---
    {
      seller_id: sellerId,
      auction_type: "today",
      club_name: "강남 레이서",
      area: "강남",
      table_type: "룸",
      event_date: todayAt10PM.toISOString().split("T")[0],
      start_price: 3000000,
      current_price: 3000000,
      buy_now_price: 5000000,
      min_pax: 4,
      max_pax: 8,
      status: "active",
      end_time: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours from now
      description: "오늘특가 긴급 방출! VVIP 룸, 최고의 텐션 보장합니다! 빨리 가져가세요🔥",
      auto_extend: true
    },
    {
      seller_id: sellerId,
      auction_type: "today",
      club_name: "이태원 펌프킨",
      area: "이태원",
      table_type: "테이블",
      event_date: todayAt10PM.toISOString().split("T")[0],
      start_price: 150000,
      current_price: 150000,
      buy_now_price: 300000,
      min_pax: 2,
      max_pax: 4,
      status: "active",
      end_time: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      description: "바틀 2개 기본 포함입니다. 오늘 자리 좋음! 즉시 구매 강추👍",
      auto_extend: true
    },
    
    // --- 얼리버드 입찰 (Advance) ---
    {
      seller_id: sellerId,
      auction_type: "advance",
      club_name: "홍대 매드홀릭",
      area: "홍대",
      table_type: "테이블",
      event_date: tomorrowAt11PM.toISOString().split("T")[0],
      start_price: 200000,
      current_price: 200000,
      buy_now_price: 500000,
      min_pax: 3,
      max_pax: 6,
      status: "active",
      end_time: new Date(tomorrowAt11PM.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      description: "내일 불금! 가장 치열한 1층 센터석입니다. 얼리버드로 겟하세요!",
      auto_extend: true
    },
    {
      seller_id: sellerId,
      auction_type: "advance",
      club_name: "강남 신드롬",
      area: "강남",
      table_type: "부스",
      event_date: nextWeekAt10PM.toISOString().split("T")[0],
      start_price: 800000,
      current_price: 800000,
      buy_now_price: 1200000,
      min_pax: 4,
      max_pax: 6,
      status: "active",
      end_time: new Date(nextWeekAt10PM.getTime() - 48 * 60 * 60 * 1000).toISOString(),
      description: "다음주 주말 얼리버드 오픈! 프리미엄 부스석으로 생일파티 제격입니다🎉",
      auto_extend: true
    }
  ];

  const { data, error } = await supabase.from("auctions").insert(dummyAuctions).select();
  if (error) {
    console.error("Error inserting auctions:", error);
  } else {
    console.log(`Successfully inserted ${data.length} dummy auctions!`);
  }
}

seedAuctions();
