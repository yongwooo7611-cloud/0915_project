# 0915_project

## 배포

- 프런트엔드는 Vercel Git 연동을 통해 GitHub `main` 브랜치 푸시 시 자동 배포됩니다.
- Vercel 프로젝트의 루트 디렉터리는 `frontend`, 프레임워크는 Vite입니다.
- Vercel CLI 및 API 토큰을 사용하는 수동 프런트 배포는 사용하지 않습니다.
- 백엔드 데이터베이스와 Edge Function은 `backend`의 Supabase 배포 스크립트로 관리합니다.
