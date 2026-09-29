# MOA Supabase Backend

기존 Express/SQLite API를 Supabase Postgres와 단일 `api` Edge Function으로 이전한 백엔드입니다. 프런트에서 사용하던 `/auth`, `/posts`, `/admin` API의 요청·응답 형식을 유지합니다.

## 구조

- `supabase/migrations`: 관리자, 사용자 계정, 프로필, 콘텐츠 테이블과 인덱스, RLS, 집계 뷰, 원자적 조회수/반응 RPC
- `supabase/functions/api`: 인증, 게시글, 댓글, 관리자 Edge API
- `supabase/functions/_shared`: 환경변수, Supabase 클라이언트, JWT, CORS, HTTP 공통 코드
- `scripts/sync-admin.mjs`: 관리자 계정을 Supabase Auth와 `admins` 테이블에 생성 또는 갱신
- `scripts/migrate-sqlite.mjs`: 기존 SQLite 데이터를 Supabase로 일회성 이전

모든 테이블은 RLS가 활성화되어 있으며 `anon`과 `authenticated`의 직접 접근 권한은 제거했습니다. 공개 API도 Edge Function에서 검증한 뒤 비공개 키로만 데이터에 접근합니다.

## 1. 환경변수

`.env.example`을 `.env`로 복사하고 값을 입력합니다. 실제 `.env`는 Git에 포함되지 않습니다.

- `SUPABASE_PROJECT_REF`: 프로젝트 ref
- `SUPABASE_DB_PASSWORD`: 원격 마이그레이션에 사용할 DB 비밀번호(선택, 미입력 시 CLI가 요청)
- `SUPABASE_URL`: 프로젝트 URL
- `SUPABASE_PUBLISHABLE_KEY`: 공개 키(`sb_publishable_...`)
- `SUPABASE_SECRET_KEY`: 서버 전용 비공개 키(`sb_secret_...`)
- `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: 레거시 키를 사용하는 프로젝트의 대체 변수
- `SUPABASE_ACCESS_TOKEN`: Supabase CLI 로그인 토큰
- `USER_JWT_SECRET`, `ADMIN_JWT_SECRET`: 서로 다른 32자 이상의 앱 토큰 서명키
- `CORS_ORIGINS`: 쉼표로 구분한 Vercel 및 로컬 프런트 주소

`SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`은 절대로 `VITE_` 접두사를 붙이거나 프런트 환경변수에 넣지 마세요.

## 2. 설치 및 프로젝트 연결

PowerShell 기준:

```powershell
npm install
npm run supabase:login
npm run supabase:link
```

환경변수 입력 상태는 다음 명령으로 값 자체를 노출하지 않고 검사할 수 있습니다.

```powershell
npm run check:env
```

## 3. DB와 Edge Function 배포

```powershell
npm run db:push
npm run secrets:push
npm run functions:deploy
npm run admin:sync
npm run db:check
```

`SUPABASE_URL`과 Supabase 프로젝트 키는 배포된 Edge Function에 기본 제공됩니다. CLI용 `SUPABASE_ACCESS_TOKEN`은 Edge Function secret으로 업로드하지 않습니다.
전체 Supabase 배포 과정을 한 번에 실행하려면 `npm run deploy`를 사용할 수 있습니다. 이 명령은 Vercel을 배포하지 않습니다.

## 4. 기존 SQLite 데이터 이전(선택)

DB 스키마 배포 후 한 번만 실행합니다.

```powershell
npm run db:migrate:sqlite
```

관리자, 사용자, 게시글, 댓글, 반응과 로그인 사용자 조회 기록을 이전합니다. 과거 익명 UUID 조회 기록은 새 정책과 맞지 않아 제외됩니다. 기존 bcrypt 비밀번호 해시는 그대로 호환됩니다.

## 5. 로컬 실행

Docker Desktop이 실행 중이어야 합니다.

```powershell
Copy-Item supabase/functions/.env.example supabase/functions/.env
npm run supabase:start
npm run db:reset
npm run functions:serve
```

로컬 API URL은 `http://localhost:54321/functions/v1/api`입니다. 프런트 Vite 프록시는 `/api`를 이 주소로 전달합니다.

## 6. GitHub 기반 Vercel 프런트 배포

Vercel 프로젝트는 GitHub 저장소와 직접 연결합니다.

```text
Repository: yongwooo7611-cloud/0915_project
Production Branch: main
Root Directory: frontend
Framework Preset: Vite
```

`main` 브랜치에 커밋을 푸시하면 Vercel Git 연동이 운영 배포를 자동 생성합니다. 프런트 배포에 Vercel CLI나 `VERCEL_TOKEN`을 사용하지 않습니다. Pull Request 브랜치는 Vercel 미리보기 배포로 처리합니다.

Vercel 프로젝트에 다음 환경변수를 추가하고 프런트를 다시 배포합니다.

```text
VITE_API_BASE_URL=https://<project-ref>.supabase.co/functions/v1/api
```

동시에 백엔드의 `CORS_ORIGINS`에 실제 Vercel 도메인을 등록하고 Edge Function secret을 다시 설정해야 합니다.

## API 호환 범위

- 사용자 회원가입, 로그인, 프로필/활동 조회
- 게시글 목록·검색·페이지네이션·작성·수정·삭제
- 로그인 사용자별 1회 조회수 집계
- 좋아요·싫어요 등록, 변경, 취소
- 댓글 작성 및 작성자 전용 수정·삭제
- 관리자 로그인·계정 변경·대시보드
- 관리자 게시글/댓글 숨김, 공개, 삭제
