const { blockedSlotsBetween } = require('./calendar');

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'GET 요청만 지원합니다.' });
  const { start, end } = request.query || {};
  if (!datePattern.test(start || '') || !datePattern.test(end || '') || start > end) return response.status(400).json({ error: '조회 기간이 올바르지 않습니다.' });
  try {
    return response.status(200).json({ blocked: await blockedSlotsBetween(start, end) });
  } catch (error) {
    return response.status(503).json({ error: error.message || '예약 가능 시간을 불러오지 못했습니다.' });
  }
};
