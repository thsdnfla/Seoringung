const crypto = require('node:crypto');
const { blockedSlotsBetween } = require('./calendar');

const required = ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'NAVER_ADMIN_REFRESH_TOKEN'];
const escapeIcal = (value = '') => String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');const compactDate = (date, time) => `${date.replaceAll('-', '')}T${time.replace(':', '')}00`;
const koreaDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day}`;
};

async function getAccessToken() {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.NAVER_CLIENT_ID,
    client_secret: process.env.NAVER_CLIENT_SECRET,
    refresh_token: process.env.NAVER_ADMIN_REFRESH_TOKEN,
  });
  const response = await fetch('https://nid.naver.com/oauth2.0/token', { method: 'POST', body });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error('관리자 네이버 인증을 갱신하지 못했습니다.');
  return data.access_token;
}

function makeIcal({ type, date, time, bookerName, bookerPhone, visitorName, visitorPhone, message }) {
  const endHour = String(Number(time.slice(0, 2)) + 1).padStart(2, '0');
  const endTime = `${endHour}:00`;
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const description = `예약자: ${bookerName} (${bookerPhone})\\n상담자: ${visitorName} (${visitorPhone})${message ? `\\n남기실 말씀: ${message}` : ''}`;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:Seoringung Reservation', 'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE', 'TZID:Asia/Seoul', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZNAME:GMT+09:00', 'TZOFFSETFROM:+0900', 'TZOFFSETTO:+0900', 'END:STANDARD', 'END:VTIMEZONE',
    'BEGIN:VEVENT', `UID:${crypto.randomUUID()}@seoringung`, 'SEQUENCE:0', 'CLASS:PRIVATE', 'TRANSP:OPAQUE',
    `DTSTART;TZID=Asia/Seoul:${compactDate(date, time)}`, `DTEND;TZID=Asia/Seoul:${compactDate(date, endTime)}`,
    `SUMMARY:${escapeIcal(`상담 일정 · 서린궁 ${type}`)}`, `DESCRIPTION:${escapeIcal(description)}`, `LOCATION:${escapeIcal('인천 부평구 장제로 249번길 10-2, 201호')}`,
    `CREATED:${now}`, `LAST-MODIFIED:${now}`, `DTSTAMP:${now}`, 'END:VEVENT', 'END:VCALENDAR',
  ].join('\n');
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'POST 요청만 지원합니다.' });
  if (required.some((key) => !process.env[key])) return response.status(503).json({ error: '네이버 캘린더 연동 설정이 아직 완료되지 않았습니다.' });
  const { type, date, time, bookerName, bookerPhone, visitorName, visitorPhone, message = '' } = request.body || {};
  if (![type, date, time, bookerName, bookerPhone, visitorName, visitorPhone].every(Boolean) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:00$/.test(time)) return response.status(400).json({ error: '예약 정보가 올바르지 않습니다.' });
  if (date <= koreaDateKey()) return response.status(400).json({ error: '당일 및 이전 날짜는 예약할 수 없습니다. 내일부터 선택해 주세요.' });
  try {
    const blocked = await blockedSlotsBetween(date, date);
    if ((blocked[date] || []).includes(time)) return response.status(409).json({ error: '이미 예약된 시간입니다. 다른 시간을 선택해 주세요.' });
    const token = await getAccessToken();
    const body = new URLSearchParams({ calendarId: 'defaultCalendarId', scheduleIcalString: makeIcal({ type, date, time, bookerName, bookerPhone, visitorName, visitorPhone, message }) });
    const calendarResponse = await fetch('https://openapi.naver.com/calendar/createSchedule.json', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
    const result = await calendarResponse.json();
    if (!calendarResponse.ok || result.result !== 'success') throw new Error('네이버 캘린더에 일정을 추가하지 못했습니다.');
    return response.status(201).json({ ok: true, calendarId: result.returnValue?.calendarId });
  } catch (error) {
    return response.status(502).json({ error: error.message || '예약 처리 중 오류가 발생했습니다.' });
  }
};
