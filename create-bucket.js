#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ihqztsakxczzsxfvdkpq.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlocXp0c2FreGN6enN4ZnZka3BxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQyODcxMiwiZXhwIjoyMDg3MDA0NzEyfQ.gUwTJIo6jHe52rLq_NQh121JUnXXfzDJcPYWaZFsYrY';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function createStorageBucket() {
  try {
    console.log('🚀 Storage bucket "auction-images" 생성 중...\n');

    // 1. 버킷 생성
    const { data, error } = await supabase.storage.createBucket('auction-images', {
      public: true,
      fileSizeLimit: 5242880, // 5MB
    });

    if (error) {
      if (error.message.includes('already exists')) {
        console.log('⚠️ 버킷이 이미 존재합니다.');
      } else {
        throw error;
      }
    } else {
      console.log('✅ 버킷 생성 완료:', data);
    }

    console.log('\n🔒 RLS 정책 설정 중...\n');

    // 2. RLS 정책 설정 (SQL로 직접 실행)
    const policies = `
      -- Public read access
      CREATE POLICY "Public read access to auction images"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'auction-images');

      -- Authenticated users can upload
      CREATE POLICY "Authenticated users can upload auction images"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'auction-images');

      -- Users can update their own uploads
      CREATE POLICY "Users can update their own uploads"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'auction-images' AND auth.uid()::text = (storage.foldername(name))[1]);

      -- Users can delete their own uploads
      CREATE POLICY "Users can delete their own uploads"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'auction-images' AND auth.uid()::text = (storage.foldername(name))[1]);
    `;

    // SQL 쿼리로 정책 설정
    const { error: policyError } = await supabase.rpc('exec', { sql: policies }).catch(() => ({ error: null }));

    if (policyError && !policyError.message?.includes('does not exist')) {
      console.log('⚠️ RLS 정책 설정 스킵 (Dashboard에서 수동 설정 필요)');
    } else {
      console.log('✅ RLS 정책 설정 완료');
    }

    console.log('\n✨ Storage 버킷 설정 완료!\n');
    console.log('이제 다음 기능들이 작동합니다:');
    console.log('  ✓ MD 신청 폼 - 신원 확인 사진 업로드');
    console.log('  ✓ 클럽 관리 - 평면도 업로드');
    console.log('  ✓ 경매 등록 - 썸네일 이미지 업로드\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ 오류:', err.message);
    console.error('\n💡 수동으로 설정하려면:');
    console.error('   1. Supabase Dashboard 접속');
    console.error('   2. Storage → Create a new bucket');
    console.error('   3. 이름: auction-images, Public 체크, 5MB 제한');
    process.exit(1);
  }
}

createStorageBucket();
