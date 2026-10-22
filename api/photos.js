// Vercel 서버 함수: GET /api/photos
//   ?topic=돌하르방   정해 둔 주제(돌하르방·특산물)
//   ?q=한라산         자유 검색어 (돋보기 검색)
//   ?fruit=사과       과일 이름 (과일 나무 화면: 과일 사진 20장, 목록에 있는 과일만)
// Pixabay 에서 사진을 찾아 화면에 줄 목록으로 돌려줘요.
// 열쇠(API 키)는 환경 변수 PIXABAY_API_KEY 에서만 읽고, 화면(브라우저)으로는 절대 보내지 않아요.
// Pixabay 규칙: 결과를 캐시하고, 화면에 출처(Pixabay)를 보이고, 사진 주소는 검색 결과를 보여 줄 때만 써요
// (사진 주소는 24시간만 유효해서 캐시도 그보다 짧게 20시간으로 해요).

const FRUITS = require('../data/fruits.json');

const API_URL = 'https://pixabay.com/api/';
const PER_PAGE = 12;
const FRUIT_WANT = 20; // 과일 나무 화면은 오려내기가 잘 되는 사진을 고르려고 넉넉히 받아요
const CACHE_MS = 20 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

// 고를 수 있는 주제 (이 밖의 값은 거절해요). 정확한 검색어부터 쓰고, 사진이 want 장 모일 때까지 이어서 찾아요.
// (실제 Pixabay 결과를 보고 정한 순서예요: 한글 검색어는 제주와 상관없는 사진이 섞이는 경우가 많아 영어를 앞에 뒀어요)
const TOPICS = {
  돌하르방: { want: 10, queries: [['hareubang', 'en'], ['돌하르방', 'ko']] },
  감귤: { want: 8, queries: [['tangerine', 'en'], ['jeju tangerine', 'en']] },
  한라봉: { want: 8, queries: [['hallabong', 'en'], ['dekopon', 'en']] },
  흑돼지: { want: 8, queries: [['jeju black pork', 'en'], ['흑돼지', 'ko']] },
  갈치: { want: 8, queries: [['cutlassfish', 'en'], ['hairtail', 'en']] },
};
const DEFAULT_WANT = 12;

const cache = new Map(); // 'topic:돌하르방' · 'q:한라산' · 'fruit:사과' → { at, body }
const MAX_CACHE = 200;
const MAX_QUERY = 40;

// Pixabay 한도(키 하나에 1분 100번)를 아끼려고, 이 서버가 1분에 보내는 검색 수를 제한해요
const sent = [];
function allowSearch() {
  const now = Date.now();
  while (sent.length && now - sent[0] > 60000) sent.shift();
  if (sent.length >= 60) return false;
  sent.push(now);
  return true;
}

// 사진 주소는 Pixabay 것만 통과시켜요
function safePixabayUrl(u) {
  try {
    const x = new URL(String(u));
    return x.protocol === 'https:' && (x.hostname === 'pixabay.com' || x.hostname.endsWith('.pixabay.com')) ? x.href : '';
  } catch (e) {
    return '';
  }
}

// 과일 이름 찾기: 한글 이름·다른 이름·영어 이름 어느 것이든 (이 목록에 없는 말은 null)
function findFruit(input) {
  const t = String(input || '').trim().toLowerCase();
  if (!t) return null;
  return FRUITS.find((f) => f.ko === t || f.aliases.includes(t) || f.en.includes(t)) || null;
}

// 과일 나무 화면용: 사진 태그에 그 과일을 가리키는 말이 있고, 꽃·나무·음료·그림 같은 말이 없으면 '과일 사진'으로 봐요
const NOT_FRUIT = ['blossom', 'blossoms', 'flower', 'flowers', 'tree', 'trees', 'orchard', 'logo', 'cartoon', 'illustration', 'vector',
  'painting', 'drawing', 'cake', 'pie', 'juice', 'smoothie', 'jam', 'dessert', 'cupcake', 'pastry', 'tea', 'wine', 'beer', 'cocktail', 'soap',
  '나무', '꽃', '주스', '케이크', '잼', '일러스트'];
function tagHas(tag, key) {
  if (/[가-힣]/.test(key)) return key.length >= 2 ? tag.includes(key) : tag === key; // 한글 한 글자 이름(귤·감)은 같을 때만
  return tag.split(/[\s\-_]+/).includes(key);
}
function isFruitPhoto(p, fruit) {
  const keys = fruit.keys && fruit.keys.length ? fruit.keys : [fruit.ko, ...fruit.en];
  const tags = p._tags || [];
  if (tags.some((t) => NOT_FRUIT.some((n) => tagHas(t, n)))) return false;
  return tags.some((t) => keys.some((k) => tagHas(t, k)));
}

function toPhoto(h) {
  const web = safePixabayUrl(h && h.webformatURL);
  const page = safePixabayUrl(h && h.pageURL);
  if (!web || !page) return null;
  return {
    id: h.id,
    thumb: web.replace('_640.', '_340.'), // 목록용 작은 사진 (Pixabay 가 알려 준 크기 바꾸기)
    view: web, // 크게 볼 때 쓰는 사진 (640px. _960 은 열리지 않아서 쓰지 않아요)
    w: Number(h.webformatWidth) || 0,
    h: Number(h.webformatHeight) || 0,
    tags: String(h.tags || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3),
    _tags: String(h.tags || '').toLowerCase().split(',').map((t) => t.trim()).filter(Boolean), // 걸러내기용 전체 태그 (화면에는 보내지 않아요)
    user: String(h.user || '').slice(0, 40),
    pageUrl: page,
  };
}

// Pixabay 한 번 부르기. 성공하면 사진 배열, 한도 초과(429)면 'limit', 그 밖의 실패는 null
async function search(q, lang, key, perPage) {
  const url = new URL(API_URL);
  url.searchParams.set('key', key);
  url.searchParams.set('q', q);
  url.searchParams.set('lang', lang);
  url.searchParams.set('image_type', 'photo');
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('per_page', String(perPage));
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
  const params = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);

  // 무엇을 찾을지: 과일(fruit), 자유 검색어(q, 글자·숫자·띄어쓰기·-·_ 만, 40자까지), 정해 둔 주제(topic)
  let cacheKey;
  let plan; // [[검색어, 언어], ...]
  let want = DEFAULT_WANT;
  let perPage = PER_PAGE;
  let label;
  let fruitFilter = null; // 과일 모드에서만: 과일 사진이 아닌 것은 빼요
  if (params.fruit !== undefined) {
    const f = findFruit(params.fruit);
    if (!f) {
      return send(res, 400, { ok: false, note: '과일 이름을 써 주세요 (예: 사과, 배, 귤, 포도)', fruits: FRUITS.map((x) => x.ko) });
    }
    // 단색 배경의 '과일만 찍은 사진'이 잘 나오는 검색어부터 (오려내기가 잘 돼요)
    plan = [
      ...f.en.map((e) => [e + ' isolated', 'en']),
      ...f.en.map((e) => [e + ' white background', 'en']),
      ...f.en.map((e) => [e + ' fruit', 'en']),
    ];
    want = FRUIT_WANT;
    perPage = FRUIT_WANT;
    fruitFilter = f;
    cacheKey = 'fruit:' + f.ko;
    label = f.ko;
  } else if (params.q !== undefined) {
    const term = String(params.q).trim().replace(/\s+/g, ' ');
    if (!term || term.length > MAX_QUERY || !/^[\p{L}\p{N} _-]+$/u.test(term)) {
      return send(res, 400, { ok: false, note: '검색어는 글자·숫자·띄어쓰기로 ' + MAX_QUERY + '자까지 쓸 수 있어요.' });
    }
    cacheKey = 'q:' + term.toLowerCase();
    plan = [[term, /[가-힣]/.test(term) ? 'ko' : 'en']];
    label = term;
  } else {
    const topic = String(params.topic || '');
    if (!Object.prototype.hasOwnProperty.call(TOPICS, topic)) {
      return send(res, 400, { ok: false, note: '주제는 ' + Object.keys(TOPICS).join(', ') + ' 중 하나이거나 q 로 검색어를 보내 주세요.', topics: Object.keys(TOPICS) });
    }
    cacheKey = 'topic:' + topic;
    plan = TOPICS[topic].queries;
    want = TOPICS[topic].want;
    label = topic;
  }

  // 환경변수 이름은 PIXABAY_API_KEY 가 기본이고, Vercel 에 PIXABAY 로 등록돼 있어도 같이 읽어요
  const key = process.env.PIXABAY_API_KEY || process.env.PIXABAY;
  if (!key) {
    // 원인을 찾기 쉽게: 이 서버가 어느 환경(production/preview)에서 어느 커밋으로 도는지, 이름에 pixabay 가 들어간
    // 환경변수가 있는지(이름과 '값 있음/비어 있음'만, 값은 절대 아님)를 함께 알려 줘요
    const seen = Object.keys(process.env).filter((k) => /pixabay/i.test(k)).slice(0, 5).map((k) => k + ':' + (process.env[k] ? 'set' : 'empty'));
    return send(res, 200, {
      ok: false,
      reason: 'nokey',
      note: '사진 연결이 아직 안 됐어요 (PIXABAY_API_KEY 가 필요해요)',
      debug: { env: process.env.VERCEL_ENV || 'local', commit: String(process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7), pixabayEnvNames: seen },
    });
  }

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return send(res, 200, hit.body, true);

  // 검색어를 차례로 써 보며 사진을 모아요 (같은 사진은 한 번만)
  const photos = [];
  const seenIds = new Set();
  let limited = false;
  let failed = false;
  for (const [term, lang] of plan) {
    if (photos.length >= want) break;
    if (!allowSearch()) { limited = true; break; }
    const got = await search(term, lang, key, perPage);
    if (got === 'limit') { limited = true; break; }
    if (got === null) { failed = true; continue; }
    for (const p of got) {
      if (fruitFilter && !isFruitPhoto(p, fruitFilter)) continue;
      if (!seenIds.has(p.id) && photos.length < want) { seenIds.add(p.id); photos.push(p); }
    }
  }
  if (!photos.length) {
    const note = limited
      ? '잠시 뒤에 다시 눌러 주세요 (요청이 너무 많았어요)'
      : failed ? '사진을 가져오지 못했어요'
        : params.q !== undefined ? '사진을 찾지 못했어요. 다른 말이나 영어로도 검색해 보세요 (예: tangerine)' : '사진을 찾지 못했어요';
    return send(res, 200, { ok: false, note });
  }
  const body = { ok: true, topic: label, source: 'Pixabay', photos: photos.map(({ _tags, ...rest }) => rest) };
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value); // 가장 오래된 것부터 비워요
  cache.set(cacheKey, { at: Date.now(), body });
  return send(res, 200, body, true);
};
module.exports.TOPICS = Object.keys(TOPICS);
module.exports.findFruit = findFruit;
