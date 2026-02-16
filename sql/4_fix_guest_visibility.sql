-- 4_fix_guest_visibility.sql
-- 게스트(치료사)가 캘린더에서 다른 치료사를 볼 수 있도록 조회 권한 확장

BEGIN;

-- System Member(Therapist/Staff)는 같은 시스템의 다른 Guest Access(특히 Therapist 목록)를 조회할 수 있어야 함
DROP POLICY IF EXISTS "Members view system guests" ON guest_access;
CREATE POLICY "Members view system guests" ON guest_access FOR SELECT USING (
    is_system_owner(system_id) OR is_system_member(system_id)
);

COMMIT;
