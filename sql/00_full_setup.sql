-- ============================================================
-- [통합 데이터베이스 설정 스크립트] v4.0
-- 모든 SQL을 하나로 병합: 스키마 + RLS + 함수 + 트리거 + 마이그레이션
-- Supabase SQL Editor에서 전체 복사 후 한 번 실행하세요.
--
-- ※ 이 스크립트는 멱등성(idempotent)을 보장합니다.
--   이미 존재하는 객체는 건너뛰거나 재생성합니다.
-- ============================================================

BEGIN;

-- ========================================================================
-- [Part 1] ENUM 타입 정의
-- 용도: 특정 컬럼에 허용되는 값을 제한하여 데이터 무결성 보장
-- ========================================================================

-- 멤버 가입 승인 상태 (pending: 대기, approved: 승인, rejected: 거절)
DO $$ BEGIN
    CREATE TYPE access_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 예약 유형 (APPOINTMENT: 일반 예약, BLOCK: 시간 잠금)
DO $$ BEGIN
    CREATE TYPE event_type AS ENUM ('APPOINTMENT', 'BLOCK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 예약 상태 (PENDING: 예정, COMPLETED: 완료, CANCELLED: 취소, NOSHOW: 미출석)
DO $$ BEGIN
    CREATE TYPE appointment_status AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED', 'NOSHOW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 성별
DO $$ BEGIN
    CREATE TYPE gender AS ENUM ('MALE', 'FEMALE', 'M', 'F');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ========================================================================
-- [Part 2] 테이블 정의
-- ========================================================================

-- ──────────────────────────────────────────────
-- (1) systems: 센터(업체) 핵심 정보
-- 하나의 시스템 = 하나의 센터를 의미
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS systems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,                              -- 시스템(센터) 이름
    owner_id UUID REFERENCES auth.users(id),         -- 소유자(최고 관리자) ID
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    organization_name TEXT,                          -- 업체명 (안내문자 {장소} 변수)
    contact_number TEXT,                             -- 매니저 연락처
    manager_name TEXT,                               -- 매니저 이름
    last_client_no INTEGER DEFAULT 0 NOT NULL,       -- 고객 자동 번호 카운터
    default_session_name VARCHAR(255) DEFAULT '매뉴얼PT', -- 기본 수업 종류명
    option1_name TEXT DEFAULT NULL,                  -- 옵션1 수업 종류명
    option2_name TEXT DEFAULT NULL,                  -- 옵션2 수업 종류명
    option3_name TEXT DEFAULT NULL,                  -- 옵션3 수업 종류명
    schedule_code CHAR(6) UNIQUE                     -- 멤버 로그인용 6자리 스케줄 코드
);
-- 기존 DB 호환: 컬럼이 없으면 추가
ALTER TABLE systems ADD COLUMN IF NOT EXISTS organization_name TEXT;
ALTER TABLE systems ADD COLUMN IF NOT EXISTS contact_number TEXT;
ALTER TABLE systems ADD COLUMN IF NOT EXISTS manager_name TEXT;
ALTER TABLE systems ADD COLUMN IF NOT EXISTS last_client_no INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE systems ADD COLUMN IF NOT EXISTS default_session_name VARCHAR(255) DEFAULT '매뉴얼PT';
ALTER TABLE systems ADD COLUMN IF NOT EXISTS option1_name TEXT DEFAULT NULL;
ALTER TABLE systems ADD COLUMN IF NOT EXISTS option2_name TEXT DEFAULT NULL;
ALTER TABLE systems ADD COLUMN IF NOT EXISTS option3_name TEXT DEFAULT NULL;
ALTER TABLE systems ADD COLUMN IF NOT EXISTS schedule_code CHAR(6) UNIQUE;

-- 6자리 스케줄 코드 자동 생성 함수
CREATE OR REPLACE FUNCTION generate_schedule_code()
RETURNS TRIGGER AS $$
DECLARE
    new_code CHAR(6);
BEGIN
    IF NEW.schedule_code IS NULL OR NEW.schedule_code = '' THEN
        LOOP
            new_code := lpad(floor(random() * 1000000)::text, 6, '0');
            EXIT WHEN NOT EXISTS (SELECT 1 FROM systems WHERE schedule_code = new_code);
        END LOOP;
        NEW.schedule_code := new_code;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_generate_schedule_code ON systems;
CREATE TRIGGER tr_generate_schedule_code
BEFORE INSERT ON systems
FOR EACH ROW EXECUTE FUNCTION generate_schedule_code();

-- ──────────────────────────────────────────────
-- (2) profiles: 사용자(선생님/스태프) 프로필
-- auth.users와 1:1 연결, 프로필 정보 저장
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    phone TEXT,
    incentive_percentage NUMERIC(5,2) DEFAULT 0,       -- 기본 수업 인센티브 비율(%)
    incentive_percentage_opt1 NUMERIC(5,2) DEFAULT 0,  -- 옵션1 인센티브 비율(%)
    incentive_percentage_opt2 NUMERIC(5,2) DEFAULT 0,  -- 옵션2 인센티브 비율(%)
    incentive_percentage_opt3 NUMERIC(5,2) DEFAULT 0,  -- 옵션3 인센티브 비율(%)
    color_code TEXT DEFAULT '#3B82F6',                 -- 캘린더 표시 색상
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS incentive_percentage NUMERIC(5,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS incentive_percentage_opt1 NUMERIC(5,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS incentive_percentage_opt2 NUMERIC(5,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS incentive_percentage_opt3 NUMERIC(5,2) DEFAULT 0;

-- ──────────────────────────────────────────────
-- (3) system_members: 소속 및 역할 관리
-- 어떤 유저가 어떤 시스템에 어떤 역할(owner/instructor/staff)로 소속
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    system_id UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'instructor', 'staff')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(system_id, user_id)
);

-- system_members → profiles 외래 키 (없으면 추가)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_system_members_profiles') THEN
         ALTER TABLE system_members ADD CONSTRAINT fk_system_members_profiles FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ──────────────────────────────────────────────
-- (4) clients: 고객(회원) 정보
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_no INT,                                     -- 자동 부여 고객 번호
    is_manual_no BOOLEAN DEFAULT FALSE,               -- 수동 번호 여부
    name TEXT NOT NULL,
    phone TEXT,
    gender gender,
    birth_date DATE,
    memo TEXT,
    visit_count INT DEFAULT 0,                        -- 총 방문 횟수 (트리거로 자동 계산)
    last_visit DATE,                                  -- 최근 방문일 (트리거로 자동 갱신)
    first_visit_date DATE DEFAULT CURRENT_DATE,       -- 최초 방문일 (트리거로 자동 갱신)
    last_appointment_at TIMESTAMP WITH TIME ZONE,
    system_id UUID REFERENCES systems(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(system_id, client_no)
);

-- ──────────────────────────────────────────────
-- (5) appointments: 예약 정보
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type event_type NOT NULL DEFAULT 'APPOINTMENT',
    instructor_id UUID REFERENCES profiles(id) ON DELETE CASCADE,   -- 담당 선생님
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,       -- 고객
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status appointment_status NOT NULL DEFAULT 'PENDING',
    visit_count INT,                                -- 해당 고객의 N회차 (트리거로 자동 계산)
    note TEXT,                                      -- 메모
    block_title TEXT,                               -- 잠금 블록 제목
    block_memo TEXT,                                -- 잠금 블록 메모
    series_id UUID,                                 -- 반복 예약 시리즈 ID
    version INT DEFAULT 1,                          -- 낙관적 동시성 제어용 버전
    system_id UUID REFERENCES systems(id),
    session_type TEXT DEFAULT 'normal',             -- 수업 종류(normal/option1/option2/option3)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ──────────────────────────────────────────────
-- (6) pricing_settings: 수업 시간별 단가 설정
-- system_id + duration_minutes + session_type 조합으로 고유
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    system_id UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    duration_minutes INT NOT NULL,                   -- 수업 시간(분): 30, 40, 50, 60
    session_type TEXT DEFAULT 'normal',             -- 수업 종류
    price INT NOT NULL DEFAULT 0,                   -- 1회 단가(원)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(system_id, duration_minutes, session_type)
);

-- ──────────────────────────────────────────────
-- (7) message_templates: 예약 안내 문자 템플릿
-- {고객}, {일시}, {장소}, {담당자}, {연락처} 변수 지원
-- ──────────────────────────────────────────────
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

-- ──────────────────────────────────────────────
-- (8) ticket_packages: 이용권 상품(패키지) 목록
-- 센터에서 사전 설정해두는 이용권 템플릿
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    system_id UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                              -- 상품명 (예: 10회 PT 패키지)
    session_type TEXT DEFAULT 'normal',             -- 적용 수업 종류
    total_sessions INT NOT NULL,                    -- 총 횟수
    default_price INT NOT NULL DEFAULT 0,           -- 기본 결제 금액(원)
    valid_days INT,                                 -- 유효기간(일), NULL이면 무제한
    is_active BOOLEAN DEFAULT TRUE,                 -- 활성 여부
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 기존 membership_packages → ticket_packages 마이그레이션
ALTER TABLE IF EXISTS membership_packages RENAME TO ticket_packages;

-- ──────────────────────────────────────────────
-- (9) client_tickets: 고객별 이용권 (발급 내역)
-- 고객에게 실제 발급된 이용권 기록
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    system_id UUID REFERENCES systems(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                              -- 이용권 이름 (예: 10회권 패키지)
    total_sessions INT NOT NULL,                    -- 전체 부여 횟수
    used_sessions INT DEFAULT 0,                    -- 사용 횟수 (트리거로 자동 증감)
    amount_paid INT DEFAULT 0,                      -- 실제 결제 금액(원)
    payment_date DATE NOT NULL,                     -- 결제일
    expiration_date DATE,                           -- 만료일 (NULL이면 무제한)
    status TEXT DEFAULT 'ACTIVE',                   -- ACTIVE/EXHAUSTED/EXPIRED/REFUNDED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 기존 client_memberships → client_tickets 마이그레이션
ALTER TABLE IF EXISTS client_memberships RENAME TO client_tickets;

-- ──────────────────────────────────────────────
-- (10) appointments에 이용권 연동 컬럼 추가
-- 예약과 이용권을 연결 (이용권 차감 추적용)
-- ──────────────────────────────────────────────
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES client_tickets(id) ON DELETE SET NULL;

-- 기존 membership_id → ticket_id 마이그레이션
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='membership_id') THEN
        -- 데이터를 ticket_id로 복사 후 membership_id 컬럼 삭제
        UPDATE appointments SET ticket_id = membership_id WHERE membership_id IS NOT NULL AND ticket_id IS NULL;
        ALTER TABLE appointments DROP COLUMN membership_id;
    END IF;
END $$;

-- ──────────────────────────────────────────────
-- (11) global_ads: 플랫폼 전역 광고 관리
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS global_ads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id TEXT NOT NULL,                           -- 광고 슬롯 식별자
    image_url TEXT NOT NULL,                         -- 이미지 URL
    link_url TEXT,                                   -- 클릭 시 이동 URL
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,                    -- 정렬 순서
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE global_ads ADD COLUMN IF NOT EXISTS slot_id TEXT;
ALTER TABLE global_ads ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE global_ads DROP CONSTRAINT IF EXISTS unique_slot_id;
DO $$ BEGIN
    ALTER TABLE global_ads ALTER COLUMN slot_id SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ──────────────────────────────────────────────
-- (12) Storage: 광고 이미지 버킷
-- ──────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('global-ads', 'global-ads', true)
ON CONFLICT (id) DO NOTHING;


-- ========================================================================
-- [Part 3] Realtime 설정
-- 예약/프로필 변경 시 실시간 UI 반영을 위한 설정
-- ========================================================================

ALTER TABLE appointments REPLICA IDENTITY FULL;
ALTER TABLE profiles REPLICA IDENTITY FULL;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE appointments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ========================================================================
-- [Part 4] 보안 정책 (Row Level Security)
-- 각 테이블별 접근 권한을 제어합니다.
-- ========================================================================

-- RLS 활성화
ALTER TABLE systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_ads ENABLE ROW LEVEL SECURITY;

-- ── 헬퍼 함수: 역할/소속 확인 ──

-- 해당 시스템의 소유자(Owner)인지 확인
CREATE OR REPLACE FUNCTION is_system_owner(sys_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM systems WHERE id = sys_id AND owner_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 해당 시스템의 승인된 멤버인지 확인
CREATE OR REPLACE FUNCTION is_system_member(sys_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM system_members
    WHERE system_id = sys_id
      AND user_id = auth.uid()
      AND status = 'approved'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 특정 역할 배열 중 하나에 해당하는지 확인
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

-- ── 정책: systems (센터 정보) ──
DROP POLICY IF EXISTS "Systems are viewable by everyone" ON systems;
CREATE POLICY "Systems are viewable by everyone" ON systems FOR SELECT USING (true);
DROP POLICY IF EXISTS "Owners can update systems" ON systems;
CREATE POLICY "Owners can update systems" ON systems FOR UPDATE USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Owners can delete systems" ON systems;
CREATE POLICY "Owners can delete systems" ON systems FOR DELETE USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Authenticated users can create systems" ON systems;
CREATE POLICY "Authenticated users can create systems" ON systems FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── 정책: profiles (프로필) ──
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

-- ── 정책: global_ads (전역 광고) ──
DROP POLICY IF EXISTS "Anyone can view global_ads" ON global_ads;
CREATE POLICY "Anyone can view global_ads" ON global_ads FOR SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated users can manage global_ads" ON global_ads;
CREATE POLICY "Authenticated users can manage global_ads" ON global_ads FOR ALL USING (auth.role() = 'authenticated');

-- ── 정책: Storage (광고 이미지) ──
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'global-ads');
DROP POLICY IF EXISTS "Manager Manage Assets" ON storage.objects;
CREATE POLICY "Manager Manage Assets" ON storage.objects FOR ALL
USING (bucket_id = 'global-ads' AND auth.role() = 'authenticated');

-- ── 정책: system_members (멤버 관리) ──
DROP POLICY IF EXISTS "Owner manage system requests" ON system_members;
DROP POLICY IF EXISTS "Guest manage own access" ON system_members;
DROP POLICY IF EXISTS "Members view system guests" ON system_members;
DROP POLICY IF EXISTS "Owner manage system members" ON system_members;
DROP POLICY IF EXISTS "Member manage own access" ON system_members;
DROP POLICY IF EXISTS "Members view system members" ON system_members;
DROP POLICY IF EXISTS "Users can insert own system member" ON system_members;
DROP POLICY IF EXISTS "Owner full access to system members" ON system_members;
DROP POLICY IF EXISTS "Members can view own record" ON system_members;
DROP POLICY IF EXISTS "Users can insert own membership request" ON system_members;
DROP POLICY IF EXISTS "Members can update own record" ON system_members;

-- Owner: 소속 멤버 전체 관리
CREATE POLICY "Owner full access to system members"
  ON system_members FOR ALL USING (is_system_owner(system_id));
-- 일반 멤버: 자신의 레코드만 조회
CREATE POLICY "Members can view own record"
  ON system_members FOR SELECT USING (auth.uid() = user_id);
-- 일반 사용자: 자신의 가입 요청만 생성
CREATE POLICY "Users can insert own membership request"
  ON system_members FOR INSERT WITH CHECK (auth.uid() = user_id);
-- 일반 멤버: 자신의 레코드만 수정
CREATE POLICY "Members can update own record"
  ON system_members FOR UPDATE USING (auth.uid() = user_id);

-- ── 정책: clients & appointments (고객/예약) ──
DROP POLICY IF EXISTS "System access for clients" ON clients;
CREATE POLICY "System access for clients" ON clients FOR ALL USING (
    is_system_owner(system_id) OR is_system_member(system_id)
);
DROP POLICY IF EXISTS "System isolated access for appointments" ON appointments;
DROP POLICY IF EXISTS "System access for appointments" ON appointments;
CREATE POLICY "System access for appointments" ON appointments FOR ALL USING (
    is_system_owner(system_id) OR is_system_member(system_id)
);

-- ── 정책: pricing_settings (단가 설정) ──
-- Owner: 전체 권한 / 선생님: 조회만
DROP POLICY IF EXISTS "pricing_owner_all" ON pricing_settings;
CREATE POLICY "pricing_owner_all" ON pricing_settings FOR ALL
  USING (has_role(system_id, ARRAY['owner']));
DROP POLICY IF EXISTS "pricing_instructor_read" ON pricing_settings;
CREATE POLICY "pricing_instructor_read" ON pricing_settings FOR SELECT
  USING (has_role(system_id, ARRAY['instructor']));

-- ── 정책: message_templates (문자 템플릿) ──
DROP POLICY IF EXISTS "template_owner_all" ON message_templates;
CREATE POLICY "template_owner_all" ON message_templates FOR ALL
  USING (is_system_member(system_id));
DROP POLICY IF EXISTS "template_member_read" ON message_templates;
CREATE POLICY "template_member_read" ON message_templates FOR SELECT
  USING (is_system_member(system_id));

-- ── 정책: client_tickets (이용권) ──
-- 이전 이름 정책 정리 + 새 정책 생성
DROP POLICY IF EXISTS "memberships_view" ON client_tickets;
DROP POLICY IF EXISTS "tickets_view" ON client_tickets;
CREATE POLICY "tickets_view" ON client_tickets FOR SELECT
  USING (is_system_member(system_id));

DROP POLICY IF EXISTS "memberships_insert" ON client_tickets;
DROP POLICY IF EXISTS "tickets_insert" ON client_tickets;
CREATE POLICY "tickets_insert" ON client_tickets FOR INSERT
  WITH CHECK (has_role(system_id, ARRAY['owner', 'staff', 'instructor']));

DROP POLICY IF EXISTS "memberships_update" ON client_tickets;
DROP POLICY IF EXISTS "tickets_update" ON client_tickets;
CREATE POLICY "tickets_update" ON client_tickets FOR UPDATE
  USING (has_role(system_id, ARRAY['owner', 'staff', 'instructor']));

DROP POLICY IF EXISTS "memberships_delete" ON client_tickets;
DROP POLICY IF EXISTS "tickets_delete" ON client_tickets;
CREATE POLICY "tickets_delete" ON client_tickets FOR DELETE
  USING (has_role(system_id, ARRAY['owner', 'staff', 'instructor']));

-- ── 정책: ticket_packages (이용권 상품) ──
-- 멤버: 조회 / Owner: 전체 관리
DROP POLICY IF EXISTS "packages_view" ON ticket_packages;
CREATE POLICY "packages_view" ON ticket_packages FOR SELECT
  USING (is_system_member(system_id));

DROP POLICY IF EXISTS "packages_owner_all" ON ticket_packages;
CREATE POLICY "packages_owner_all" ON ticket_packages FOR ALL
  USING (has_role(system_id, ARRAY['owner']));


-- ========================================================================
-- [Part 5] 핵심 함수 및 트리거
-- ========================================================================

-- ──────────────────────────────────────────────
-- 5.1 Owner 역할 자동 강제
-- 시스템 소유자가 멤버로 등록되면 무조건 'owner' 역할 부여
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_owner_role()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM systems WHERE id = NEW.system_id AND owner_id = NEW.user_id) THEN
        NEW.role = 'owner';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_enforce_owner_role ON system_members;
CREATE TRIGGER tr_enforce_owner_role
BEFORE INSERT OR UPDATE ON system_members
FOR EACH ROW EXECUTE FUNCTION enforce_owner_role();

-- ──────────────────────────────────────────────
-- 5.2 신규 사용자 → 자동 프로필 생성
-- auth.users에 회원가입 시 profiles 테이블에 자동 INSERT
-- ──────────────────────────────────────────────
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
  SET email = EXCLUDED.email;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ──────────────────────────────────────────────
-- 5.3 예약 수정 시 version 자동 증가
-- 낙관적 동시성 제어 (Optimistic Locking)
-- ──────────────────────────────────────────────
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
FOR EACH ROW EXECUTE FUNCTION update_version_column();

-- ──────────────────────────────────────────────
-- 5.4 고객 번호 자동 부여
-- 새 고객 등록 시 system별 순차 번호 자동 부여
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION assign_client_no()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.client_no IS NULL AND NEW.system_id IS NOT NULL THEN
        UPDATE systems
        SET last_client_no = last_client_no + 1
        WHERE id = NEW.system_id
        RETURNING last_client_no INTO NEW.client_no;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS tr_assign_client_no ON clients;
CREATE TRIGGER tr_assign_client_no
BEFORE INSERT ON clients
FOR EACH ROW EXECUTE FUNCTION assign_client_no();

-- ──────────────────────────────────────────────
-- 5.4.1 고객 전부 삭제 시 카운터 초기화
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reset_client_counter_if_empty()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM clients WHERE system_id = OLD.system_id) THEN
        UPDATE systems SET last_client_no = 0 WHERE id = OLD.system_id;
    END IF;
    RETURN OLD;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS tr_reset_client_counter ON clients;
CREATE TRIGGER tr_reset_client_counter
AFTER DELETE ON clients
FOR EACH ROW EXECUTE FUNCTION reset_client_counter_if_empty();

-- ──────────────────────────────────────────────
-- 5.5 updated_at 자동 갱신
-- pricing_settings, message_templates 수정 시 자동 타임스탬프 갱신
-- ──────────────────────────────────────────────
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

-- ──────────────────────────────────────────────
-- 5.6 예약 방문 횟수 자동 계산
-- 예약 추가/수정/삭제 시 해당 고객의 N회차를 자동 재계산
-- 취소/노쇼 예약은 회차에서 제외
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_visit_counts(p_client_id UUID) RETURNS VOID AS $$
BEGIN
    WITH valid_seq AS (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY client_id
                   ORDER BY start_time, created_at
               ) as new_seq
        FROM appointments
        WHERE client_id = p_client_id
          AND event_type = 'APPOINTMENT'
          AND status NOT IN ('CANCELLED', 'NOSHOW')
    ),
    invalid_seq AS (
        SELECT id, NULL::int as new_seq
        FROM appointments
        WHERE client_id = p_client_id
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
        PERFORM sync_visit_counts(OLD.client_id);
        RETURN OLD;
    ELSIF (TG_OP = 'INSERT') THEN
        PERFORM sync_visit_counts(NEW.client_id);
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.client_id IS DISTINCT FROM NEW.client_id) THEN
            PERFORM sync_visit_counts(OLD.client_id);
            PERFORM sync_visit_counts(NEW.client_id);
        ELSIF (OLD.status IS DISTINCT FROM NEW.status) OR (OLD.start_time IS DISTINCT FROM NEW.start_time) THEN
             PERFORM sync_visit_counts(NEW.client_id);
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_sync_visit_counts ON appointments;
CREATE TRIGGER tr_sync_visit_counts
AFTER INSERT OR DELETE OR UPDATE OF status, start_time, client_id ON appointments
FOR EACH ROW EXECUTE FUNCTION trigger_sync_visit_counts();

-- ──────────────────────────────────────────────
-- 5.7 고객 통계 자동 동기화 (총 방문/최근 방문/최초 방문)
-- KST(한국 시간) 기준으로 날짜 변환
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_client_stats() RETURNS TRIGGER AS $$
DECLARE
    target_client_id UUID;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        target_client_id := OLD.client_id;
    ELSE
        target_client_id := NEW.client_id;
    END IF;

    IF target_client_id IS NOT NULL THEN
        UPDATE clients
        SET
            visit_count = (
                SELECT COUNT(*)
                FROM appointments
                WHERE client_id = target_client_id
                AND event_type = 'APPOINTMENT'
                AND status NOT IN ('CANCELLED', 'NOSHOW')
            ),
            last_visit = (
                SELECT MAX(start_time AT TIME ZONE 'Asia/Seoul')::DATE
                FROM appointments
                WHERE client_id = target_client_id
                AND event_type = 'APPOINTMENT'
                AND status NOT IN ('CANCELLED', 'NOSHOW')
                AND start_time <= NOW()
            ),
            first_visit_date = (
                SELECT MIN(start_time AT TIME ZONE 'Asia/Seoul')::DATE
                FROM appointments
                WHERE client_id = target_client_id
                AND event_type = 'APPOINTMENT'
                AND status NOT IN ('CANCELLED', 'NOSHOW')
            )
        WHERE id = target_client_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_update_client_stats ON appointments;
CREATE TRIGGER tr_update_client_stats
AFTER INSERT OR UPDATE OR DELETE ON appointments
FOR EACH ROW EXECUTE FUNCTION update_client_stats();

-- ──────────────────────────────────────────────
-- 5.8 이용권 사용량 자동 추적
-- 예약 상태가 COMPLETED로 변경되면 이용권 사용 횟수 +1
-- COMPLETED에서 다른 상태로 변경되면 -1
-- 전체 횟수 소진 시 상태를 EXHAUSTED로 자동 변경
-- ──────────────────────────────────────────────
DROP TRIGGER IF EXISTS trigger_update_membership_usage ON appointments;
DROP TRIGGER IF EXISTS trigger_update_ticket_usage ON appointments;
DROP FUNCTION IF EXISTS update_membership_usage();

CREATE OR REPLACE FUNCTION update_ticket_usage() RETURNS TRIGGER AS $$
BEGIN
    -- 예약 수정/삭제: 이전에 COMPLETED였으면 사용량 -1 (복원)
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF OLD.status = 'COMPLETED' AND OLD.ticket_id IS NOT NULL THEN
            UPDATE client_tickets
            SET used_sessions = GREATEST(used_sessions - 1, 0),
                status = CASE WHEN GREATEST(used_sessions - 1, 0) < total_sessions THEN 'ACTIVE' ELSE status END,
                updated_at = now()
            WHERE id = OLD.ticket_id;
        END IF;
    END IF;

    -- 예약 생성/수정: COMPLETED 상태이면 사용량 +1
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF NEW.status = 'COMPLETED' AND NEW.ticket_id IS NOT NULL THEN
            UPDATE client_tickets
            SET used_sessions = used_sessions + 1,
                status = CASE WHEN used_sessions + 1 >= total_sessions THEN 'EXHAUSTED' ELSE status END,
                updated_at = now()
            WHERE id = NEW.ticket_id;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_ticket_usage
AFTER INSERT OR UPDATE OR DELETE ON appointments
FOR EACH ROW EXECUTE FUNCTION update_ticket_usage();


-- ========================================================================
-- [Part 6] 기존 데이터 마이그레이션
-- 이전 스키마에서 데이터를 새 구조로 자동 이전
-- ========================================================================

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
               COALESCE(message_template, '[예약 안내] {고객}님
일시: {일시}
장소: {장소}
담당: {담당자} 선생님'),
               TRUE
        FROM systems
        WHERE NOT EXISTS (SELECT 1 FROM message_templates WHERE message_templates.system_id = systems.id)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- 전체 방문 데이터 KST 기준으로 일괄 보정
UPDATE clients p
SET
  last_visit = (
      SELECT MAX(start_time AT TIME ZONE 'Asia/Seoul')::DATE
      FROM appointments a
      WHERE a.client_id = p.id
      AND event_type = 'APPOINTMENT'
      AND status NOT IN ('CANCELLED', 'NOSHOW')
      AND start_time <= NOW()
  ),
  first_visit_date = (
      SELECT MIN(start_time AT TIME ZONE 'Asia/Seoul')::DATE
      FROM appointments a
      WHERE a.client_id = p.id
      AND event_type = 'APPOINTMENT'
      AND status NOT IN ('CANCELLED', 'NOSHOW')
  );

COMMIT;
