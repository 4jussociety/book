-- 5_enable_realtime.sql

BEGIN;

-- 1. Realtime Publication에 appointments 테이블 추가
-- (Supabase 대시보드에서 'Table Editor -> realtime' 켜는 것과 동일)
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE appointments;

-- 2. Replica Identity 설정 (UPDATE 이벤트 시 Old Record 수신을 위해 필요할 수 있음)
ALTER TABLE appointments REPLICA IDENTITY FULL;

COMMIT;
