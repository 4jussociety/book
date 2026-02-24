-- ============================================================
-- [Database Reset Script] v3.0
-- 경고: 이 스크립트는 모든 테이블을 드롭하며 데이터를 삭제합니다!
-- 실행 이후 00_full_setup.sql 파일을 다시 실행하여 스키마를 재생성하세요.
-- ============================================================

BEGIN;

-- 1. 의존성이 있는 테이블들을 역순으로 삭제
DROP TABLE IF EXISTS client_memberships CASCADE;
DROP TABLE IF EXISTS membership_packages CASCADE;
DROP TABLE IF EXISTS pricing_settings CASCADE;
DROP TABLE IF EXISTS message_templates CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
DROP TABLE IF EXISTS system_members CASCADE;
DROP TABLE IF EXISTS systems CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- 2. 생성된 타입(Enums) 삭제
DROP TYPE IF EXISTS access_status CASCADE;
DROP TYPE IF EXISTS event_type CASCADE;
DROP TYPE IF EXISTS appointment_status CASCADE;
DROP TYPE IF EXISTS gender CASCADE;

-- 3. 커스텀 함수들 삭제
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS update_version_column() CASCADE;
DROP FUNCTION IF EXISTS assign_client_no() CASCADE;
DROP FUNCTION IF EXISTS reset_client_counter_if_empty() CASCADE;
DROP FUNCTION IF EXISTS trigger_sync_visit_counts() CASCADE;
DROP FUNCTION IF EXISTS sync_visit_counts(UUID) CASCADE;
DROP FUNCTION IF EXISTS update_client_stats() CASCADE;
DROP FUNCTION IF EXISTS is_system_owner(UUID) CASCADE;
DROP FUNCTION IF EXISTS is_system_member(UUID) CASCADE;
DROP FUNCTION IF EXISTS has_role(UUID, TEXT[]) CASCADE;
DROP FUNCTION IF EXISTS get_my_role(UUID) CASCADE;
DROP FUNCTION IF EXISTS update_modified_column() CASCADE;
DROP FUNCTION IF EXISTS enforce_owner_role() CASCADE;
DROP FUNCTION IF EXISTS update_membership_usage() CASCADE;

-- 참고: auth.users (Supabase 자체 계정 테이블)는 스크립트로 마음대로 삭제할 수 없습니다.
-- 유저 계정까지 날리려면 Supabase 대시보드 -> Authentication -> Users 에서 수동으로 삭제해야 합니다.

COMMIT;
