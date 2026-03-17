// 테스트 데이터 생성 스크립트
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Admin 권한 필요

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupTestData() {
  console.log('🚀 테스트 데이터 생성 시작...\n');

  // 1. 기존 유저 조회
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .limit(1)
    .single();

  if (!users) {
    console.log('❌ 유저가 없습니다. 먼저 Kakao 로그인을 해주세요.');
    return;
  }

  console.log(`✅ 유저 발견: ${users.name} (${users.id})`);

  // 2. MD로 변경
  if (users.role !== 'md') {
    console.log('\n📝 유저를 MD로 변경 중...');
    const { error: updateError } = await supabase
      .from('users')
      .update({
        role: 'md',
        md_status: 'approved',
        md_unique_slug: `md-${users.name.toLowerCase()}-${Math.random().toString(36).substring(7)}`,
        bank_name: '신한은행',
        bank_account: '110-123-456789'
      })
      .eq('id', users.id);

    if (updateError) {
      console.error('❌ MD 변경 실패:', updateError.message);
      return;
    }
    console.log('✅ MD 역할로 변경 완료');
  } else {
    console.log('✅ 이미 MD 역할입니다');
  }

  // 3. 클럽 조회
  const { data: clubs } = await supabase
    .from('clubs')
    .select('*')
    .limit(3);

  if (!clubs || clubs.length === 0) {
    console.log('❌ 클럽 데이터가 없습니다.');
    return;
  }

  // 4. 테스트 경매 생성
  console.log('\n🎯 테스트 경매 생성 중...');

  const testAuctions = [
    {
      md_id: users.id,
      club_id: clubs[0].id,
      title: `${clubs[0].name} VIP 테이블 - 이번 주 토요일`,
      event_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2일 후
      table_type: 'VIP',
      min_people: 4,
      includes: ['샴페인 1병', '과일 플레이트', '기본 안주'],
      notes: '드레스코드: 스마트 캐주얼',
      original_price: 300000,
      start_price: 180000,
      reserve_price: 180000,
      auction_start_at: new Date(Date.now() + 60 * 1000).toISOString(), // 1분 후 시작
      auction_end_at: new Date(Date.now() + 61 * 60 * 1000).toISOString(), // 61분 후 종료
      duration_minutes: 60,
      status: 'scheduled'
    },
    {
      md_id: users.id,
      club_id: clubs[1]?.id || clubs[0].id,
      title: `${clubs[1]?.name || clubs[0].name} Standard 테이블 - 내일`,
      event_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1일 후
      table_type: 'Standard',
      min_people: 2,
      includes: ['기본 안주', '소주 2병'],
      notes: null,
      original_price: 150000,
      start_price: 80000,
      reserve_price: 80000,
      auction_start_at: new Date().toISOString(), // 지금 바로 시작
      auction_end_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30분 후 종료
      duration_minutes: 30,
      status: 'active' // 바로 active로 설정
    }
  ];

  for (const auction of testAuctions) {
    const { data, error } = await supabase
      .from('auctions')
      .insert(auction)
      .select()
      .single();

    if (error) {
      console.error(`❌ 경매 생성 실패:`, error.message);
    } else {
      console.log(`✅ 경매 생성: ${data.title} (${data.status})`);
    }
  }

  console.log('\n✨ 테스트 데이터 생성 완료!\n');

  // 최종 확인
  const { data: finalAuctions } = await supabase
    .from('auctions')
    .select('*, club:clubs(name)')
    .eq('md_id', users.id);

  console.log(`📊 총 ${finalAuctions?.length || 0}개의 경매가 생성되었습니다:`);
  finalAuctions?.forEach(a => {
    console.log(`   - ${a.title} (${a.status})`);
  });
}

setupTestData().catch(console.error);
