-- system_members 테이블 RLS 정책 강화
-- 기존: 모든 승인된 멤버가 멤버 목록을 조회/수정 가능
-- 변경: 멤버 목록 조회는 owner만, 자신의 정보 조회는 본인만 가능

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Owner manage system members" ON system_members;
DROP POLICY IF EXISTS "Member manage own access" ON system_members;
DROP POLICY IF EXISTS "Members view system members" ON system_members;
DROP POLICY IF EXISTS "Users can insert own system member" ON system_members;

-- 새 정책: Owner는 모든 멤버에 대해 전체 권한 (조회/추가/수정/삭제)
CREATE POLICY "Owner full access to system members"
  ON system_members FOR ALL
  USING (is_system_owner(system_id));

-- 새 정책: 일반 멤버는 자신의 레코드만 조회 가능
CREATE POLICY "Members can view own record"
  ON system_members FOR SELECT
  USING (auth.uid() = user_id);

-- 새 정책: 일반 사용자는 자신의 멤버 가입 요청만 삽입 가능
CREATE POLICY "Users can insert own membership request"
  ON system_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 새 정책: 일반 멤버는 자신의 레코드만 업데이트 가능 (예: 비밀번호 변경 등)
CREATE POLICY "Members can update own record"
  ON system_members FOR UPDATE
  USING (auth.uid() = user_id);
