import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTitle, PROFILE_KEY } from '../lib.js';
import PhotoSheet from '../Photos.jsx';
import './Agent.css';

// 지도 라이브러리(Leaflet 1.9.4)는 unpkg 에서 지도가 필요할 때 한 번만 불러와요.
// integrity 값은 받은 파일이 그대로인지 확인하는 해시예요 (다르면 브라우저가 막아요).
const LEAFLET_BASE = 'https://unpkg.com/leaflet@1.9.4/dist/';
const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
const LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
let leafletPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = LEAFLET_BASE + 'leaflet.css';
      css.integrity = LEAFLET_CSS_SRI;
      css.crossOrigin = '';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = LEAFLET_BASE + 'leaflet.js';
      js.integrity = LEAFLET_JS_SRI;
      js.crossOrigin = '';
      js.onload = () => resolve(window.L || null);
      js.onerror = () => {
        leafletPromise = null; // 다음 답변에서 다시 시도해요
        css.remove();
        js.remove();
        resolve(null);
      };
      document.head.appendChild(js);
      setTimeout(() => resolve(window.L || null), 10000); // 너무 오래 걸리면 못 불러온 걸로 봐요
    });
  }
  return leafletPromise;
}

const ENC = 'http://encykorea.aks.ac.kr/Contents/Item/E0068824';
const ABOUT = [
  '오름은 작은 산이나 산봉우리를 가리키는 제주어예요.',
  '제주도에는 368개에 달하는 오름이 알려져 있어요.',
  '오름은 대부분 현무암질 스코리아로 만들어진 분석구예요.',
];
const CHIPS = ['오늘 제주 날씨', '비 와도 괜찮은 곳', '반나절 코스 추천'];

// 2일차 가짜 답변 3개: 연습 모드이거나 호출이 실패했을 때만 차례로 돌려 써요 (진짜 AI 아님)
const FAKE_REPLIES = [
  '안녕하세요! 저는 제주 길잡이예요 🌞 오늘 제주 어디에 가 보고 싶으세요? 걷는 시간이나 날씨를 알려 주시면 맞춰서 알려 드릴게요.',
  '부모님과 함께라면 오르는 길이 완만한 오름이 좋아요. 예를 들어 새별오름은 정상까지 가볍게 오를 수 있는 오름으로 알려져 있어요.',
  '아직 공부 중이에요! 5일차에 진짜로 알아볼게요.',
];


// 보낼 취향: 이 기기에 저장된 값 → 없으면 my_profile.json → 그래도 없으면 빈 취향
function cleanProfile(d) {
  const o = d && typeof d === 'object' ? d : {};
  return {
    style: Array.isArray(o.style) ? o.style.filter((x) => typeof x === 'string') : [],
    pace: typeof o.pace === 'string' ? o.pace : '',
    with: typeof o.with === 'string' ? o.with : '',
  };
}
const hasAny = (p) => p.style.length > 0 || !!p.pace || !!p.with;

async function getProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const p = cleanProfile(JSON.parse(raw));
      if (hasAny(p)) return p;
    }
  } catch (e) { /* 저장소를 못 읽으면 다음 방법으로 */ }
  try {
    const r = await fetch('/my_profile.json', { cache: 'no-store' });
    if (r.ok) {
      const p = cleanProfile(await r.json());
      if (hasAny(p)) return p;
    }
  } catch (e) { /* 파일이 없으면 빈 취향 */ }
  return { style: [], pace: '', with: '' };
}

// 주소 하나에 묻기. 진짜 답이면 서버가 준 값, 아니면 null
async function callApi(url, question, profile, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question.slice(0, 300), profile }),
      signal: ctl.signal,
    });
    if (!r.ok) return null;
    const d = await r.json();
    // 연습 모드(열쇠 없음)도 서버가 규칙으로 만든 진짜 장소·날씨 결과를 주면 보여 줘요
    const ok = d && (d.mode === 'live' || (d.mode === 'practice' && Array.isArray(d.places)));
    return ok && typeof d.text === 'string' && d.text.trim() ? d : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// /api/agent(도구를 쓰는 에이전트)에 물어요. 안 되면 연습 모드 가짜 답으로 넘어가요
async function ask(question) {
  const profile = await getProfile();
  const a = await callApi('/api/agent', question, profile, 60000);
  if (!a) return { practice: true };
  return {
    text: a.text.trim(),
    judge: typeof a.judge === 'string' ? a.judge.trim() : '',
    tip: typeof a.tip === 'string' ? a.tip.trim() : '',
    places: Array.isArray(a.places) ? a.places.slice(0, 3) : [],
    steps: Array.isArray(a.steps) ? a.steps : [],
    demo: a.mode === 'practice', // 서버가 열쇠 없이 규칙으로 만든 결과면 '연습 모드' 표시
  };
}

// 생각 과정의 종류별 이름과 색 (찾기=파랑, 판단=보라, 실행=초록)
const KINDS = { find: '찾기', judge: '판단', run: '실행' };

// 생각 과정 보기: 서버가 기록한 한 줄({kind, text})을 순서대로, 종류별 색 표시와 함께 보여 줘요
function Think({ steps }) {
  const rows = steps.slice(0, 8).map((s) => ({
    kind: s && KINDS[s.kind] ? s.kind : 'find',
    text: String((s && s.text) || '').slice(0, 160),
  }));
  return (
    <details className="think">
      <summary>생각 과정 보기</summary>
      <ol>
        {rows.length === 0 && <li>도구를 쓰지 않고 바로 답했어요</li>}
        {rows.map((r, i) => (
          <li key={i} className={'k-' + r.kind}>
            <span className={'kind ' + r.kind}>{KINDS[r.kind]}</span>
            {r.text}
          </li>
        ))}
      </ol>
    </details>
  );
}

// 지도: places 의 좌표로 번호 핀(카드 번호와 같아요)을 찍고 순서대로 점선으로 이어요.
// 핀을 누르면 카드가, 카드를 누르면 핀이 강조돼요. 지도를 못 불러오면 안내 한 줄만 보여 줘요.
function PlaceMap({ places, selected, onPick, focusRef }) {
  const divRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [failed, setFailed] = useState(false);

  // 목록에 있고 좌표가 있는 장소만 핀을 찍어요 (번호는 카드 순서 그대로)
  const pts = places.map((p, i) => ({ p, i })).filter(({ p }) => p.inList && Number.isFinite(p.lat) && Number.isFinite(p.lng));

  useEffect(() => {
    if (!pts.length) return undefined;
    let dead = false;
    let map = null;
    let timer = null;
    setFailed(false);
    const fail = () => {
      if (dead) return;
      clearTimeout(timer);
      if (map) map.remove();
      map = null;
      mapRef.current = null;
      markersRef.current = [];
      setFailed(true);
    };
    loadLeaflet().then((L) => {
      if (dead) return;
      if (!L || !divRef.current) {
        fail();
        return;
      }
      try {
        map = L.map(divRef.current, {
          scrollWheelZoom: false, dragging: !L.Browser.mobile, tap: false, zoomControl: true, attributionControl: false,
        });
        mapRef.current = map;
        let loaded = false;
        let errors = 0;
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 })
          .on('tileload', () => { loaded = true; })
          .on('tileerror', () => { errors += 1; })
          .addTo(map);
        markersRef.current = [];
        pts.forEach(({ p, i }) => {
          const icon = L.divIcon({ className: '', html: '<div class="pin">' + (i + 1) + '</div>', iconSize: [30, 30], iconAnchor: [15, 15] });
          const m = L.marker([p.lat, p.lng], { icon, title: String(p.name || '') }).addTo(map);
          m.on('click', () => pickRef.current(i, true));
          markersRef.current[i] = m;
        });
        const latlngs = pts.map(({ p }) => [p.lat, p.lng]);
        const line = latlngs.length > 1 ? L.polyline(latlngs, { color: '#ff8a1f', weight: 3, dashArray: '6 6' }).addTo(map) : null;
        map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30], maxZoom: 12 });
        // 가까운 장소는 핀이 겹쳐 번호가 가려져요. 화면 위에서 30px 안에 다른 핀이 있으면 옆으로 살짝 밀어요
        // (많이 확대하면 저절로 떨어져요. 선도 밀린 핀을 따라가요. 그래서 '핀은 근사 위치'예요)
        const spread = () => {
          const size = map.getSize();
          const placed = [];
          const moves = [[0, 0], [34, 0], [-34, 0], [0, -34], [0, 34], [34, 34], [-34, 34], [34, -34], [-34, -34]];
          pts.forEach(({ p, i }) => {
            const base = map.latLngToContainerPoint([p.lat, p.lng]);
            const spot = moves.map(([dx, dy]) => L.point(base.x + dx, base.y + dy)).find((c) => (
              c.x >= 16 && c.x <= size.x - 16 && c.y >= 16 && c.y <= size.y - 16 && placed.every((q) => c.distanceTo(q) >= 32)
            )) || base;
            placed.push(spot);
            markersRef.current[i].setLatLng(map.containerPointToLatLng(spot));
          });
          if (line) line.setLatLngs(pts.map(({ i }) => markersRef.current[i].getLatLng()));
        };
        map.on('zoomend', spread);
        spread();
        // 타일이 하나도 안 오고 오류만 나면 지도를 못 불러온 걸로 봐요
        timer = setTimeout(() => { if (!loaded && errors > 0) fail(); }, 8000);
      } catch (e) {
        fail();
      }
    });
    return () => {
      dead = true;
      clearTimeout(timer);
      if (map) map.remove();
      mapRef.current = null;
      markersRef.current = [];
    };
  }, [places]); // eslint-disable-line react-hooks/exhaustive-deps

  // 선택한 핀 강조 + (카드를 눌렀을 때) 그 장소로 이동
  useEffect(() => {
    markersRef.current.forEach((m, k) => {
      const e = m && m.getElement();
      if (e && e.firstChild) e.firstChild.classList.toggle('on', k === selected);
    });
    const p = places[selected];
    if (focusRef.current && mapRef.current && p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
      mapRef.current.setView([p.lat, p.lng], Math.max(mapRef.current.getZoom(), 12));
    }
    focusRef.current = false;
  }, [selected, places, focusRef]);

  if (!pts.length) return null;
  if (failed) return <p className="map-fail">지도를 불러오지 못했어요</p>;
  return (
    <>
      <div className="map" ref={divRef} role="img" aria-label="추천 장소 지도" />
      <p className="map-note">
        © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap 기여자</a>
        <br />핀은 근사 위치
      </p>
    </>
  );
}

// 일정 카드 3장 + 지도: 서버가 준 값은 전부 글자로만 넣어요 (React 가 알아서 막아 줘요)
function Plan({ places }) {
  const [selected, setSelected] = useState(-1);
  const focusRef = useRef(false); // true 면 카드를 눌러서 바뀐 것 → 지도를 그 장소로 옮겨요
  const cardRefs = useRef([]);

  function pick(i, fromPin) {
    focusRef.current = !fromPin;
    setSelected(i);
    if (fromPin && cardRefs.current[i]) cardRefs.current[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  return (
    <>
      <PlaceMap places={places} selected={selected} onPick={pick} focusRef={focusRef} />
      <div className="cards">
        {places.map((p, i) => (
          <div
            className={'card' + (selected === i ? ' on' : '')}
            key={String(p.id || p.name || i)}
            ref={(el) => { cardRefs.current[i] = el; }}
            onClick={() => pick(i, false)}
          >
            <div className="no">{i + 1}</div>
            <div className="body">
              <p className="name">
                {String(p.name || '')}
                {' · '}
                {p.inList
                  ? <span className="where">{p.indoor ? '실내' : '야외'}</span>
                  : <span className="check">직접 확인 ⚠</span>}
              </p>
              {p.why && <p className="why">{String(p.why)}</p>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// 에이전트 답: ① judge 한 줄(보라) ② 지도 ③ 일정 카드 ④ 생각 과정 보기
// (장소가 없는 답은 글 말풍선만 보여 줘요. 연습 모드면 맨 위에 작은 '연습 모드' 표시)
function Bot({ m }) {
  const places = m.places || [];
  const hasPlaces = places.length > 0;
  const wide = hasPlaces || Array.isArray(m.steps);
  return (
    <div className={'botwrap' + (wide ? ' wide' : '')}>
      {m.practice && <span className="mode-tag">연습 모드</span>}
      {hasPlaces ? (
        <>
          {m.judge && <p className="answer-judge">{m.judge}</p>}
          {m.tip && <p className="tip">{m.tip}</p>}
          <Plan places={places} />
        </>
      ) : (
        <div className="msg bot">{m.text}</div>
      )}
      {Array.isArray(m.steps) && <Think steps={m.steps} />}
      {hasPlaces && <p className="notice">방문 전 운영 여부를 확인하세요</p>}
    </div>
  );
}

export default function Agent() {
  useTitle('제주 길잡이');
  const [messages, setMessages] = useState([
    { id: 1, who: 'bot', text: '안녕하세요! 제주에 대해 무엇이 궁금하세요?' },
  ]);
  const [typing, setTyping] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false); // 제주 사진 화면
  const [text, setText] = useState('');
  const busyRef = useRef(false);
  const fakeN = useRef(0);
  const nextId = useRef(3);
  const chatRef = useRef(null);

  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    const lastMsg = messages[messages.length - 1];
    const last = el.lastElementChild;
    if (!typing && lastMsg && lastMsg.who === 'bot' && lastMsg.places && lastMsg.places.length > 0 && last && last.classList.contains('botwrap')) {
      // 장소 답은 길어서, 맨 아래가 아니라 답의 맨 위(judge 한 줄)부터 보이게 해요
      el.scrollTop += last.getBoundingClientRect().top - el.getBoundingClientRect().top - 8;
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, typing]);

  async function send(t) {
    t = t.trim();
    if (!t || busyRef.current) return;
    busyRef.current = true;
    setMessages((ms) => [...ms, { id: nextId.current++, who: 'me', text: t }]);
    setTyping(true); // 답을 기다리는 동안 왼쪽에 "..." 표시 (너무 빨리 사라지지 않게 최소 1초)
    try {
      const [res] = await Promise.all([ask(t), new Promise((r) => setTimeout(r, 1000))]);
      const bot = res.practice
        ? { who: 'bot', text: FAKE_REPLIES[fakeN.current++ % FAKE_REPLIES.length], practice: true }
        : { who: 'bot', text: res.text, judge: res.judge, tip: res.tip, places: res.places, steps: res.steps, practice: res.demo };
      setMessages((ms) => [...ms, { id: nextId.current++, ...bot }]);
    } finally {
      setTyping(false);
      busyRef.current = false;
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    if (busyRef.current || !text.trim()) return;
    const v = text;
    setText('');
    send(v);
  }

  return (
    <div className="p-agent">
      <div className="phone">
        <header>
          <Link className="back" to="/" aria-label="처음 화면으로 돌아가기">
            <span className="arrow" aria-hidden="true">‹</span>
            <img src="/images/logo.svg" alt="" width="40" height="40" />
          </Link>
          <h1>제주 길잡이 <span className="sun" aria-hidden="true">🌞</span></h1>
          <Link className="pref" to="/profile" aria-label="내 여행 취향 정하기">내 취향</Link>
        </header>

        <details className="about">
          <summary>이 에이전트는요</summary>
          <div className="about-body">
            <ul>
              {ABOUT.map((t) => (
                <li key={t}>{t}
                  <small>출처: <a href={ENC} target="_blank" rel="noopener noreferrer">한국민족문화대백과사전 ‘오름’</a></small>
                </li>
              ))}
            </ul>
            <p className="jeju-line">🌿 <b>혼저 옵서예</b> — 어서 오세요
              <small>출처: <a href="https://www.jeju.go.kr/culture/dialect/lifeDialect.htm?act=view&seq=96" target="_blank" rel="noopener noreferrer">제주특별자치도 생활제주어</a> (이 페이지에는 ‘혼저 옵서게 — 어서 오십시오’로 실려 있어요)</small>
            </p>
          </div>
        </details>

        <main id="chat" ref={chatRef}>
          {messages.map((m) => (m.who === 'me'
            ? <div className="msg me" key={m.id}>{m.text}</div>
            : m.practice || m.steps !== undefined || m.places
              ? <Bot m={m} key={m.id} />
              : <div className="msg bot" key={m.id}>{m.text}</div>))}
          {typing && (
            <div className="msg bot typing" aria-label="답변 작성 중"><span /><span /><span /></div>
          )}
        </main>

        <div className="chips">
          {CHIPS.map((c) => <button type="button" key={c} onClick={() => send(c)}>{c}</button>)}
          <button type="button" className="photo-btn" onClick={() => setPhotosOpen(true)}>📷 제주 사진 (돌하르방 · 특산물)</button>
        </div>

        <form onSubmit={onSubmit} autoComplete="off">
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="메세지 입력" aria-label="메세지 입력" />
          <button type="submit">보내기</button>
        </form>
        <p className="note">AI 추천 · 방문 전 확인하세요</p>

        {photosOpen && <PhotoSheet onClose={() => setPhotosOpen(false)} />}
      </div>
    </div>
  );
}
