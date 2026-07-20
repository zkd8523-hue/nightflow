import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { config } from "dotenv";
config({ path: "/Users/gimmingi/project 1/nightflow/.env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
const key = process.env.KAKAO_REST_API_KEY;

async function geocode(q) {
  const a = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q)}`,
    { headers: { Authorization: `KakaoAK ${key}` } });
  if (a.ok) { const j = await a.json(); if (j.documents?.length) return { lat: +j.documents[0].y, lng: +j.documents[0].x }; }
  const k = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}`,
    { headers: { Authorization: `KakaoAK ${key}` } });
  if (k.ok) { const j = await k.json(); if (j.documents?.length) return { lat: +j.documents[0].y, lng: +j.documents[0].x }; }
  return null;
}

const club = {
  name: "Peach Lounge",
  area: "수원",
  address: "경기 수원시 팔달구 인계로138번길 26 B1",
  instagram: "peachlounge",
  operating_hours: "금/토 22:00~",
  entry_fee_detail: "입장 10,000원 (무료 칵테일 1잔) / 게스트 무료",
  tags: ["venue_type:lounge", "genre:hiphop", "smoking:allowed"],
  aliases: ["피치", "피치라운지", "peach", "peach lounge", "수원 피치"],
  status: "active",
};

const { data: existing } = await supabase.from("clubs").select("id, name")
  .ilike("name", "%peach%").maybeSingle();
if (existing) { console.log("이미 등록됨:", existing); process.exit(0); }

const geo = await geocode("경기 수원시 팔달구 인계로138번길 26") || await geocode("피치라운지 수원");
if (geo) { club.latitude = geo.lat; club.longitude = geo.lng; }

const { data, error } = await supabase.from("clubs").insert(club)
  .select("id, name, area, address, latitude, longitude, instagram, tags").single();
if (error) {
  console.error("등록 실패:", error.message);
  if (error.message.includes("area") || error.code === "23514") {
    console.error("\n⚠️ area='수원' 제약 미적용. 마이그레이션 426을 먼저 대시보드에서 실행해야 함.");
  }
  process.exit(1);
}
console.log(`✅ Peach Lounge 등록 ${geo ? "(지도O)" : "(지도X)"}`);

const buf = readFileSync("/Users/gimmingi/Desktop/클럽대펴이미지/peach.jpg");
const tkey = `club-thumbnails/admin/${data.id}/${Date.now()}.jpg`;
await supabase.storage.from("auction-images").upload(tkey, buf, { contentType: "image/jpeg", upsert: true });
const { data: pub } = supabase.storage.from("auction-images").getPublicUrl(tkey);
await supabase.from("clubs").update({ thumbnail_url: pub.publicUrl }).eq("id", data.id);
console.log("✅ Peach 썸네일 등록 (peach.jpg)");
console.log(JSON.stringify(data, null, 2));
