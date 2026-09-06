const crypto = require('node:crypto');

module.exports = function handler(_request, response) {
  const { NAVER_CLIENT_ID, NAVER_REDIRECT_URI, NAVER_OAUTH_STATE } = process.env;
  if (![NAVER_CLIENT_ID, NAVER_REDIRECT_URI, NAVER_OAUTH_STATE].every(Boolean)) return response.status(503).send('네이버 OAuth 환경 변수를 먼저 설정해 주세요.');
  const state = crypto.createHmac('sha256', NAVER_OAUTH_STATE).update('seoringung-admin').digest('hex');
  const url = new URL('https://nid.naver.com/oauth2.0/authorize');
  url.search = new URLSearchParams({ response_type: 'code', client_id: NAVER_CLIENT_ID, redirect_uri: NAVER_REDIRECT_URI, state }).toString();
  return response.redirect(url.toString());
};
