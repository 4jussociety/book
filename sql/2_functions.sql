-- 2_functions.sql
-- 비즈니스 로직, 트리거, RPC (Owner/Guest 분리 로직 반영)

BEGIN;

--------------------------------------------------------------------------------
-- 1. Auth Triggers (Profile Creation)
--------------------------------------------------------------------------------
-- 신규 가입 시 role을 자동으로 할당하지 않음 (게스트는 guest_access에서 관리)
CREATE OR REPLACE FUNCTION handle_new_user() 
RETURNS TRIGGER AS $$
DECLARE
  default_role text;
BEGIN
  IF new.email LIKE '%@thept.co.kr' THEN
    default_role := 'therapist'; -- 관리자(Owner)용 기본값 (필요 시 유지)
  ELSE
    default_role := NULL; -- 일반 사용자는 Role 없음 (Guest 승인 시 Guest Access role 사용)
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
      new.id, 
      new.email, 
      COALESCE(new.raw_user_meta_data->>'full_name', 'User'),
      default_role
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    role = EXCLUDED.role,
    email = EXCLUDED.email;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

--------------------------------------------------------------------------------
-- 2. Appointment Logic
--------------------------------------------------------------------------------
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

--------------------------------------------------------------------------------
-- 3. Patient Logic
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assign_patient_no()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.patient_no IS NULL THEN
        UPDATE patient_counters 
        SET last_patient_no = last_patient_no + 1 
        WHERE key = 'default'
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

--------------------------------------------------------------------------------
-- 4. Guest Login RPC
--------------------------------------------------------------------------------
-- 게스트 로그인 시 profiles.role을 건드리지 않고, guest_access 정보만 갱신
CREATE OR REPLACE FUNCTION login_guest(
    p_serial_number TEXT,
    p_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_system_id UUID;
    v_old_user_id UUID;
    v_status access_status;
BEGIN
    -- 1. 시스템 조회
    SELECT id INTO v_system_id FROM systems WHERE serial_number = p_serial_number;
    IF v_system_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '존재하지 않는 일련번호입니다.');
    END IF;

    -- 2. 승인된 게스트 기록 조회 (guest_access)
    SELECT ga.user_id, ga.status
    INTO v_old_user_id, v_status
    FROM guest_access ga
    JOIN profiles p ON ga.user_id = p.id
    WHERE ga.system_id = v_system_id
      AND p.full_name = p_name
      AND ga.status = 'approved'
    ORDER BY ga.created_at DESC
    LIMIT 1;

    IF v_old_user_id IS NULL THEN
         RETURN jsonb_build_object('success', false, 'message', '승인된 사용자 기록이 없습니다.');
    END IF;

    -- 3. 소유권 이전 (Guest Access)
    UPDATE guest_access SET user_id = auth.uid() WHERE user_id = v_old_user_id AND system_id = v_system_id;

    -- 4. 프로필 연결 (System ID만 연결, Role은 Guest Access 사용)
    UPDATE profiles 
    SET full_name = p_name, 
        system_id = v_system_id
    WHERE id = auth.uid();
    
    -- 5. 이전 계정 연결 해제
    UPDATE profiles SET system_id = NULL WHERE id = v_old_user_id AND id != auth.uid();

    RETURN jsonb_build_object('success', true);
END;
$$;

COMMIT;
