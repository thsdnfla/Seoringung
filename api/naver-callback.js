const crypto = require('node:crypto');

module.exports = async function handler(request, response) {
  const { NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, NAVER_REDIRECT_URI, NAVER_OAUTH_STATE } = process.env;
  const expected = crypto.createHmac('sha256', NAVER_OAUTH_STATE || '').update('seoringung-admin').digest('hex');
  if (!NAVER_OAUTH_STATE || request.query.state !== expected || !request.query.code) return response.status(400).send('네이버 관리자 인증을 확인할 수 없습니다.');
  const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: NAVER_CLIENT_ID, client_secret: NAVER_CLIENT_SECRET, code: request.query.code, state: request.query.state });
  const tokenResponse = await fetch('https://nid.naver.com/oauth2.0/token', { method: 'POST', body });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.refresh_token) return response.status(502).send('네이버 인증 토큰 발급에 실패했습니다.');
  return response.status(200).send(`<main style="font-family:sans-serif;max-width:680px;margin:48px auto;line-height:1.7"><h1>관리자 인증이 완료되었습니다</h1><p>아래 값을 Vercel 환경 변수 <code>NAVER_ADMIN_REFRESH_TOKEN</code>에 저장한 뒤 이 페이지를 닫아 주세요. 이 값은 절대 GitHub에 올리지 마세요.</p><textarea readonly style="width:100%;height:120px">${token.refresh_token}</textarea></main>`);
};
