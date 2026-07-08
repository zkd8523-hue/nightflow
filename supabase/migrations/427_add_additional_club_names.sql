-- Migration 427: MD 신청 시 추가 소속 클럽 이름 (admin 확인용 메모)
--
-- 배경: MD가 여러 클럽을 운영하는 경우, 신청 폼에서 대표 클럽 외 추가 클럽명을
--       입력할 수 있게 함. 이 이름들은 실제 clubs 행을 생성하지 않고(껍데기 클럽
--       자동 생성 방지), admin이 승인 화면에서 참고용으로만 확인한다.
--       실제 클럽 연결은 admin이 승인 시 기존 클럽을 검색해 수동으로 수행.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS additional_club_names TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN users.additional_club_names IS
  'MD 신청 시 입력한 추가 소속 클럽 이름(확인용). 실제 클럽 연결은 club_partners로 별도 관리.';
