# Vercel 배포 가이드

가장 쉽고 무료로 호스팅할 수 있는 **Vercel**을 추천합니다.

## 1. 사전 준비
1.  **GitHub에 코드 올리기**: 현재 작업 중인 코드가 GitHub 레포지토리에 올라가 있어야 합니다.
2.  **Supabase 정보 준비**: `.env` 파일에 있는 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_ANON_KEY` 값을 미리 복사해두세요.

## 2. Vercel 배포 진행
1.  [Vercel 홈페이지](https://vercel.com)에 접속하여 로그인합니다.
2.  **"Add New..."** -> **"Project"** 클릭
3.  GitHub 레포지토리를 선택하고 **"Import"** 클릭
4.  **Configure Project** 화면에서:
    *   **Framework Preset**: `Vite` (자동으로 잡힐 것입니다)
    *   **Environment Variables** 펼치기
    *   여기에 `.env` 내용을 입력합니다.
        *   `VITE_SUPABASE_URL`: (값 복사/붙여넣기)
        *   `VITE_SUPABASE_ANON_KEY`: (값 복사/붙여넣기)
5.  **"Deploy"** 버튼 클릭

## 3. Supabase 설정 (필수!)
배포가 완료되면 `https://your-project.vercel.app` 같은 주소가 생깁니다. 이 주소를 Supabase에 등록해야 로그인이 됩니다.

1.  Supabase 대시보드 접속 -> **Authentication** -> **URL Configuration**
2.  **Site URL**에 배포된 주소 입력
3.  **Redirect URLs**에 아래 주소들을 추가 (`Add URL`)
    *   `https://your-project.vercel.app/**` (모든 하위 경로 허용)
4.  **Save** 클릭

---
*혹시 GitHub를 안 쓰시거나, 과정이 복잡하면 화면 공유나 추가 질문 주세요!*
