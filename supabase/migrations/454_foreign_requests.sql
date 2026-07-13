-- ============================================================================
-- Migration 454: 외국인 컨시어지 요청 (foreign_requests)
--
-- 배경: 외국인은 역경매(오퍼 대기)가 불확실·선택부담 → "가고싶은 클럽 지정 → 운영자
--      수동 연결" 컨시어지 모델로 분기. (한국인은 기존 깃발/역경매 유지)
--
-- 흐름: 외국인 폼 제출 → 이 테이블 INSERT → 운영자(admin) 푸시 → admin "외국인" 탭에서
--      확인 → 운영자가 클럽 MD에 직접 연락(카톡/전화, 수동) → 외국인 연락처로 회신 →
--      Model B(현장 직접결제). 오퍼/역경매 로직 일절 없음.
-- ============================================================================

CREATE TABLE IF NOT EXISTS foreign_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lang         TEXT NOT NULL DEFAULT 'en',        -- en / ja / zh
  area         TEXT,                              -- 강남/홍대/이태원/서울 어디든 (클럽만 고르면 NULL 가능)
  event_date   DATE NOT NULL,
  group_size   INTEGER NOT NULL DEFAULT 1,
  budget       INTEGER,                           -- 총 예산(원). NULL 허용
  club_ids     UUID[] NOT NULL DEFAULT '{}',      -- 선택 클럽(최대 3, 우선순위 순서). 앱에서 검증
  contact_type TEXT NOT NULL DEFAULT 'email'
               CHECK (contact_type IN ('email', 'whatsapp', 'instagram', 'kakao', 'other')),
  contact_value TEXT NOT NULL,                    -- 실제 연락처 (운영자가 여기로 회신)
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'new'
               CHECK (status IN ('new', 'contacted', 'done', 'cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- admin "외국인" 탭 목록 조회 (신규 우선) + 빨간 dot 카운트용
CREATE INDEX IF NOT EXISTS idx_foreign_requests_status
  ON foreign_requests(status, created_at DESC);
-- 유저 본인 요청 조회
CREATE INDEX IF NOT EXISTS idx_foreign_requests_user
  ON foreign_requests(user_id);

ALTER TABLE foreign_requests ENABLE ROW LEVEL SECURITY;

-- 유저: 본인 요청만 등록
CREATE POLICY "user inserts own foreign request" ON foreign_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 유저: 본인 요청만 조회
CREATE POLICY "user reads own foreign request" ON foreign_requests
  FOR SELECT USING (auth.uid() = user_id);

-- admin: 전체 조회·수정(상태 관리)·삭제
CREATE POLICY "admin manages foreign requests" ON foreign_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
