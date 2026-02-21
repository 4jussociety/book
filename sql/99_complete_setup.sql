-- ============================================================
-- [Complete Database Setup & Maintenance Bundle]
-- 이 스크립트 하나로 전체 테이블 생성, 권한 설정, 기능 업데이트를 모두 처리합니다.
-- 포함된 내용:
-- 1. 기본 테이블 스키마 (Profiles, Patients, Appointments 등)
-- 2. 보안 정책 (RLS) - Owner/Guest 분리
-- 3. 핵심 함수 및 트리거 (회원가입, 예약 버전, 환자 번호 등)
-- 4. 유지보수 및 업데이트 (매출 컬럼, 통계 자동화 등)
-- ============================================================

BEGIN;

--------------------------------------------------------------------------------
-- [Part 1] 기본 스키마 정의 (1_schema.sql)
--------------------------------------------------------------------------------

-- 1. ENUM Types
DO $$ BEGIN
    CREATE TYPE access_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE event_type AS ENUM ('APPOINTMENT', 'BLOCK');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE appointment_status AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED', 'NOSHOW');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE gender AS ENUM ('MALE', 'FEMALE', 'M', 'F');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Systems Table
CREATE TABLE IF NOT EXISTS systems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    role TEXT, 
    system_id UUID REFERENCES systems(id),
    color_code TEXT DEFAULT '#3B82F6',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    message_template TEXT DEFAULT '[예약 안내] {환자}님
일시: {일시}
장소: {장소}
담당: {담당자} 선생님',
    organization_name TEXT,
    contact_number TEXT
);
-- Safe Migration columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS incentive_percentage DECIMAL(5, 2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS message_template TEXT DEFAULT '[예약 안내] {환자}님
일시: {일시}
장소: {장소}
담당: {담당자} 선생님';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS organization_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT;

-- 4. Guest Access Table
CREATE TABLE IF NOT EXISTS guest_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    system_id UUID REFERENCES systems(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status access_status DEFAULT 'approved',
    role TEXT CHECK (role IN ('therapist', 'staff')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(system_id, user_id)
);
ALTER TABLE guest_access ADD COLUMN IF NOT EXISTS role TEXT CHECK (role IN ('therapist', 'staff'));

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_guest_access_profiles') THEN
         ALTER TABLE guest_access ADD CONSTRAINT fk_guest_access_profiles FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 5. Patients Table
CREATE TABLE IF NOT EXISTS patient_counters (
    system_id UUID PRIMARY KEY REFERENCES systems(id),
    last_patient_no INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_no INT,
    is_manual_no BOOLEAN DEFAULT FALSE,
    name TEXT NOT NULL,
    phone TEXT,
    gender gender,
    birth_date DATE,
    memo TEXT,
    visit_count INT DEFAULT 0,
    last_visit DATE,
    first_visit_date DATE DEFAULT CURRENT_DATE,
    last_appointment_at TIMESTAMP WITH TIME ZONE,
    system_id UUID REFERENCES systems(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(system_id, patient_no)
);

-- 6. Appointments Table
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type event_type NOT NULL DEFAULT 'APPOINTMENT',
    therapist_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status appointment_status NOT NULL DEFAULT 'PENDING',
    visit_count INT,
    note TEXT,
    block_title TEXT,
    block_memo TEXT,
    series_id UUID,
    version INT DEFAULT 1,
    system_id UUID REFERENCES systems(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
-- Realtime Setup (Replica Identity & Publication)
-- 이것이 없으면 UPDATE 시 전체 로우 데이터가 오지 않아 필터링이 안될 수 있음
ALTER TABLE appointments REPLICA IDENTITY FULL;
ALTER TABLE profiles REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'appointments') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE appointments;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'profiles') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
    END IF;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

--------------------------------------------------------------------------------
-- [Part 2] 보안 정책 (RLS) (3_rls.sql)
--------------------------------------------------------------------------------
ALTER TABLE systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Helper Functions
CREATE OR REPLACE FUNCTION is_system_owner(sys_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM systems WHERE id = sys_id AND owner_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_system_member(sys_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM guest_access 
    WHERE system_id = sys_id 
      AND user_id = auth.uid() 
      AND status = 'approved'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Policies
-- Systems
DROP POLICY IF EXISTS "Systems are viewable by everyone" ON systems;
CREATE POLICY "Systems are viewable by everyone" ON systems FOR SELECT USING (true);
DROP POLICY IF EXISTS "Owners can update systems" ON systems;
CREATE POLICY "Owners can update systems" ON systems FOR UPDATE USING (auth.uid() = owner_id);

-- Profiles
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Owners can update member profiles" ON profiles;
CREATE POLICY "Owners can update member profiles" ON profiles FOR UPDATE USING (
    system_id IN (SELECT id FROM systems WHERE owner_id = auth.uid())
);

-- Guest Access
DROP POLICY IF EXISTS "Owner manage system requests" ON guest_access;
CREATE POLICY "Owner manage system requests" ON guest_access FOR ALL USING (is_system_owner(system_id));
DROP POLICY IF EXISTS "Guest manage own access" ON guest_access;
CREATE POLICY "Guest manage own access" ON guest_access FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Members view system guests" ON guest_access;
CREATE POLICY "Members view system guests" ON guest_access FOR SELECT USING (
    is_system_owner(system_id) OR is_system_member(system_id)
);

-- Patients & Appointments
DROP POLICY IF EXISTS "System access for patients" ON patients;
CREATE POLICY "System access for patients" ON patients FOR ALL USING ( 
    is_system_owner(system_id) OR is_system_member(system_id)
);
DROP POLICY IF EXISTS "System isolated access for appointments" ON appointments;
DROP POLICY IF EXISTS "System access for appointments" ON appointments;
CREATE POLICY "System access for appointments" ON appointments FOR ALL USING ( 
    is_system_owner(system_id) OR is_system_member(system_id)
);

--------------------------------------------------------------------------------
-- [Part 3] 핵심 함수 및 트리거 (Functions & Maintenance)
--------------------------------------------------------------------------------

-- 3.1 Auth Triggers
CREATE OR REPLACE FUNCTION handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
      new.id, 
      new.email, 
      COALESCE(new.raw_user_meta_data->>'full_name', 'User')
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    email = EXCLUDED.email;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 3.2 Appointment Version Logic
CREATE OR REPLACE FUNCTION update_version_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.version = OLD.version + 1;
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS tr_appointments_version ON appointments;
CREATE TRIGGER tr_appointments_version
BEFORE UPDATE ON appointments
FOR EACH ROW
EXECUTE FUNCTION update_version_column();

-- 3.3 Patient Number Logic
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

DROP TRIGGER IF EXISTS tr_assign_patient_no ON patients;
CREATE TRIGGER tr_assign_patient_no
BEFORE INSERT ON patients
FOR EACH ROW
EXECUTE FUNCTION assign_patient_no();

-- 3.3.1 Reset Patient Counter on Empty
CREATE OR REPLACE FUNCTION reset_patient_counter_if_empty()
RETURNS TRIGGER AS $$
BEGIN
    -- 현재 삭제된 환자의 시스템에 남은 환자가 있는지 확인
    IF NOT EXISTS (SELECT 1 FROM patients WHERE system_id = OLD.system_id) THEN
        -- 남은 환자가 없으면 카운터를 0으로 초기화
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

-- Removed Guest Login RPC (Replaced by Edge Function create_member)


-- [Part 4] 예약 방문 횟수 자동 계산
-- [Part 4] 예약 방문 횟수 자동 계산 (Ripple Update)
-- NOSHOW, CANCELLED 제외하고 start_time 순서대로 1, 2, 3... 재부여
CREATE OR REPLACE FUNCTION sync_visit_counts(p_patient_id UUID) RETURNS VOID AS $$
BEGIN
    WITH valid_seq AS (
        -- 1. 유효한 예약만 골라서 순번 매기기 (1, 2, 3...)
        SELECT id, 
               ROW_NUMBER() OVER (
                   PARTITION BY patient_id 
                   ORDER BY start_time, created_at
               ) as new_seq
        FROM appointments
        WHERE patient_id = p_patient_id
          AND event_type = 'APPOINTMENT'
          AND status NOT IN ('CANCELLED', 'NOSHOW')
    ),
    invalid_seq AS (
        -- 2. 무효한 예약은 NULL 처리
        SELECT id, NULL::int as new_seq
        FROM appointments
        WHERE patient_id = p_patient_id
          AND event_type = 'APPOINTMENT'
          AND status IN ('CANCELLED', 'NOSHOW')
    ),
    all_updates AS (
        SELECT * FROM valid_seq
        UNION ALL
        SELECT * FROM invalid_seq
    )
    UPDATE appointments a
    SET visit_count = au.new_seq
    FROM all_updates au
    WHERE a.id = au.id
      AND a.visit_count IS DISTINCT FROM au.new_seq;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_sync_visit_counts() RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        PERFORM sync_visit_counts(OLD.patient_id);
        RETURN OLD;
    ELSIF (TG_OP = 'INSERT') THEN
         -- INSERT 시에는 무조건 재계산 (과거 날짜 삽입 등 고려)
        PERFORM sync_visit_counts(NEW.patient_id);
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        -- 환자 변경 시 양쪽 모두 갱신
        IF (OLD.patient_id IS DISTINCT FROM NEW.patient_id) THEN
            PERFORM sync_visit_counts(OLD.patient_id);
            PERFORM sync_visit_counts(NEW.patient_id);
        -- 상태나 시간이 변경된 경우 재계산
        ELSIF (OLD.status IS DISTINCT FROM NEW.status) OR (OLD.start_time IS DISTINCT FROM NEW.start_time) THEN
             PERFORM sync_visit_counts(NEW.patient_id);
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_set_visit_count ON appointments; -- 구버전 트리거 삭제
DROP TRIGGER IF EXISTS tr_sync_visit_counts ON appointments;

CREATE TRIGGER tr_sync_visit_counts
AFTER INSERT OR DELETE OR UPDATE OF status, start_time, patient_id ON appointments
FOR EACH ROW
EXECUTE FUNCTION trigger_sync_visit_counts();


-- [Part 5] 환자 통계(총 방문, 최근 방문) 자동 동기화
-- NOSHOW, CANCELLED 제외
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
            last_visit = (
                SELECT MAX(start_time)
                FROM appointments
                WHERE patient_id = target_patient_id
                AND event_type = 'APPOINTMENT'
                AND status NOT IN ('CANCELLED', 'NOSHOW')
                AND start_time <= NOW()
            )
        WHERE id = target_patient_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_update_patient_stats ON appointments;
CREATE TRIGGER tr_update_patient_stats
AFTER INSERT OR UPDATE OR DELETE ON appointments
FOR EACH ROW
EXECUTE FUNCTION update_patient_stats();

-- 초기 데이터 동기화 (기존 데이터 일괄 보정)
DO $$
DECLARE
    r RECORD;
BEGIN
    -- 1. 모든 환자의 회차 재계산
    FOR r IN SELECT id FROM patients LOOP
        PERFORM sync_visit_counts(r.id);
    END LOOP;

    -- 2. 환자 통계 갱신
    UPDATE patients p
    SET 
        visit_count = (
            SELECT COUNT(*) 
            FROM appointments a
            WHERE a.patient_id = p.id 
            AND a.event_type = 'APPOINTMENT'
            AND a.status NOT IN ('CANCELLED', 'NOSHOW')
        ),
        last_visit = (
            SELECT MAX(start_time)
            FROM appointments a
            WHERE a.patient_id = p.id 
            AND a.event_type = 'APPOINTMENT'
            AND a.status NOT IN ('CANCELLED', 'NOSHOW')
            AND a.start_time <= NOW()
        );
END $$;

COMMIT;
