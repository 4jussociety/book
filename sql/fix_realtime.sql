-- Supabase 리얼타임(Realtime) 강제 활성화 스크립트 최종본
-- 이 쿼리를 Supabase Studio의 SQL Editor에 복사하여 실행해주세요.

-- 1. 각각의 테이블에서 상세한 변경 데이터를 넘겨주도록 Replica 설정
ALTER TABLE appointments REPLICA IDENTITY FULL;
ALTER TABLE profiles REPLICA IDENTITY FULL;

-- 2. 안전하게 테이블 추가 (이미 추가되어 있으면 무시함)
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE appointments;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
