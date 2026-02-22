-- 최근 DB 수정 내역(profiles 컬럼 추가, 방문일 타임존 보정) 통합 마이그레이션 스크립트
-- Supabase SQL Editor에서 전체 복사 후 한 번 실행하세요.

BEGIN;

-- 1. profiles 테이블 누락 컬럼 (폰번호, 인센티브 비율) 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS incentive_percentage NUMERIC(5,2) DEFAULT 0;


-- 2. 방문일 관련 DB 트리거 로직 수정: 시간대 기반의 정확한 계산
CREATE OR REPLACE FUNCTION update_patient_stats() RETURNS TRIGGER AS $$
DECLARE
    target_patient_id UUID;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        target_patient_id := OLD.patient_id;
    ELSE
        target_patient_id := NEW.patient_id;
    END IF;

    IF target_patient_id IS NOT NULL THEN
        UPDATE patients
        SET 
            visit_count = (
                SELECT COUNT(*) 
                FROM appointments 
                WHERE patient_id = target_patient_id 
                AND event_type = 'APPOINTMENT'
                AND status NOT IN ('CANCELLED', 'NOSHOW')
            ),
            -- 기존 MAX(start_time)을 바로 DATE로 변환하는 대신 KST 기준 DATE로 추출
            last_visit = (
                SELECT MAX(start_time AT TIME ZONE 'Asia/Seoul')::DATE
                FROM appointments
                WHERE patient_id = target_patient_id
                AND event_type = 'APPOINTMENT'
                AND status NOT IN ('CANCELLED', 'NOSHOW')
                AND start_time <= NOW()
            ),
            -- first_visit_date 도 KST 기반 최초 예약일로 교정
            first_visit_date = (
                SELECT MIN(start_time AT TIME ZONE 'Asia/Seoul')::DATE
                FROM appointments
                WHERE patient_id = target_patient_id
                AND event_type = 'APPOINTMENT'
                AND status NOT IN ('CANCELLED', 'NOSHOW')
            )
        WHERE id = target_patient_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;


-- 3. 전체 데이터 KST 기준으로 일괄 보정 업데이트 실행
UPDATE patients p
SET 
  last_visit = (
      SELECT MAX(start_time AT TIME ZONE 'Asia/Seoul')::DATE
      FROM appointments a
      WHERE a.patient_id = p.id
      AND event_type = 'APPOINTMENT'
      AND status NOT IN ('CANCELLED', 'NOSHOW')
      AND start_time <= NOW()
  ),
  first_visit_date = (
      SELECT MIN(start_time AT TIME ZONE 'Asia/Seoul')::DATE
      FROM appointments a
      WHERE a.patient_id = p.id
      AND event_type = 'APPOINTMENT'
      AND status NOT IN ('CANCELLED', 'NOSHOW')
  );

COMMIT;
