-- 수업 종류 통일 구조 마이그레이션 스크립트
-- session_type 'normal'을 제거하고, 모든 수업 종류를 option1~4로 통일합니다.
-- ⚠️ 반드시 코드 배포 전에 실행해야 합니다!

-- ============================================================
-- 1단계: 기존 데이터 마이그레이션 ('normal' → 'option1')
-- ============================================================

-- 1-1. appointments 테이블
UPDATE appointments SET session_type = 'option1' WHERE session_type = 'normal' OR session_type IS NULL;

-- 1-2. pricing_settings 테이블
-- 이미 같은 (system_id, duration_minutes)에 option1 행이 있으면 normal 행 삭제
DELETE FROM pricing_settings AS p
WHERE p.session_type = 'normal'
  AND EXISTS (
    SELECT 1 FROM pricing_settings AS p2
    WHERE p2.system_id = p.system_id
      AND p2.duration_minutes = p.duration_minutes
      AND p2.session_type = 'option1'
  );
-- 나머지 normal 행은 option1로 변환
UPDATE pricing_settings SET session_type = 'option1' WHERE session_type = 'normal';

-- 1-3. ticket_packages 테이블
UPDATE ticket_packages SET session_type = 'option1' WHERE session_type = 'normal';

-- ============================================================
-- 2단계: systems 테이블 - default_session_name → option1_name 통합
-- ============================================================

-- 2-1. option4_name 컬럼 추가 (없는 경우만) — 반드시 먼저 실행!
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'systems' AND column_name = 'option4_name') THEN
        ALTER TABLE systems ADD COLUMN option4_name TEXT;
    END IF;
END $$;

-- 2-2. 기존 default_session_name 값을 option1_name으로 이전 (option1_name이 비어있을 때만)
UPDATE systems
SET option1_name = COALESCE(NULLIF(option1_name, ''), default_session_name, '매뉴얼PT')
WHERE option1_name IS NULL OR option1_name = '';

-- 2-3. option1_name이 이미 설정되어 있고 default_session_name도 있는 경우,
-- option4에 밀어넣기 (데이터 유실 방지)
UPDATE systems
SET option4_name = option1_name
WHERE option1_name IS NOT NULL AND option1_name != ''
  AND default_session_name IS NOT NULL AND default_session_name != ''
  AND option1_name != default_session_name
  AND (option4_name IS NULL OR option4_name = '');

-- 그 후 default_session_name을 option1_name으로
UPDATE systems
SET option1_name = default_session_name
WHERE default_session_name IS NOT NULL AND default_session_name != ''
  AND option1_name != default_session_name;

-- ============================================================
-- 3단계: profiles 테이블 - incentive_percentage → incentive_percentage_opt1 통합
-- ============================================================

-- 3-1. incentive_percentage_opt4 컬럼 추가 (없는 경우만)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'incentive_percentage_opt4') THEN
        ALTER TABLE profiles ADD COLUMN incentive_percentage_opt4 REAL DEFAULT 0;
    END IF;
END $$;

-- 3-2. 기존 incentive_percentage 값을 incentive_percentage_opt1으로 이전
-- (opt1이 아직 0이거나 null인 경우만)
UPDATE profiles
SET incentive_percentage_opt1 = COALESCE(incentive_percentage, 0)
WHERE (incentive_percentage_opt1 IS NULL OR incentive_percentage_opt1 = 0)
  AND incentive_percentage IS NOT NULL AND incentive_percentage > 0;

-- ============================================================
-- 4단계: session_type 기본값 변경
-- ============================================================

-- appointments 테이블의 session_type 기본값 변경
ALTER TABLE appointments ALTER COLUMN session_type SET DEFAULT 'option1';

-- pricing_settings 테이블의 session_type 기본값 변경 (있는 경우)
DO $$
BEGIN
    ALTER TABLE pricing_settings ALTER COLUMN session_type SET DEFAULT 'option1';
EXCEPTION WHEN OTHERS THEN
    NULL; -- 컬럼에 DEFAULT가 없으면 무시
END $$;

-- ============================================================
-- 완료 메시지
-- ============================================================
-- 마이그레이션 완료! 이제 프론트엔드 코드를 배포하세요.
-- 참고: default_session_name 컬럼과 incentive_percentage 컬럼은
-- 안전을 위해 바로 삭제하지 않습니다 (롤백 대비).
-- 안정적으로 운영된 후 아래 명령으로 제거할 수 있습니다:
-- ALTER TABLE systems DROP COLUMN IF EXISTS default_session_name;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS incentive_percentage;
