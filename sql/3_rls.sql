-- 3_rls.sql
-- 보안 정책 (Row Level Security) - Owner와 Guest 권한 분리

BEGIN;

-- RLS 활성화
ALTER TABLE systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- Helper Functions for RLS
--------------------------------------------------------------------------------
-- 현재 사용자가 시스템 소유자인지 확인
CREATE OR REPLACE FUNCTION is_system_owner(sys_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM systems WHERE id = sys_id AND owner_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 현재 사용자가 승인된 게스트 멤버인지 확인
CREATE OR REPLACE FUNCTION is_system_member(sys_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM guest_access 
    WHERE system_id = sys_id 
      AND user_id = auth.uid() 
      AND status = 'approved'
  );
$$ LANGUAGE sql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- 1. SYSTEMS
--------------------------------------------------------------------------------
-- 누구나 시스템 정보(이름 등)는 조회 가능 (로그인/초대 시 필요)
DROP POLICY IF EXISTS "Systems are viewable by everyone" ON systems;
CREATE POLICY "Systems are viewable by everyone" ON systems FOR SELECT USING (true);

-- 시스템 소유자(Owner)만 수정/삭제 가능
DROP POLICY IF EXISTS "Owners can update systems" ON systems;
CREATE POLICY "Owners can update systems" ON systems FOR UPDATE USING (auth.uid() = owner_id);

--------------------------------------------------------------------------------
-- 2. PROFILES
--------------------------------------------------------------------------------
-- 누구나 조회 가능 (동료 검색 등)
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);

-- 자기 자신은 수정 가능
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- 시스템 소유자는 멤버들의 프로필(일부: system_id 등) 수정 가능
DROP POLICY IF EXISTS "Owners can update member profiles" ON profiles;
CREATE POLICY "Owners can update member profiles" ON profiles FOR UPDATE USING (
    system_id IN (SELECT id FROM systems WHERE owner_id = auth.uid())
);

--------------------------------------------------------------------------------
-- 3. GUEST ACCESS (멤버 관리 페이지 권한 제어의 입)
--------------------------------------------------------------------------------
-- Owner: 자신의 시스템에 대한 모든 요청 관리 (조회, 수정, 삭제)
DROP POLICY IF EXISTS "Owner manage system requests" ON guest_access;
CREATE POLICY "Owner manage system requests" ON guest_access FOR ALL USING (
    is_system_owner(system_id)
);

-- Guest: 자기 자신의 요청만 조회/생성/삭제 가능
-- (다른 사람의 요청을 보거나 수정할 수 없음 -> 멤버 관리 페이지 접근 불가 효과)
DROP POLICY IF EXISTS "Guest manage own access" ON guest_access;
CREATE POLICY "Guest manage own access" ON guest_access FOR ALL USING (
    auth.uid() = user_id
);

-- System Member(Therapist/Staff)는 같은 시스템의 다른 Guest Access(특히 Therapist 목록)를 조회할 수 있어야 함
DROP POLICY IF EXISTS "Members view system guests" ON guest_access;
CREATE POLICY "Members view system guests" ON guest_access FOR SELECT USING (
    is_system_owner(system_id) OR is_system_member(system_id)
);

--------------------------------------------------------------------------------
-- 4. PATIENTS & APPOINTMENTS (예약/환자 관리)
--------------------------------------------------------------------------------
-- Owner와 승인된 Guest(Therapist/Staff) 모두 접근 가능
-- Guest는 '예약관리'와 '환자관리'에 접근 권한이 있어야 함.

-- PATIENTS
DROP POLICY IF EXISTS "System access for patients" ON patients;
CREATE POLICY "System access for patients" ON patients FOR ALL USING ( 
    is_system_owner(system_id) OR is_system_member(system_id)
);

-- APPOINTMENTS
DROP POLICY IF EXISTS "System isolated access for appointments" ON appointments;
DROP POLICY IF EXISTS "System access for appointments" ON appointments;
CREATE POLICY "System access for appointments" ON appointments FOR ALL USING ( 
    is_system_owner(system_id) OR is_system_member(system_id)
);

COMMIT;
