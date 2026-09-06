const CALDAV_ORIGIN = 'https://caldav.calendar.naver.com';
const CALDAV_ROOT = `${CALDAV_ORIGIN}/principals/`;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function requireCalDavConfig() {
  const { NAVER_CALDAV_USERNAME, NAVER_CALDAV_PASSWORD } = process.env;
  if (!NAVER_CALDAV_USERNAME || !NAVER_CALDAV_PASSWORD) {
    throw new Error('네이버 캘린더 조회 설정이 아직 완료되지 않았습니다.');
  }
  return { NAVER_CALDAV_USERNAME, NAVER_CALDAV_PASSWORD };
}

function xml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function decodeXml(value = '') {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/&#(x[\da-f]+|\d+);/gi, (_match, code) => String.fromCodePoint(code[0].toLowerCase() === 'x' ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10)));
}

function hrefsFrom(xmlText, property) {
  const pattern = new RegExp(`<(?:(?:[\\w-]+):)?${property}[^>]*>[\\s\\S]*?<(?:(?:[\\w-]+):)?href[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w-]+):)?href>[\\s\\S]*?<\\/(?:(?:[\\w-]+):)?${property}>`, 'gi');
  return [...xmlText.matchAll(pattern)].map((match) => decodeXml(match[1].trim()));
}

function responsesFrom(xmlText) {
  return [...xmlText.matchAll(/<(?:(?:[\w-]+):)?response[^>]*>([\s\S]*?)<\/(?:(?:[\w-]+):)?response>/gi)].map((match) => match[1]);
}

function calendarDataFrom(xmlText) {
  return [...xmlText.matchAll(/<(?:(?:[\w-]+):)?calendar-data[^>]*>([\s\S]*?)<\/(?:(?:[\w-]+):)?calendar-data>/gi)].map((match) => decodeXml(match[1]));
}

function toUrl(href) {
  return new URL(href, CALDAV_ROOT).toString();
}

async function caldavRequest(url, method, depth, body, operation) {
  const { NAVER_CALDAV_USERNAME, NAVER_CALDAV_PASSWORD } = requireCalDavConfig();
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${NAVER_CALDAV_USERNAME}:${NAVER_CALDAV_PASSWORD}`).toString('base64')}`,
      Depth: String(depth),
    },
    // 네이버 CalDAV 레퍼런스 구현처럼 요청 본문에 Content-Type을 붙이지 않는다.
    body: Buffer.from(body, 'utf8'),
  });
  const text = await response.text();
  if (!response.ok && response.status !== 207) throw new Error(`네이버 캘린더 ${operation}에 실패했습니다. (${response.status})`);
  return text;
}

async function findCalendarUrls() {
  if (process.env.NAVER_CALDAV_CALENDAR_URL) return [process.env.NAVER_CALDAV_CALENDAR_URL];
  const principalXml = await caldavRequest(CALDAV_ROOT, 'PROPFIND', 0, '<D:propfind xmlns:D="DAV:"><D:prop><D:current-user-principal/></D:prop></D:propfind>', '계정 확인');
  const principal = hrefsFrom(principalXml, 'current-user-principal')[0];
  if (!principal) throw new Error('네이버 캘린더 계정을 찾을 수 없습니다.');
  const homeXml = await caldavRequest(toUrl(principal), 'PROPFIND', 0, '<?xml version="1.0" encoding="utf-8"?><ns0:propfind xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:ns0="DAV:"><ns0:prop><C:calendar-home-set/></ns0:prop></ns0:propfind>', '보관함 확인');
  const home = hrefsFrom(homeXml, 'calendar-home-set')[0];
  if (!home) throw new Error('네이버 캘린더 보관함을 찾을 수 없습니다.');
  const homeUrl = toUrl(home);
  const calendarsXml = await caldavRequest(homeUrl, 'PROPFIND', 1, '<?xml version="1.0" encoding="utf-8"?><ns0:propfind xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:ns0="DAV:" xmlns:cs="http://calendarserver.org/ns/"><ns0:prop><ns0:resourcetype/><ns0:displayname/><cs:getctag/></ns0:prop></ns0:propfind>', '캘린더 목록 확인');
  return responsesFrom(calendarsXml).filter((entry) => /<(?:[\w-]+:)?calendar\b/i.test(entry)).map((entry) => {
    const match = entry.match(/<(?:(?:[\w-]+):)?href[^>]*>([\s\S]*?)<\/(?:(?:[\w-]+):)?href>/i);
    return match && toUrl(decodeXml(match[1].trim()));
  }).filter(Boolean);
}

function toUtcRangeValue(date, endOfDay = false) {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + (endOfDay ? 1 : 0)) - KST_OFFSET_MS);
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function parseIcalTime(value) {
  const date = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
  if (!date) return null;
  const [, year, month, day, hour = '00', minute = '00', second = '00', utc] = date;
  const milliseconds = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  return utc ? milliseconds : milliseconds - KST_OFFSET_MS;
}

function parseEvents(ical) {
  const unfolded = ical.replace(/\r?\n[ \t]/g, '');
  return [...unfolded.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)\r?\nEND:VEVENT/gi)].map((match) => {
    const values = {};
    match[1].split(/\r?\n/).forEach((line) => {
      const colon = line.indexOf(':');
      if (colon < 0) return;
      const name = line.slice(0, colon).split(';')[0].toUpperCase();
      values[name] = line.slice(colon + 1).replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
    });
    return { summary: values.SUMMARY || '', start: parseIcalTime(values.DTSTART || ''), end: parseIcalTime(values.DTEND || '') };
  }).filter((event) => event.start !== null && event.end !== null && event.end > event.start);
}

async function eventsBetween(startDate, endDate) {
  // 네이버 CalDAV는 calendar-query에서 일정 본문을 함께 요청하면 400을 반환한다.
  // 먼저 일정 URL만 구한 뒤 calendar-multiget으로 본문을 가져온다.
  const rangeQuery = `<C:calendar-query xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop xmlns:D="DAV:"><D:getetag/></D:prop><C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:time-range start="${xml(toUtcRangeValue(startDate))}" end="${xml(toUtcRangeValue(endDate, true))}"/></C:comp-filter></C:comp-filter></C:filter></C:calendar-query>`;
  const urls = await findCalendarUrls();
  const results = await Promise.all(urls.map(async (url) => {
    const rangeXml = await caldavRequest(url, 'REPORT', 1, rangeQuery, '일정 범위 확인');
    const eventHrefs = responsesFrom(rangeXml).map((entry) => {
      const match = entry.match(/<(?:(?:[\w-]+):)?href[^>]*>([\s\S]*?)<\/(?:(?:[\w-]+):)?href>/i);
      return match && decodeXml(match[1].trim());
    }).filter((href) => href && /\.ics$/i.test(href));
    if (!eventHrefs.length) return [];
    const hrefList = eventHrefs.map((href) => `<D:href xmlns:D="DAV:">${xml(href)}</D:href>`).join('');
    const dataQuery = `<C:calendar-multiget xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop xmlns:D="DAV:"><D:getetag/><C:calendar-data><C:comp name="VCALENDAR"><C:prop name="VERSION"/><C:comp name="VEVENT"><C:prop name="SUMMARY"/><C:prop name="DTSTART"/><C:prop name="DTEND"/></C:comp></C:comp></C:calendar-data></D:prop>${hrefList}</C:calendar-multiget>`;
    return calendarDataFrom(await caldavRequest(url, 'REPORT', 1, dataQuery, '일정 내용 확인'));
  }));
  return results.flatMap((calendars) => calendars.flatMap(parseEvents));
}

function dateKeyAtKst(milliseconds) {
  const date = new Date(milliseconds + KST_OFFSET_MS);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

async function blockedSlotsBetween(startDate, endDate) {
  const blocked = {};
  const events = await eventsBetween(startDate, endDate);
  const consultationEvents = events.filter((event) => /상담\s*일정/i.test(event.summary));
  const rangeStart = parseIcalTime(`${startDate.replaceAll('-', '')}T000000`);
  const rangeEnd = parseIcalTime(`${endDate.replaceAll('-', '')}T000000`) + 24 * 60 * 60 * 1000;
  for (let dayStart = rangeStart; dayStart < rangeEnd; dayStart += 24 * 60 * 60 * 1000) {
    const day = dateKeyAtKst(dayStart);
    for (let hour = 10; hour < 19; hour += 1) {
      const slotStart = dayStart + hour * 60 * 60 * 1000;
      const slotEnd = slotStart + 60 * 60 * 1000;
      if (consultationEvents.some((event) => event.start < slotEnd && event.end > slotStart)) {
        (blocked[day] ??= []).push(`${String(hour).padStart(2, '0')}:00`);
      }
    }
  }
  return blocked;
}

module.exports = { blockedSlotsBetween, requireCalDavConfig };
