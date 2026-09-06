const CALDAV_ORIGIN = 'https://caldav.calendar.naver.com';
const CALDAV_ROOT = `${CALDAV_ORIGIN}/`;
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

function responsesFrom(xmlText) {
  return [...xmlText.matchAll(/<(?:(?:[\w-]+):)?response[^>]*>([\s\S]*?)<\/(?:(?:[\w-]+):)?response>/gi)].map((match) => match[1]);
}

function calendarDataFrom(xmlText) {
  return [...xmlText.matchAll(/<(?:(?:[\w-]+):)?calendar-data[^>]*>([\s\S]*?)<\/(?:(?:[\w-]+):)?calendar-data>/gi)].map((match) => decodeXml(match[1]));
}

function toUrl(href) {
  return new URL(href, CALDAV_ROOT).toString();
}

async function caldavRequest(url, method, depth, body) {
  const { NAVER_CALDAV_USERNAME, NAVER_CALDAV_PASSWORD } = requireCalDavConfig();
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${NAVER_CALDAV_USERNAME}:${NAVER_CALDAV_PASSWORD}`).toString('base64')}`,
      Depth: String(depth),
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body,
  });
  const text = await response.text();
  if (!response.ok && response.status !== 207) throw new Error(`네이버 캘린더 조회에 실패했습니다. (${response.status})`);
  return text;
}

async function findCalendarUrls() {
  if (process.env.NAVER_CALDAV_CALENDAR_URL) return [process.env.NAVER_CALDAV_CALENDAR_URL];
  // 네이버는 표준 current-user-principal 탐색에 400을 반환할 수 있다. 네이버 고유의
  // 캘린더 보관함 경로를 직접 사용한다. (/caldav/{네이버아이디}/calendar/{캘린더ID}/)
  const { NAVER_CALDAV_USERNAME } = requireCalDavConfig();
  const homeUrl = `${CALDAV_ORIGIN}/caldav/${encodeURIComponent(NAVER_CALDAV_USERNAME)}/`;
  const calendarsXml = await caldavRequest(homeUrl, 'PROPFIND', 1, '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>');
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
  const query = `<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${xml(toUtcRangeValue(startDate))}" end="${xml(toUtcRangeValue(endDate, true))}"/></c:comp-filter></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
  const urls = await findCalendarUrls();
  const results = await Promise.all(urls.map(async (url) => calendarDataFrom(await caldavRequest(url, 'REPORT', 1, query))));
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
