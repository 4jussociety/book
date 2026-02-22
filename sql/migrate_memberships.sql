-- 신규 회원권(다회권) 관리 테이블 및 관련 트리거 추가

BEGIN;

-- 1. patient_memberships 테이블 생성
CREATE TABLE IF NOT EXISTS patient_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_id UUID REFERENCES systems(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    
    name TEXT NOT NULL,                 -- 회원권 이름 (예: 10회권 패키지)
    total_sessions INT NOT NULL,        -- 전체 부여된 횟수 (예: 10)
    used_sessions INT DEFAULT 0,        -- 현재까지 사용한 횟수
    
    amount_paid INT DEFAULT 0,          -- 실제 결제 금액
    payment_date DATE NOT NULL,         -- 결제일
    expiration_date DATE,               -- 만료일 (선택)
    
    status TEXT DEFAULT 'ACTIVE',       -- ACTIVE(사용중), EXHAUSTED(소진), EXPIRED(만료), REFUNDED(환불)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS 정책 설정
ALTER TABLE patient_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memberships_view" ON patient_memberships;
CREATE POLICY "memberships_view" ON patient_memberships FOR SELECT 
  USING (is_system_member(system_id));

DROP POLICY IF EXISTS "memberships_insert" ON patient_memberships;
CREATE POLICY "memberships_insert" ON patient_memberships FOR INSERT 
  WITH CHECK (has_role(system_id, ARRAY['owner', 'staff', 'therapist']));

DROP POLICY IF EXISTS "memberships_update" ON patient_memberships;
CREATE POLICY "memberships_update" ON patient_memberships FOR UPDATE 
  USING (has_role(system_id, ARRAY['owner', 'staff', 'therapist']));

DROP POLICY IF EXISTS "memberships_delete" ON patient_memberships;
CREATE POLICY "memberships_delete" ON patient_memberships FOR DELETE 
  USING (has_role(system_id, ARRAY['owner', 'staff', 'therapist']));


-- 2. appointments 테이블 연동 컬럼 추가
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS membership_id UUID REFERENCES patient_memberships(id) ON DELETE SET NULL;


-- 3. 예약 상태 변경에 따른 회원권 횟수 차감 트리거
CREATE OR REPLACE FUNCTION update_membership_usage() RETURNS TRIGGER AS $$
BEGIN
    -- 1. 이전 상태 복구 (OLD가 COMPLETED였고 membership_id가 있었다면)
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF OLD.status = 'COMPLETED' AND OLD.membership_id IS NOT NULL THEN
            UPDATE patient_memberships
            SET used_sessions = GREATEST(used_sessions - 1, 0),
                status = CASE WHEN GREATEST(used_sessions - 1, 0) < total_sessions THEN 'ACTIVE' ELSE status END,
                updated_at = now()
            WHERE id = OLD.membership_id;
        END IF;
    END IF;

    -- 2. 새로운 상태 적용 (NEW가 COMPLETED이고 membership_id가 있다면)
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF NEW.status = 'COMPLETED' AND NEW.membership_id IS NOT NULL THEN
            UPDATE patient_memberships
            SET used_sessions = used_sessions + 1,
                status = CASE WHEN used_sessions + 1 >= total_sessions THEN 'EXHAUSTED' ELSE status END,
                updated_at = now()
            WHERE id = NEW.membership_id;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성 전에 기존 트리거 제거 (멱등성)
DROP TRIGGER IF EXISTS trigger_update_membership_usage ON appointments;

CREATE TRIGGER trigger_update_membership_usage
AFTER INSERT OR UPDATE OR DELETE ON appointments
FOR EACH ROW
EXECUTE FUNCTION update_membership_usage();

COMMIT;
