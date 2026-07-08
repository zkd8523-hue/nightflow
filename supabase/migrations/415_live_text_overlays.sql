-- Migration 415: LIVE 텍스트 오버레이 (인스타 스토리식)
--
-- 사진·영상 위에 얹는 텍스트를 좌표 기반 데이터로 저장한다.
-- 파일에 굽지 않고(특히 영상은 합성 불가) 재생 시 좌표로 렌더 → 사진/영상 동일 처리.
--
-- 구조: text_overlays = [{ id, text, xPct, yPct, color, fontScale, rotation }]
--   - xPct, yPct: 미디어 대비 0~100 (%) — 화면 크기 무관하게 위치 재현
--   - color: hex (#ffffff 등)
--   - fontScale: 기준 폰트 대비 배율 (0.5 ~ 3.0)
--   - rotation: deg (선택, 기본 0)

ALTER TABLE chat_shots
  ADD COLUMN IF NOT EXISTS text_overlays JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN chat_shots.text_overlays IS
  'Migration 415: 인스타식 텍스트 오버레이 배열. [{id,text,xPct,yPct,color,fontScale,rotation}]. 재생 시 좌표로 렌더(파일 미합성).';
