# Seoringung

## 네이버 캘린더 자동 등록 배포 설정

이 프로젝트는 Vercel에 배포하면 예약이 관리자 네이버 캘린더 기본 캘린더에 자동 추가됩니다.

1. Vercel에서 이 GitHub 저장소를 Import합니다.
2. 네이버 개발자센터에서 애플리케이션을 만들고, 네이버 로그인과 캘린더 API를 활성화합니다.
3. 네이버 개발자센터의 서비스 URL과 Callback URL에 배포 주소와 `https://배포주소/api/naver-callback`을 등록합니다.
4. Vercel 환경 변수에 `.env.example`의 값을 입력합니다. `NAVER_OAUTH_STATE`에는 임의의 긴 비밀 문자열을 사용합니다.
5. 배포 뒤 `https://배포주소/api/admin-authorize`로 접속해 관리자 네이버 계정으로 한 번 승인합니다.
6. 표시되는 갱신 토큰을 Vercel의 `NAVER_ADMIN_REFRESH_TOKEN` 환경 변수에 저장한 뒤 재배포합니다.

`NAVER_CLIENT_SECRET`, `NAVER_OAUTH_STATE`, `NAVER_ADMIN_REFRESH_TOKEN`은 GitHub에 올리면 안 됩니다.
