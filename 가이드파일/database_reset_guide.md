# Supabase 데이터베이스 초기화 가이드

데이터베이스를 완전히 비우고 처음부터 다시 시작하고 싶을 때 사용하는 방법입니다.
**주의: 모든 데이터가 영구적으로 삭제됩니다!**

## 방법 1: Supabase 대시보드 이용 (가장 추천)
가장 깔끔하고 확실한 방법입니다.

1.  Supabase 프로젝트 대시보드 접속
2.  왼쪽 메뉴 하단 **Settings (톱니바퀴)** 클릭
3.  **Database** 메뉴 클릭
4.  아래로 스크롤하여 **Reset database** 섹션 찾기
5.  **"Reset database"** 버튼 클릭 후 경고 문구 확인 (프로젝트 이름 입력 필요)

## 방법 2: SQL 명령어로 삭제 (고급 사용자용)
특정 스키마(`public`)의 모든 내용을 삭제합니다.

```sql
-- public 스키마의 모든 테이블, 함수, 뷰 등을 삭제하고 다시 생성
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

## 초기화 후 재설정 순서
초기화 후에는 작성해둔 SQL 파일들을 **순서대로** 다시 실행해야 합니다.

1.  `1_schema.sql` (테이블 생성)
2.  `2_functions.sql` (함수 생성)
3.  `3_rls.sql` (보안 정책)
4.  `5_enable_realtime.sql` (Realtime 설정)
5.  기타 마이그레이션 파일들...

---
*운영 중인 서비스라면 절대 함부로 리셋하지 마세요!*
