// 에이전트 도구: find_spots (장소 찾기), get_weather (예보 보기), plan_route (방문 순서와 직선거리)
// 주의: api/ 폴더의 파일은 Vercel 이 주소(/api/tools)로 열어 버려요. 그래서 아래처럼 함수로 내보내요.
//       도구는 이름 붙은 값(findSpots, findSpotsTool)으로 가져다 쓰세요.
const data = require('../data/jeju_spots.json');

const AREAS = ['동쪽', '서쪽', '서귀포', '제주시'];
const DAYS = ['오늘', '내일'];
const MAX_RESULTS = 8;
const MAX_ROUTE = 5;

// 모델에게 알려 줄 도구 설명
const findSpotsTool = {
  name: 'find_spots',
  description:
    '제주 장소 목록에서 지역(area)으로 장소를 찾아 이름, 지역, 실내 여부, 설명을 최대 ' + MAX_RESULTS + '곳까지 돌려줍니다. ' +
    'indoor 를 true 로 주면 실내 장소만, false 로 주면 야외 장소만 찾고, 생략하면 모두 찾습니다. ' +
    '이 목록 밖의 장소는 없습니다. 결과에 없는 장소는 추천하거나 지어내지 말고, 결과가 비어 있으면 없다고 말하세요.',
  input_schema: {
    type: 'object',
    properties: {
      area: { type: 'string', enum: AREAS, description: '찾을 지역: 동쪽, 서쪽, 서귀포, 제주시 중 하나' },
      indoor: { type: 'boolean', description: '선택. true 면 실내 장소만, false 면 야외 장소만. 생략하면 둘 다' },
    },
    required: ['area'],
  },
};

// 도구 실행. 좌표는 화면용이라 돌려주지 않아요.
function findSpots(input) {
  const area = input && input.area;
  if (!AREAS.includes(area)) {
    return { error: 'area 는 ' + AREAS.join(', ') + ' 중 하나여야 합니다.' };
  }
  const indoor = input && typeof input.indoor === 'boolean' ? input.indoor : undefined;
  const matched = data.spots.filter((s) => s.region === area && (indoor === undefined || s.indoor === indoor));
  const spots = matched.slice(0, MAX_RESULTS).map((s) => ({
    name: s.name,
    area: s.region,
    indoor: s.indoor,
    description: s.note,
  }));
  return { area, count: spots.length, truncated: matched.length > MAX_RESULTS, spots };
}

// 모델에게 알려 줄 날씨 도구 설명
const getWeatherTool = {
  name: 'get_weather',
  description:
    '제주 지역(area)의 오늘 또는 내일(day) 예보를 Open-Meteo 에서 가져와 날짜, 강수확률(%), 최고기온(°C)을 돌려줍니다. ' +
    '가져오지 못하면 ok 가 false 로 오니, 날씨 숫자를 지어내지 말고 날씨를 알 수 없다고 말하세요.',
  input_schema: {
    type: 'object',
    properties: {
      area: { type: 'string', enum: AREAS, description: '날씨를 볼 지역: 동쪽, 서쪽, 서귀포, 제주시 중 하나' },
      day: { type: 'string', enum: DAYS, description: '오늘 또는 내일' },
    },
    required: ['area', 'day'],
  },
};

const WEATHER_FAIL = { ok: false, note: '날씨를 가져오지 못했어요' };

// 도구 실행. 받은 값이 숫자가 아니면 아무것도 지어내지 않고 실패로 돌려줘요.
async function getWeather(input) {
  const area = input && input.area;
  const day = input && input.day;
  const point = data.areas && data.areas[area];
  if (!AREAS.includes(area) || !point || !DAYS.includes(day)) {
    return { ok: false, note: 'area 는 ' + AREAS.join(', ') + ' 중 하나, day 는 ' + DAYS.join(', ') + ' 중 하나여야 합니다.' };
  }
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + point.lat + '&longitude=' + point.lng +
    '&daily=precipitation_probability_max,temperature_2m_max&timezone=Asia%2FSeoul&forecast_days=2';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) return WEATHER_FAIL;
    const j = await r.json();
    const i = DAYS.indexOf(day);
    const d = j && j.daily;
    const date = d && Array.isArray(d.time) ? d.time[i] : undefined;
    const rain = d && Array.isArray(d.precipitation_probability_max) ? d.precipitation_probability_max[i] : undefined;
    const temp = d && Array.isArray(d.temperature_2m_max) ? d.temperature_2m_max[i] : undefined;
    if (typeof date !== 'string' || typeof rain !== 'number' || typeof temp !== 'number') return WEATHER_FAIL;
    return { ok: true, area, day, date, precipitation_probability: rain, temperature_max: temp, source: 'Open-Meteo 예보' };
  } catch (e) {
    return WEATHER_FAIL;
  } finally {
    clearTimeout(timer);
  }
}

// 모델에게 알려 줄 동선 도구 설명
const planRouteTool = {
  name: 'plan_route',
  description:
    '장소 목록에 있는 2곳에서 ' + MAX_ROUTE + '곳을 골라, 이동 거리가 가장 짧은 방문 순서와 장소 사이의 직선거리(km)를 알려 줍니다. ' +
    'spots 에는 find_spots 결과에 나온 장소 이름을 쓰세요. 이 목록 밖의 장소는 없습니다. ' +
    '거리는 직선거리일 뿐이라 실제 도로 거리나 이동 시간이 아닙니다. 이동 시간은 지어내지 마세요.',
  input_schema: {
    type: 'object',
    properties: {
      spots: {
        type: 'array',
        items: { type: 'string' },
        description: '방문할 장소 이름 2~' + MAX_ROUTE + '개 (예: ["비자림", "만장굴"])',
      },
    },
    required: ['spots'],
  },
};

// 두 장소 사이의 직선거리(km)
function distKm(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const round1 = (x) => Math.round(x * 10) / 10;

// 도구 실행. 장소 좌표(목록에 있는 값)로만 계산하고, 못 찾는 이름이 있으면 지어내지 않고 알려 줘요.
function planRoute(input) {
  const raw = input && Array.isArray(input.spots) ? input.spots : null;
  if (!raw) return { ok: false, note: 'spots 는 장소 이름의 목록이어야 합니다.' };
  const found = [];
  const unknown = [];
  for (const k of raw) {
    const key = String(k).trim();
    const s = data.spots.find((x) => x.id === key || x.name === key);
    if (!s) unknown.push(key);
    else if (!found.includes(s)) found.push(s);
  }
  if (unknown.length) return { ok: false, note: '목록에 없는 장소가 있어요: ' + unknown.join(', ') };
  if (found.length < 2 || found.length > MAX_ROUTE) {
    return { ok: false, note: '장소는 2곳에서 ' + MAX_ROUTE + '곳까지 고를 수 있어요.' };
  }

  // 모든 순서를 따져 총 거리가 가장 짧은 것을 골라요 (최대 5곳이라 120가지)
  let best = null;
  const walk = (path, rest) => {
    if (!rest.length) {
      let d = 0;
      for (let i = 1; i < path.length; i++) d += distKm(path[i - 1], path[i]);
      if (!best || d < best.d - 1e-9) best = { path, d };
      return;
    }
    rest.forEach((s, i) => walk([...path, s], rest.filter((_, j) => j !== i)));
  };
  walk([], found);

  const legs = [];
  for (let i = 1; i < best.path.length; i++) {
    legs.push({ from: best.path[i - 1].name, to: best.path[i].name, distance_km: round1(distKm(best.path[i - 1], best.path[i])) });
  }
  return {
    ok: true,
    order: best.path.map((s, i) => ({ order: i + 1, id: s.id, name: s.name, area: s.region })),
    legs,
    total_km: round1(best.d),
    note: '직선거리 기준이에요. 실제 도로 거리와 이동 시간은 더 길 수 있어요.',
  };
}

// GET /api/tools?area=동쪽&indoor=true  → find_spots 결과 (/tools-test 화면이 브라우저에서 시험할 때 써요)
// GET /api/tools?tool=weather&area=동쪽&day=내일  → get_weather 결과 (tools_test.html 이 시험할 때 써요)
// 장소 목록과 예보는 공개 정보라 키가 필요 없어요. 그 밖의 요청은 404.
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(404).end();
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  if (q.tool === 'route') {
    const r = planRoute({ spots: String(q.spots || '').split(',') });
    if (r.ok) {
      // 화면의 지도용으로 좌표를 덧붙여요 (모델에게 주는 planRoute 결과에는 좌표가 없어요)
      r.order = r.order.map((o) => {
        const f = data.spots.find((x) => x.id === o.id);
        return { ...o, lat: f.lat, lng: f.lng };
      });
    }
    res.status(200);
    res.setHeader('Cache-Control', 'no-store');
    return res.json(r);
  }
  if (q.tool === 'weather') {
    const w = await getWeather({ area: q.area, day: q.day });
    const pt = w.ok && data.areas ? data.areas[q.area] : null;
    res.status(200);
    res.setHeader('Cache-Control', 'no-store');
    return res.json(pt ? { ...w, lat: pt.lat, lng: pt.lng } : w); // 화면의 지도용으로 대표 좌표를 덧붙여요
  }
  const indoor = q.indoor === 'true' ? true : q.indoor === 'false' ? false : undefined;
  const out = findSpots({ area: q.area, indoor });
  if (!out.error) {
    // 화면의 지도용으로 좌표를 덧붙여요 (모델에게 주는 findSpots 결과에는 좌표가 없어요)
    out.spots = out.spots.map((s) => {
      const f = data.spots.find((x) => x.name === s.name && x.region === s.area);
      return f ? { ...s, lat: f.lat, lng: f.lng } : s;
    });
  }
  res.status(out.error ? 400 : 200);
  res.setHeader('Cache-Control', 'no-store');
  res.json(out);
};
module.exports.findSpotsTool = findSpotsTool;
module.exports.findSpots = findSpots;
module.exports.getWeatherTool = getWeatherTool;
module.exports.getWeather = getWeather;
module.exports.planRouteTool = planRouteTool;
module.exports.planRoute = planRoute;
