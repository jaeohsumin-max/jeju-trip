// 에이전트가 쓰는 도구 2개: 장소 찾기, 날씨 보기. (Vercel은 _ 로 시작하는 파일을 함수로 열지 않습니다)
const data = require('../data/jeju_spots.json');

const REGIONS = ['동쪽', '서쪽', '서귀포', '제주시'];
const SPOTS = data.spots;

// 지역별 대표 좌표 (날씨 조회용)
const REGION_POINT = {
  '동쪽': { lat: 33.46, lng: 126.83 },
  '서쪽': { lat: 33.39, lng: 126.28 },
  '서귀포': { lat: 33.25, lng: 126.56 },
  '제주시': { lat: 33.51, lng: 126.53 },
};

const TOOL_DEFS = [
  {
    name: 'find_spots',
    description: '제주 장소 목록에서 지역으로 장소를 찾습니다. 장소 id, 이름, 종류, 소요 시간, 난이도, 비 오는 날 가능 여부(rain_ok), 메모를 돌려줍니다.',
    input_schema: {
      type: 'object',
      properties: {
        region: { type: 'string', enum: REGIONS, description: '찾을 지역' },
      },
      required: ['region'],
    },
  },
  {
    name: 'get_weather',
    description: '지역의 오늘과 내일 비 올 확률(%)을 알려 줍니다.',
    input_schema: {
      type: 'object',
      properties: {
        region: { type: 'string', enum: REGIONS, description: '날씨를 볼 지역' },
      },
      required: ['region'],
    },
  },
];

function findSpots(input) {
  const region = input && input.region;
  if (!REGIONS.includes(region)) {
    return { error: '지역은 ' + REGIONS.join(', ') + ' 중 하나여야 합니다.' };
  }
  const spots = SPOTS.filter((s) => s.region === region).map((s) => ({
    id: s.id, name: s.name, type: s.type, duration_min: s.duration_min,
    difficulty: s.difficulty, rain_ok: s.rain_ok, note: s.note,
  }));
  return { region, count: spots.length, spots };
}

async function getWeather(input) {
  const region = input && input.region;
  const p = REGION_POINT[region];
  if (!p) return { error: '지역은 ' + REGIONS.join(', ') + ' 중 하나여야 합니다.' };
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat + '&longitude=' + p.lng +
    '&daily=precipitation_probability_max&forecast_days=2&timezone=Asia%2FSeoul';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return { error: '날씨 정보를 가져오지 못했습니다.' };
    const j = await r.json();
    const probs = j && j.daily && j.daily.precipitation_probability_max;
    if (!Array.isArray(probs) || probs.length < 2 || probs.some((v) => typeof v !== 'number')) {
      return { error: '날씨 정보를 가져오지 못했습니다.' };
    }
    return { region, today_rain_percent: probs[0], tomorrow_rain_percent: probs[1] };
  } catch (e) {
    return { error: '날씨 정보를 가져오지 못했습니다.' };
  } finally {
    clearTimeout(timer);
  }
}

async function runTool(name, input) {
  if (name === 'find_spots') return findSpots(input);
  if (name === 'get_weather') return getWeather(input);
  return { error: '알 수 없는 도구입니다.' };
}

function getSpot(id) {
  return SPOTS.find((s) => s.id === id) || null;
}

module.exports = { TOOL_DEFS, REGIONS, runTool, getSpot };
