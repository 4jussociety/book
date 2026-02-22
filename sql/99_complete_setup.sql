-- ============================================================
-- [Complete Database Setup & Maintenance Bundle] - 권한 × 기능 하이브리드 구조
-- systems 핵심 정보 + 기능별 설정 테이블 분리 + 역할 기반 RLS
-- ============================================================

BEGIN;

--------------------------------------------------------------------------------
-- [Part 1] 기본 스키마 정의
--------------------------------------------------------------------------------

-- 1. ENUM Types
DO $$ BEGIN
    CREATE TYPE access_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE event_type AS ENUM ('APPOINTMENT', 'BLOCK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE appointment_status AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED', 'NOSHOW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE gender AS ENUM ('MALE', 'FEMALE', 'M', 'F');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Systems Table (업체 핵심 정보)
CREATE TABLE IF NOT EXISTS systems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    organization_name TEXT,
    contact_number TEXT,
    admin_name TEXT,
    last_patient_no INT DEFAULT 0
);
-- Migration 방어 코드
ALTER TABLE systems ADD COLUMN IF NOT EXISTS organization_name TEXT;
ALTER TABLE systems ADD COLUMN IF NOT EXISTS contact_number TEXT;
ALTER TABLE systems ADD COLUMN IF NOT EXISTS admin_name TEXT;
ALTER TABLE systems ADD COLUMN IF NOT EXISTS last_patient_no INT DEFAULT 0;


-- 3. Profiles Table (순수 유저 정보)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    phone TEXT,
    incentive_percentage NUMERIC(5,2) DEFAULT 0,
    color_code TEXT DEFAULT '#3B82F6',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS incentive_percentage NUMERIC(5,2) DEFAULT 0;

-- 4. System Members Table (소속 및 역할 관리)
CREATE TABLE IF NOT EXISTS system_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    system_id UUID REFERENCES systems(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status access_status DEFAULT 'approved',
    role TEXT CHECK (role IN ('owner', 'therapist', 'staff')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(system_id, user_id)
);
ALTER TABLE system_members ADD COLUMN IF NOT EXISTS role TEXT CHECK (role IN ('owner', 'therapist', 'staff'));

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_system_members_profiles') THEN
         ALTER TABLE system_members ADD CONSTRAINT fk_system_members_profiles FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;


-- 5. Patients Table
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

-- 7. Pricing Settings Table (치료 시간별 단가 설정)
CREATE TABLE IF NOT EXISTS pricing_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    system_id UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    duration_minutes INT NOT NULL,
    price INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(system_id, duration_minutes)
);

-- 8. Message Templates Table (예약 안내 문자 템플릿)
CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    system_id UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    template_name TEXT NOT NULL DEFAULT '기본 템플릿',
    template_body TEXT NOT NULL,
    is_default BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(system_id, template_name)
);

-- Realtime 설정
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
-- [Part 2] 보안 정책 (RLS)
--------------------------------------------------------------------------------
ALTER TABLE systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

-- Helper Functions
CREATE OR REPLACE FUNCTION is_system_owner(sys_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM systems WHERE id = sys_id AND owner_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_system_member(sys_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM system_members 
    WHERE system_id = sys_id 
      AND user_id = auth.uid() 
      AND status = 'approved'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 역할 배열 기반 접근 체크
CREATE OR REPLACE FUNCTION has_role(sys_id UUID, allowed_roles TEXT[])
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM system_members
    WHERE system_id = sys_id
      AND user_id = auth.uid()
      AND status = 'approved'
      AND role = ANY(allowed_roles)
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 현재 유저의 역할 반환
CREATE OR REPLACE FUNCTION get_my_role(sys_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM system_members
  WHERE system_id = sys_id
    AND user_id = auth.uid()
    AND status = 'approved'
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Policies: Systems
DROP POLICY IF EXISTS "Systems are viewable by everyone" ON systems;
CREATE POLICY "Systems are viewable by everyone" ON systems FOR SELECT USING (true);
DROP POLICY IF EXISTS "Owners can update systems" ON systems;
CREATE POLICY "Owners can update systems" ON systems FOR UPDATE USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Authenticated users can create systems" ON systems;
CREATE POLICY "Authenticated users can create systems" ON systems FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Policies: Profiles
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Owners can update member profiles" ON profiles;
CREATE POLICY "Owners can update member profiles" ON profiles FOR UPDATE USING (
    id IN (SELECT user_id FROM system_members WHERE system_id IN (SELECT id FROM systems WHERE owner_id = auth.uid()))
);

-- Policies: System Members
DROP POLICY IF EXISTS "Owner manage system requests" ON system_members;
DROP POLICY IF EXISTS "Guest manage own access" ON system_members;
DROP POLICY IF EXISTS "Members view system guests" ON system_members;
DROP POLICY IF EXISTS "Owner manage system members" ON system_members;
DROP POLICY IF EXISTS "Member manage own access" ON system_members;
DROP POLICY IF EXISTS "Members view system members" ON system_members;
DROP POLICY IF EXISTS "Users can insert own system member" ON system_members;

CREATE POLICY "Owner manage system members" ON system_members FOR ALL USING (is_system_owner(system_id));
CREATE POLICY "Member manage own access" ON system_members FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Members view system members" ON system_members FOR SELECT USING (
    is_system_owner(system_id) OR is_system_member(system_id)
);
CREATE POLICY "Users can insert own system member" ON system_members FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policies: Patients & Appointments
DROP POLICY IF EXISTS "System access for patients" ON patients;
CREATE POLICY "System access for patients" ON patients FOR ALL USING ( 
    is_system_owner(system_id) OR is_system_member(system_id)
);

DROP POLICY IF EXISTS "System isolated access for appointments" ON appointments;
DROP POLICY IF EXISTS "System access for appointments" ON appointments;
CREATE POLICY "System access for appointments" ON appointments FOR ALL USING ( 
    is_system_owner(system_id) OR is_system_member(system_id)
);

-- Policies: Pricing Settings (관리자: 전체, 치료사: 조회, 스태프: 접근 불가)
DROP POLICY IF EXISTS "pricing_owner_all" ON pricing_settings;
CREATE POLICY "pricing_owner_all" ON pricing_settings FOR ALL
  USING (has_role(system_id, ARRAY['owner']));

DROP POLICY IF EXISTS "pricing_therapist_read" ON pricing_settings;
CREATE POLICY "pricing_therapist_read" ON pricing_settings FOR SELECT
  USING (has_role(system_id, ARRAY['therapist']));

-- Policies: Message Templates (모든 승인된 멤버: 전체 접근)
DROP POLICY IF EXISTS "template_owner_all" ON message_templates;
CREATE POLICY "template_owner_all" ON message_templates FOR ALL
  USING (is_system_member(system_id));

DROP POLICY IF EXISTS "template_member_read" ON message_templates;
CREATE POLICY "template_member_read" ON message_templates FOR SELECT
  USING (is_system_member(system_id));

--------------------------------------------------------------------------------
-- [Part 3] 핵심 함수 및 트리거 (Functions & Maintenance)
--------------------------------------------------------------------------------

-- 3.0 Owner Role Enforcement
CREATE OR REPLACE FUNCTION enforce_owner_role()
RETURNS TRIGGER AS $$
BEGIN
    -- If the member being inserted or updated is the owner of the system
    IF EXISTS (SELECT 1 FROM systems WHERE id = NEW.system_id AND owner_id = NEW.user_id) THEN
        -- Force the role to be 'owner' regardless of what was requested
        NEW.role = 'owner';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_enforce_owner_role ON system_members;
CREATE TRIGGER tr_enforce_owner_role
BEFORE INSERT OR UPDATE ON system_members
FOR EACH ROW
EXECUTE FUNCTION enforce_owner_role();

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
        UPDATE systems 
        SET last_patient_no = last_patient_no + 1
        WHERE id = NEW.system_id
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
        UPDATE systems 
        SET last_patient_no = 0 
        WHERE id = OLD.system_id;
    END IF;
    RETURN OLD;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS tr_reset_patient_counter ON patients;
CREATE TRIGGER tr_reset_patient_counter
AFTER DELETE ON patients
FOR EACH ROW
EXECUTE FUNCTION reset_patient_counter_if_empty();

-- 3.4 updated_at 자동 갱신 (pricing_settings, message_templates)
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_pricing_updated ON pricing_settings;
CREATE TRIGGER tr_pricing_updated
BEFORE UPDATE ON pricing_settings
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS tr_templates_updated ON message_templates;
CREATE TRIGGER tr_templates_updated
BEFORE UPDATE ON message_templates
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

--------------------------------------------------------------------------------
-- [Part 4] 예약 방문 횟수 자동 계산
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_visit_counts(p_patient_id UUID) RETURNS VOID AS $$
BEGIN
    WITH valid_seq AS (
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
        PERFORM sync_visit_counts(NEW.patient_id);
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.patient_id IS DISTINCT FROM NEW.patient_id) THEN
            PERFORM sync_visit_counts(OLD.patient_id);
            PERFORM sync_visit_counts(NEW.patient_id);
        ELSIF (OLD.status IS DISTINCT FROM NEW.status) OR (OLD.start_time IS DISTINCT FROM NEW.start_time) THEN
             PERFORM sync_visit_counts(NEW.patient_id);
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_sync_visit_counts ON appointments;
CREATE TRIGGER tr_sync_visit_counts
AFTER INSERT OR DELETE OR UPDATE OF status, start_time, patient_id ON appointments
FOR EACH ROW
EXECUTE FUNCTION trigger_sync_visit_counts();

--------------------------------------------------------------------------------
-- [Part 5] 환자 통계(총 방문, 최근 방문) 자동 동기화
--------------------------------------------------------------------------------
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

--------------------------------------------------------------------------------
-- [Part 6] 기존 데이터 마이그레이션 (systems → 기능별 테이블)
-- 최초 실행 시에만 동작하며, 이미 데이터가 있으면 건너뜀
--------------------------------------------------------------------------------

-- 단가 데이터 이전 (systems.price_* → pricing_settings)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'systems' AND column_name = 'price_30m') THEN
        INSERT INTO pricing_settings (system_id, duration_minutes, price)
        SELECT id, 30, COALESCE(price_30m, 0) FROM systems
        ON CONFLICT (system_id, duration_minutes) DO NOTHING;

        INSERT INTO pricing_settings (system_id, duration_minutes, price)
        SELECT id, 40, COALESCE(price_40m, 0) FROM systems
        ON CONFLICT (system_id, duration_minutes) DO NOTHING;

        INSERT INTO pricing_settings (system_id, duration_minutes, price)
        SELECT id, 50, COALESCE(price_50m, 0) FROM systems
        ON CONFLICT (system_id, duration_minutes) DO NOTHING;

        INSERT INTO pricing_settings (system_id, duration_minutes, price)
        SELECT id, 60, COALESCE(price_60m, 0) FROM systems
        ON CONFLICT (system_id, duration_minutes) DO NOTHING;
    END IF;
END $$;

-- 문자 템플릿 데이터 이전 (systems.message_template → message_templates)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'systems' AND column_name = 'message_template') THEN
        INSERT INTO message_templates (system_id, template_name, template_body, is_default)
        SELECT id, '기본 템플릿',
               COALESCE(message_template, '[예약 안내] {환자}님
일시: {일시}
장소: {장소}
담당: {담당자} 선생님'),
               TRUE
        FROM systems
        WHERE NOT EXISTS (SELECT 1 FROM message_templates WHERE message_templates.system_id = systems.id)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

COMMIT;
