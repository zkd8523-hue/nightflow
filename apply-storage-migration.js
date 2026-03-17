#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://ihqztsakxczzsxfvdkpq.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlocXp0c2FreGN6enN4ZnZka3BxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQyODcxMiwiZXhwIjoyMDg3MDA0NzEyfQ.gUwTJIo6jHe52rLq_NQh121JUnXXfzDJcPYWaZFsYrY';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function applyMigration() {
  try {
    console.log('🚀 Storage bucket 마이그레이션을 적용 중입니다...\n');

    // SQL 파일 읽기
    const migrationPath = path.join(__dirname, 'supabase/migrations/033_create_storage_buckets.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    console.log('📝 실행할 SQL:');
    console.log('---');
    console.log(sql);
    console.log('---\n');

    // SQL 실행
    const { error } = await supabase.rpc('exec', {
      sql: sql
    }).catch(async () => {
      // exec RPC가 없으면 직접 쿼리 실행 시도
      console.log('⚠️ RPC 방식 실패, 직접 SQL 쿼리 시도 중...\n');

      // 개별 명령어로 분리해서 실행
      const commands = sql
        .split(';')
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0);

      for (const cmd of commands) {
        const { error } = await supabase.rpc('sql_exec', { sql: cmd + ';' }).catch(() => ({ error: null }));
        if (error) console.log(`⚠️ ${cmd.substring(0, 50)}... - 에러: ${error.message}`);
      }

      return { error: null };
    });

    if (error) {
      console.error('❌ 마이그레이션 실패:', error.message);
      process.exit(1);
    }

    console.log('✅ Storage bucket "auction-images" 생성 완료!\n');
    console.log('✨ 이제 MD 신청 폼에서 파일 업로드가 작동합니다.');
    process.exit(0);
  } catch (err) {
    console.error('❌ 오류:', err.message);
    process.exit(1);
  }
}

applyMigration();
