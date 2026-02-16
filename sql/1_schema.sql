-- 1_schema.sql
-- 기본 테이블 스키마 및 컬럼 정의 (Global Schema)

BEGIN;

--------------------------------------------------------------------------------
-- 1. ENUM Types
--------------------------------------------------------------------------------
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

--------------------------------------------------------------------------------
-- 2. Systems Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS systems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_id UUID REFERENCES auth.users(id),
    serial_number TEXT UNIQUE DEFAULT upper(substr(md5(random()::text), 1, 8)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

--------------------------------------------------------------------------------
-- 3. Profiles Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    role TEXT, -- 'therapist' | 'staff' | NULL (Owner는 role에 의존하지 않음)
    system_id UUID REFERENCES systems(id),
    color_code TEXT DEFAULT '#3B82F6',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    -- 추가 컬럼들
    message_template TEXT DEFAULT '[예약 안내] {환자}님
일시: {일시}
장소: {장소}
담당: {담당자} 선생님',
    organization_name TEXT,
    contact_number TEXT
);

-- 기존 테이블이 있을 경우를 대비한 컬럼 추가 (Safe Migration)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS message_template TEXT DEFAULT '[예약 안내] {환자}님
일시: {일시}
장소: {장소}
담당: {담당자} 선생님';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS organization_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT; -- 기존 role 컬럼 확인

--------------------------------------------------------------------------------
-- 4. Guest Access Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guest_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    system_id UUID REFERENCES systems(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status access_status DEFAULT 'pending',
    role TEXT CHECK (role IN ('therapist', 'staff')), -- 게스트 역할 저장
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(system_id, user_id)
);

-- 기존 테이블이 있을 경우를 대비한 컬럼 추가
ALTER TABLE guest_access ADD COLUMN IF NOT EXISTS role TEXT CHECK (role IN ('therapist', 'staff'));

-- 외래 키 제약 조건 안전하게 추가
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_guest_access_profiles') THEN
         ALTER TABLE guest_access ADD CONSTRAINT fk_guest_access_profiles FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;

--------------------------------------------------------------------------------
-- 5. Patient Counters & Patients Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_counters (
    key TEXT PRIMARY KEY,
    last_patient_no INT NOT NULL DEFAULT 0
);
INSERT INTO patient_counters (key, last_patient_no) VALUES ('default', 0) ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_no INT UNIQUE,
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

--------------------------------------------------------------------------------
-- 6. Appointments Table
--------------------------------------------------------------------------------
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

COMMIT;
