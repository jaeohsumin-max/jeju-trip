// Vercel 서버 함수: GET /api/photos?topic=돌하르방
// Pixabay 에서 제주 돌하르방·특산물 사진을 찾아 화면에 줄 목록으로 돌려줘요.
// 열쇠(API 키)는 환경 변수 PIXABAY_API_KEY 에서만 읽고, 화면(브라우저)으로는 절대 보내지 않아요.
// Pixabay 규칙: 결과를 캐시하고, 화면에 출처(Pixabay)를 보이고, 사진 주소는 검색 결과를 보여 줄 때만 써요
// (webformatURL 은 24시간만 유효해서 캐시도 그보다 짧게 20시간으로 해요).

const API_URL = 'https://pixabay.com/api/';
const PER_PAGE = 12;
const WANT = 12; // 이만큼 모이면 더 검색하지 않아요
const CACHE_MS = 20 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

// 고를 수 있는 주제 (이 밖의 값은 거절해요). 앞의 검색어로 사진이 모자라면 다음 검색어로 이어서 찾아요.
const TOPICS = {
  돌하르방: [['돌하르방', 'ko'], ['dol hareubang', 'en'], ['jeju stone statue', 'en']],
  감귤: [['제주 감귤', 'ko'], ['jeju tangerine', 'en'], ['mandarin orange', 'en']],
  한라봉: [['한라봉', 'ko'], ['hallabong', 'en'], ['dekopon', 'en']],
  흑돼지: [['제주 흑돼지', 'ko'], ['jeju black pork', 'en'], ['korean pork barbecue', 'en']],
  갈치: [['갈치', 'ko'], ['cutlassfish', 'en'], ['hairtail fish', 'en']],
};

const cache = new Map(); // topic → { at, body }

// 사진 주소는 Pixabay 것만 통과시켜요
function safePixabayUrl(u) {
  try {
    const x = new URL(String(u));
    return x.protocol === 'https:' && (x.hostname === 'pixabay.com' || x.hostname.endsWith('.pixabay.com')) ? x.href : '';
  } catch (e) {
    return '';
  }
}

const scrub = (s, key) => (key ? String(s).split(key).join('[key]') : String(s));

function toPhoto(h) {
  const web = safePixabayUrl(h && h.webformatURL);
  const page = safePixabayUrl(h && h.pageURL);
  if (!web || !page) return null;
  return {
    id: h.id,
    thumb: web.replace('_640.', '_340.'), // 목록용 작은 사진 (Pixabay 가 알려 준 크기 바꾸기)
    view: web.replace('_640.', '_960.'), // 크게 볼 때 쓰는 사진
    w: Number(h.webformatWidth) || 0,
    h: Number(h.webformatHeight) || 0,
    tags: String(h.tags || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3),
    user: String(h.user || '').slice(0, 40),
    pageUrl: page,
  };
}

// Pixabay 한 번 부르기. 성공하면 사진 배열, 한도 초과(429)면 'limit', 그 밖의 실패는 null
async function search(q, lang, key) {
  const url = new URL(API_URL);
  url.searchParams.set('key', key);
  url.searchParams.set('q', q);
  url.searchParams.set('lang', lang);
  url.searchParams.set('image_type', 'photo');
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('per_page', String(PER_PAGE));
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (r.status === 429) return 'limit';
    if (!r.ok) {
      console.error('photos upstream: ' + r.status);
      return null;
    }
    const j = await r.json();
    return (Array.isArray(j && j.hits) ? j.hits : []).map(toPhoto).filter(Boolean);
  } catch (e) {
    console.error('photos failed: ' + (e && e.name === 'AbortError' ? 'timeout' : String((e && e.name) || 'Error').slice(0, 40)));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function send(res, status, body, cacheable) {
  res.status(status);
  res.setHeader('Cache-Control', cacheable ? 'public, s-maxage=72000, stale-while-revalidate=3600' : 'no-store');
  res.json(body);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { ok: false, note: 'GET 로만 요청할 수 있어요.' });
  }
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const topic = String(q.topic || '');
  if (!Object.prototype.hasOwnProperty.call(TOPICS, topic)) {
    return send(res, 400, { ok: false, note: '주제는 ' + Object.keys(TOPICS).join(', ') + ' 중 하나여야 해요.', topics: Object.keys(TOPICS) });
  }

  const key = process.env.PIXABAY_API_KEY;
  if (!key) {
    return send(res, 200, { ok: false, reason: 'nokey', note: '사진 연결이 아직 안 됐어요 (PIXABAY_API_KEY 가 필요해요)' });
  }

  const hit = cache.get(topic);
  if (hit && Date.now() - hit.at < CACHE_MS) return send(res, 200, hit.body, true);

  // 검색어를 차례로 써 보며 사진을 모아요 (같은 사진은 한 번만)
  const photos = [];
  const seen = new Set();
  let limited = false;
  let failed = false;
  for (const [term, lang] of TOPICS[topic]) {
    if (photos.length >= WANT) break;
    const got = await search(term, lang, key);
    if (got === 'limit') { limited = true; break; }
    if (got === null) { failed = true; continue; }
    for (const p of got) {
      if (!seen.has(p.id) && photos.length < WANT) { seen.add(p.id); photos.push(p); }
    }
  }
  if (!photos.length) {
    const note = limited ? '잠시 뒤에 다시 눌러 주세요 (요청이 너무 많았어요)' : failed ? '사진을 가져오지 못했어요' : '사진을 찾지 못했어요';
    return send(res, 200, { ok: false, note });
  }
  const body = { ok: true, topic, source: 'Pixabay', photos };
  cache.set(topic, { at: Date.now(), body });
  return send(res, 200, body, true);
};
module.exports.TOPICS = Object.keys(TOPICS);
