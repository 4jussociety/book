# GitHub 업로드 가이드 (GitHub Upload Guide)

이 프로젝트를 GitHub에 올리는 단계별 방법입니다.

## 1. 업로드해야 하는 파일 (자동 포함)
Git은 프로젝트 폴더 내의 거의 모든 파일을 추적하지만, 다음 핵심 파일들이 포함되어야 프로젝트가 다른 곳에서도 작동합니다:
- **`src/`**: 실제 프로그램 소스 코드
- **`public/`**: 이미지, 아이콘 등 정적 자산
- **`package.json`**: 설치된 라이브러리 목록
- **`vercel.json`**: 배포 설정
- **`sql/`**: 데이터베이스 스크립트
- **기타 설정 파일**: `vite.config.ts`, `tailwind.config.js` 등

## 2. 업로드에서 제외되는 파일 (보안 및 용량)
다음 파일들은 `.gitignore` 설정을 통해 **절대 올라가지 않도록** 방지했습니다:
- **`.env`**: Supabase 주소와 키 (보안상 공유 금지)
- **`node_modules/`**: 용량이 너무 커서 올리지 않으며, `npm install`로 언제든 재설치 가능
- **`dist/`**: 배포용 빌드 파일
- **`docs/`**, **`bkit-source/`**: 문서 및 도구 소스 (원치 않으실 경우 제외)

## 3. 업로드 명령어 순서

터미널에서 순서대로 실행해 주세요:

1. **Git 초기화**:
   ```powershell
   git init
   ```

2. **파일 추가 및 첫 커밋**:
   ```powershell
   git add .
   git commit -m "Initial commit: 클리닉 일정 관리 앱 초기화"
   ```

3. **GitHub 연결** (GitHub에서 저장소를 만든 후 주소를 복사하세요):
   ```powershell
   git remote add origin https://github.com/사용자아이디/저장소이름.git
   git branch -M main
   ```

4. **최종 푸시 (업로드)**:
   ```powershell
   git push -u origin main
   ```

---
> [!IMPORTANT]
> GitHub에서 저장소를 만들 때 **'Initialize this repository with a README' 체크를 해제**해야 나중에 충돌이 발생하지 않습니다.
