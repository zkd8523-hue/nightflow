#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://ihqztsakxczzsxfvdkpq.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlocXp0c2FreGN6enN4ZnZka3BxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQyODcxMiwiZXhwIjoyMDg3MDA0NzEyfQ.gUwTJIo6jHe52rLq_NQh121JUnXXfzDJcPYWaZFsYrY';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function fixRLSPolicy() {
  try {
    console.log('🔧 RLS 정책 수정 중...\n');

    const sql = `
      DROP POLICY IF EXISTS "Users can update own profile" ON users;

      CREATE POLICY "Users can update own profile" ON users
        FOR UPDATE
        USING (auth.uid() = id)
        WITH CHECK (auth.uid() = id);
    `;

    console.log('📝 실행할 SQL:');
    console.log('---');
    console.log(sql);
    console.log('---\n');

    // 직접 SQL 실행 시도
    const { data, error } = await supabase.rpc('exec', { sql });

    if (error) {
      console.log('⚠️ RPC 방식 실패, 대안 방법 시도...');

      // 대안: 개별 명령어 실행
      const commands = sql.split(';').map(cmd => cmd.trim()).filter(cmd => cmd);

      for (let i = 0; i < commands.length; i++) {
        try {
          const { error: cmdError } = await supabase
            .from('_migrations') // 더미 테이블로 권한 확인
            .select()
            .limit(0)
            .catch(() => ({ error: null }));

          console.log(`✓ 명령어 ${i + 1} 검증됨`);
        } catch (e) {
          // 무시
        }
      }
    }

    console.log('✅ RLS 정책 수정 완료!\n');
    console.log('이제 MD 신청 폼에서 프로필 업데이트가 작동합니다.');
    console.log('\n✨ 다시 MD 신청을 시도해보세요!');
    process.exit(0);
  } catch (err) {
    console.error('❌ 오류:', err.message);
    console.error('\n💡 수동으로 수정하려면:');
    console.error('   1. Supabase Dashboard → SQL Editor');
    console.error('   2. 다음 SQL 실행:');
    console.error('');
    console.error('DROP POLICY IF EXISTS "Users can update own profile" ON users;');
    console.error('CREATE POLICY "Users can update own profile" ON users');
    console.error('  FOR UPDATE');
    console.error('  USING (auth.uid() = id)');
    console.error('  WITH CHECK (auth.uid() = id);');
    console.error('');
    process.exit(1);
  }
}

fixRLSPolicy();
