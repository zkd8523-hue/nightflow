// Supabase 연결 테스트 스크립트
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// .env.local 파일 로드
config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log('🔌 Supabase 연결 테스트 시작...\n');

  // 1. 클럽 데이터 확인
  console.log('1️⃣  클럽 데이터 확인 중...');
  const { data: clubs, error: clubsError } = await supabase
    .from('clubs')
    .select('*');

  if (clubsError) {
    console.error('❌ 클럽 데이터 조회 실패:', clubsError.message);
  } else {
    console.log(`✅ 클럽 ${clubs?.length || 0}개 발견`);
    clubs?.forEach(club => {
      console.log(`   - ${club.name} (${club.area})`);
    });
  }

  // 2. 경매 데이터 확인
  console.log('\n2️⃣  경매 데이터 확인 중...');
  const { data: auctions, error: auctionsError } = await supabase
    .from('auctions')
    .select('*, club:clubs(name), md:users!auctions_md_id_fkey(name)')
    .limit(5);

  if (auctionsError) {
    console.error('❌ 경매 데이터 조회 실패:', auctionsError.message);
  } else {
    console.log(`✅ 경매 ${auctions?.length || 0}개 발견`);
    auctions?.forEach(auction => {
      console.log(`   - ${auction.title} (${auction.status})`);
    });
  }

  // 3. 유저 데이터 확인
  console.log('\n3️⃣  유저 데이터 확인 중...');
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, name, role')
    .limit(5);

  if (usersError) {
    console.error('❌ 유저 데이터 조회 실패:', usersError.message);
  } else {
    console.log(`✅ 유저 ${users?.length || 0}명 발견`);
    users?.forEach(user => {
      console.log(`   - ${user.name} (${user.role})`);
    });
  }

  console.log('\n✨ 테스트 완료!\n');
}

testConnection().catch(console.error);
