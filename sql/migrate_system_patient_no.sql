-- ============================================================
-- 기존 데이터베이스 환자번호 구조를 시스템별 독립 카운터로 마이그레이션
-- 주의: 이 스크립트는 이미 운영 중인 시스템에서만 1회성으로 실행합니다.
-- ============================================================

-- 1. 기존 카운터 테이블을 강제로 날리고 새 구조로 생성
DROP TABLE IF EXISTS patient_counters CASCADE;
CREATE TABLE patient_counters (
    system_id UUID PRIMARY KEY REFERENCES systems(id),
    last_patient_no INT NOT NULL DEFAULT 0
);

-- 2. 기존 환자 테이블의 옛날 유니크 제약 조건 강제로 날리고 시스템별 유니크 걸기 & is_manual_no 추가
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_patient_no_key;
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_system_patient_no_unique;
ALTER TABLE patients ADD CONSTRAINT patients_system_patient_no_unique UNIQUE (system_id, patient_no);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_manual_no BOOLEAN DEFAULT FALSE;


-- 3. 새로 바뀐 구조에 맞추어 트리거 함수 교체 
-- (NEW.system_id 기준으로 카운터를 증가시키고 번호 발급)
CREATE OR REPLACE FUNCTION assign_patient_no()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.patient_no IS NULL AND NEW.system_id IS NOT NULL THEN
        INSERT INTO patient_counters (system_id, last_patient_no)
        VALUES (NEW.system_id, 1)
        ON CONFLICT (system_id) DO UPDATE
        SET last_patient_no = patient_counters.last_patient_no + 1
        RETURNING last_patient_no INTO NEW.patient_no;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';


-- 4. 기존에 이미 등록된 환자번호가 있다면 그걸 기준으로 시작 번호(카운터) 동기화
INSERT INTO patient_counters (system_id, last_patient_no)
SELECT system_id, COALESCE(MAX(patient_no), 0)
FROM patients
WHERE system_id IS NOT NULL
GROUP BY system_id
ON CONFLICT (system_id) DO UPDATE
SET last_patient_no = EXCLUDED.last_patient_no;


-- 5. [추가 반영] 모든 환자가 삭제되어 0명이 될 경우, 카운터를 다시 1번부터 시작하도록 0으로 리셋하는 트리거
CREATE OR REPLACE FUNCTION reset_patient_counter_if_empty()
RETURNS TRIGGER AS $$
BEGIN
    -- 삭제한 환자의 시스템에 남은 환자가 있는지 확인
    IF NOT EXISTS (SELECT 1 FROM patients WHERE system_id = OLD.system_id) THEN
        -- 남은 환자가 없으면 카운터를 0으로 초기화 (다음 등록 시 1번 부여)
        UPDATE patient_counters 
        SET last_patient_no = 0 
        WHERE system_id = OLD.system_id;
    END IF;
    RETURN OLD;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS tr_reset_patient_counter ON patients;
CREATE TRIGGER tr_reset_patient_counter
AFTER DELETE ON patients
FOR EACH ROW
EXECUTE FUNCTION reset_patient_counter_if_empty();
