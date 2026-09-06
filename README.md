# Seoringung

## 네이버 캘린더 자동 등록 배포 설정

이 프로젝트는 Vercel에 배포하면 예약이 관리자 네이버 캘린더 기본 캘린더에 자동 추가됩니다. 또한 제목에 `상담 일정`이 포함된 네이버 캘린더 일정과 겹치는 시간은 예약 화면에서 자동으로 선택할 수 없게 됩니다.

1. Vercel에서 이 GitHub 저장소를 Import합니다.
2. 네이버 개발자센터에서 애플리케이션을 만들고, 네이버 로그인과 캘린더 API를 활성화합니다.
3. 네이버 개발자센터의 서비스 URL과 Callback URL에 배포 주소와 `https://배포주소/api/naver-callback`을 등록합니다.
4. Vercel 환경 변수에 `.env.example`의 값을 입력합니다. `NAVER_OAUTH_STATE`에는 임의의 긴 비밀 문자열을 사용합니다.
5. 배포 뒤 `https://배포주소/api/admin-authorize`로 접속해 관리자 네이버 계정으로 한 번 승인합니다.
6. 표시되는 갱신 토큰을 Vercel의 `NAVER_ADMIN_REFRESH_TOKEN` 환경 변수에 저장한 뒤 재배포합니다.

## 예약 불가 시간 동기화 설정

Vercel 환경 변수에 아래 두 값도 추가하세요. 값은 브라우저에 내려가지 않고 Vercel 서버에서만 네이버 캘린더를 조회하는 데 사용됩니다.

- `NAVER_CALDAV_USERNAME`: 관리자 네이버 아이디
- `NAVER_CALDAV_PASSWORD`: 관리자 네이버 비밀번호. 2단계 인증을 사용한다면 네이버의 앱 비밀번호를 사용합니다.

네이버 캘린더에서 예약을 막고 싶은 일정의 제목에는 반드시 `상담 일정`을 넣으세요. 예: `상담 일정 · 김민지`, `상담 일정 (전화)`. 새로 들어오는 홈페이지 예약은 자동으로 이 제목 형식으로 등록됩니다. 기존 홈페이지 예약 중 제목에 이 문구가 없는 것은 한 번 제목을 바꿔 주세요.

`NAVER_CLIENT_SECRET`, `NAVER_OAUTH_STATE`, `NAVER_ADMIN_REFRESH_TOKEN`, `NAVER_CALDAV_PASSWORD`는 GitHub에 올리면 안 됩니다.
