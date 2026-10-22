import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import FRUITS from '../../data/fruits.json';
import { cutoutUrl } from '../lib/cutout.js';
import { useTitle, safePixabayUrl } from '../lib.js';
import './Tree.css';

// 과일 나무: 과일 이름을 검색하면 Pixabay 과일 사진 10장을 추천해 줘요.
// 사진을 고르면 그 사진에서 과일만 오려내(배경 지우기) 나무에 달고, 과일을 누르면 바구니에 따 담아요.
// 배경이 복잡해서 오려내기가 안 되는 사진은 귀여운 이모지 과일로 달아요.

const TRAY = 10; // 추천 사진 수
const SLOTS = [ // 나무 잎 안에서 과일이 달리는 자리 12곳 (그림 좌표)
  [160, 62], [112, 92], [208, 92], [76, 138], [136, 128], [186, 128],
  [244, 138], [98, 182], [160, 172], [222, 182], [128, 222], [194, 222],
];
const PER_BASKET = 10; // 바구니 하나에 담는 과일 수 (넘으면 바구니를 하나 더 꺼내요)
const MAX_BASKETS = 6; // 바구니는 최대 6개 (과일 60개)

// 바구니가 n개일 때 각 바구니의 자리: 입구 가운데(x, y)와 크기(s). 딴 과일은 입구로 날아가 닿아요.
// 1개는 나무 오른쪽, 2개는 나무 양옆, 3개 이상은 나무 앞에 한 줄로 (많을수록 작게)
function basketLayout(n) {
  if (n <= 1) return [{ x: 252, y: 330, s: 1 }];
  if (n === 2) return [{ x: 252, y: 330, s: 1 }, { x: 68, y: 330, s: 1 }];
  const gap = Math.min(100, 300 / n);
  const s = Math.min(0.85, (gap * 0.95) / 88);
  return Array.from({ length: n }, (_, i) => ({ x: 160 + (i - (n - 1) / 2) * gap, y: 352, s }));
}

// 바구니 한 개: 담긴 과일(마지막 5개)이 입구에 보이고, 10개가 차면 숫자가 초록색이 돼요
function Basket({ items, pos, index }) {
  const last = items.slice(-5);
  const full = items.length >= PER_BASKET;
  return (
    <g
      style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${pos.s})`, transition: 'transform .45s cubic-bezier(.3,1.3,.5,1)' }}
      role="group"
      aria-label={`바구니 ${index + 1}: ${items.length}개`}
    >
      <g className={items.length === 0 ? 'bpop' : 'bump'} key={items.length}>
        <path d="M-40 0 Q0 -68 40 0" stroke="#a56f35" strokeWidth="5" fill="none" strokeLinecap="round" />
        <ellipse rx="44" ry="10" fill="#8a5a28" />
        {last.map((b, i) => {
          const px = (i - (last.length - 1) / 2) * 17;
          return b.sprite
            ? <image key={b.uid} href={b.sprite} x={px - 15} y={-22} width="30" height="30" preserveAspectRatio="xMidYMid meet" />
            : <text key={b.uid} x={px} y={-6} fontSize="26" textAnchor="middle" dominantBaseline="central">{b.emoji}</text>;
        })}
        <path d="M-44 0 Q-40 44 -20 50 L20 50 Q40 44 44 0 Z" fill="#c68a4a" />
        <g stroke="#a56f35" strokeWidth="2.5" fill="none" strokeLinecap="round">
          <path d="M-42 14 Q0 22 42 14" />
          <path d="M-38 28 Q0 36 38 28" />
          <path d="M-30 41 Q0 47 30 41" />
        </g>
        <circle cx="42" cy="-4" r="14" fill={full ? '#37b24d' : '#ff8a1f'} stroke="#fff" strokeWidth="3" />
        <text x="42" y="-3" fontSize="15" fontWeight="800" fill="#fff" textAnchor="middle" dominantBaseline="central">{items.length}</text>
      </g>
    </g>
  );
}
const BLESSINGS = [
  '올해도 건강하고 복 많이 받으세요! 🍀',
  '달콤한 일만 가득하길 바라요 🍯',
  '오늘도 좋은 일이 주렁주렁! 🌳',
  '소원 성취하세요 ✨',
  '행복이 쑥쑥 자라나요 🌱',
  '몸도 마음도 튼튼하세요 💪',
  '웃음이 가득한 하루 되세요 😊',
  '수확의 기쁨을 함께해요 🧺',
  '혼저 옵서예~ 제주의 달콤함을 드려요 🍊',
  '사랑이 주렁주렁 열리길! 💕',
];

// 입력한 말에서 과일 찾기: 이름·다른 이름·영어 이름이 같거나, 문장 안에 과일 이름이 들어 있으면 그 과일
function resolveFruit(input) {
  const t = String(input || '').trim().toLowerCase();
  if (!t) return null;
  const exact = FRUITS.find((f) => f.ko === t || f.aliases.includes(t) || f.en.includes(t));
  if (exact) return exact;
  let best = null;
  let bestLen = 0;
  for (const f of FRUITS) {
    for (const name of [f.ko, ...f.aliases]) {
      if (name.length > bestLen && t.includes(name)) { best = f; bestLen = name.length; }
    }
  }
  return best;
}

// 받침이 있으면 '이', 없으면 '가' (예: 귤이, 사과가)
const iga = (word) => {
  const c = String(word).charCodeAt(String(word).length - 1) - 0xac00;
  return c >= 0 && c <= 11171 && c % 28 !== 0 ? '이' : '가';
};

// 사진 여러 장을 n 장씩 동시에 처리해요
async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}

// 나무에 달린 과일 한 개 (그림 안에서 흔들리고, 누르면 바구니로 날아가요)
function Fruit({ f, onHarvest, onLanded }) {
  const [x, y] = SLOTS[f.slot];
  const flying = f.state === 'flying';
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="sway" style={{ animationDelay: `${(f.slot % 5) * -0.7}s` }}>
        <g
          className={flying ? 'fruit-in fly' : 'fruit-in pop'}
          style={flying ? { '--dx': `${f.dx}px`, '--dy': `${f.dy}px` } : undefined}
          role="button"
          tabIndex={flying ? -1 : 0}
          aria-label={`${f.name} 따기`}
          onClick={() => onHarvest(f)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onHarvest(f); } }}
          onAnimationEnd={(e) => { if (e.animationName === 'tree-fly') onLanded(f.uid); }}
        >
          <circle r="34" fill="transparent" />
          <path d="M0 -26 Q2 -36 0 -44" stroke="#8b5a2b" strokeWidth="3" fill="none" strokeLinecap="round" />
          <ellipse cx="8" cy="-38" rx="8" ry="4" fill="#5fbf4a" transform="rotate(-25 8 -38)" />
          {f.sprite
            ? <image href={f.sprite} x="-29" y="-29" width="58" height="58" preserveAspectRatio="xMidYMid meet" />
            : <text y="2" fontSize="48" textAnchor="middle" dominantBaseline="central">{f.emoji}</text>}
          <g className="face" aria-hidden="true">
            <circle cx="-8" cy="-1" r="2.6" fill="#3b2a20" />
            <circle cx="8" cy="-1" r="2.6" fill="#3b2a20" />
            <ellipse cx="-15" cy="6" rx="4.5" ry="2.8" fill="#ff8fa3" opacity=".65" />
            <ellipse cx="15" cy="6" rx="4.5" ry="2.8" fill="#ff8fa3" opacity=".65" />
            <path d="M-4 5 Q0 10 4 5" stroke="#3b2a20" strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>
        </g>
      </g>
    </g>
  );
}

export default function Tree() {
  useTitle('과일 나무 | 제주에 대한 모든 것');
  const [text, setText] = useState('');
  const [fruit, setFruit] = useState(null); // 지금 찾은 과일
  const [cands, setCands] = useState([]); // 추천 사진
  const [status, setStatus] = useState('idle'); // idle | loading | ok | error
  const [note, setNote] = useState(''); // 검색 안내·오류 문구
  const [tree, setTree] = useState([]); // 나무에 달린 과일
  const [basket, setBasket] = useState([]); // 딴 과일
  const [toast, setToast] = useState(null); // { id, text } 덕담·안내
  const [sparks, setSparks] = useState([]);
  const [picked, setPicked] = useState({}); // 사진 id → 나무에 단 횟수
  const reqRef = useRef(0); // 오래된 검색 결과는 무시해요
  const uidRef = useRef(0);
  const toastTimer = useRef(null);
  const treeRef = useRef(tree);
  treeRef.current = tree;

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  function say(t) {
    clearTimeout(toastTimer.current);
    setToast({ id: ++uidRef.current, text: t });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  async function runSearch(entry) {
    const id = ++reqRef.current;
    setFruit(entry);
    setStatus('loading');
    setNote('');
    setCands([]);
    try {
      const r = await fetch('/api/photos?fruit=' + encodeURIComponent(entry.ko));
      const d = await r.json();
      if (reqRef.current !== id) return;
      if (!d || !d.ok || !Array.isArray(d.photos)) {
        setStatus('error');
        setNote((d && d.note) || '사진을 가져오지 못했어요');
        return;
      }
      const photos = d.photos
        .map((p) => ({ id: p.id, thumb: safePixabayUrl(p.thumb), tags: Array.isArray(p.tags) ? p.tags : [] }))
        .filter((p) => p.thumb);
      // 후보 사진마다 과일 오려내기를 해 보고, 잘 오려진 사진을 앞에 추천해요
      // (그 사이에 새로 검색했다면 남은 사진은 불러오지 않고 건너뛰어요)
      const done = await mapLimit(photos, 4, async (p) => (
        reqRef.current !== id ? { ...p, cut: { ok: false, reason: 'stale' } } : { ...p, cut: await cutoutUrl(p.thumb) }
      ));
      if (reqRef.current !== id) return;
      done.sort((a, b) => (Number(b.cut.ok) - Number(a.cut.ok)) || ((b.cut.score || 0) - (a.cut.score || 0)));
      setCands(done.slice(0, TRAY));
      setStatus(done.length ? 'ok' : 'error');
      if (!done.length) setNote('사진을 찾지 못했어요');
    } catch (e) {
      if (reqRef.current !== id) return;
      setStatus('error');
      setNote('사진을 가져오지 못했어요');
    }
  }

  function submit(e) {
    e.preventDefault();
    const entry = resolveFruit(text);
    if (!entry) {
      reqRef.current++;
      setFruit(null);
      setCands([]);
      setStatus('error');
      setNote('과일 이름을 써 주세요 (예: 사과, 배, 귤, 포도)');
      return;
    }
    runSearch(entry);
  }

  function chip(entry) {
    setText(entry.ko);
    runSearch(entry);
  }

  // 사진을 고르면 그 과일이 나무에 열려요
  function pick(c) {
    if (tree.length >= SLOTS.length) { say('나무가 가득 찼어요! 과일을 따 주세요 🧺'); return; }
    const used = new Set(tree.map((t) => t.slot));
    const free = SLOTS.map((_, i) => i).filter((i) => !used.has(i));
    const slot = free[Math.floor(Math.random() * free.length)];
    setTree((t) => [...t, {
      uid: ++uidRef.current, slot, name: fruit.ko, emoji: fruit.emoji, sprite: c.cut.ok ? c.cut.url : null, state: 'idle',
    }]);
    setPicked((p) => ({ ...p, [c.id]: (p[c.id] || 0) + 1 }));
    say(c.cut.ok ? `${fruit.ko}${iga(fruit.ko)} 나무에 열렸어요! 눌러서 따 보세요 👆` : `사진 배경이 복잡해서 귀여운 ${fruit.emoji} 로 달았어요. 눌러서 따 보세요 👆`);
  }

  // 과일을 누르면 바구니로 날아가고, 덕담이 나와요
  function harvest(f) {
    if (f.state === 'flying') return;
    const committed = basket.length + treeRef.current.filter((x) => x.state === 'flying').length; // 이미 담았거나 날아가는 중인 과일 수
    if (committed >= MAX_BASKETS * PER_BASKET) {
      say(`바구니 ${MAX_BASKETS}개가 모두 가득 찼어요! 🎉 '새로'를 눌러 다시 시작해요`);
      return;
    }
    const bi = Math.floor(committed / PER_BASKET); // 이 과일이 들어갈 바구니 번호
    const pos = basketLayout(Math.ceil((committed + 1) / PER_BASKET))[bi];
    const [sx, sy] = SLOTS[f.slot];
    setTree((t) => t.map((x) => (x.uid === f.uid ? { ...x, state: 'flying', bi, dx: pos.x - sx, dy: pos.y - sy } : x)));
    const burst = Array.from({ length: 6 }, (_, i) => {
      const ang = (i / 6) * Math.PI * 2 + Math.random();
      return { id: ++uidRef.current, x: sx, y: sy, dx: Math.cos(ang) * 34, dy: Math.sin(ang) * 34 };
    });
    setSparks((s) => [...s, ...burst]);
    setTimeout(() => setSparks((s) => s.filter((p) => !burst.includes(p))), 900);
    if (committed > 0 && committed % PER_BASKET === 0 && committed + 1 < MAX_BASKETS * PER_BASKET) say('바구니가 가득 찼어요! 새 바구니를 하나 더 꺼냈어요 🧺✨');
    else if (committed + 1 === MAX_BASKETS * PER_BASKET) say('마지막 바구니까지 가득 찼어요! 정말 대단해요 🎉');
    else say(BLESSINGS[Math.floor(Math.random() * BLESSINGS.length)]);
  }

  function landed(uid) {
    const f = treeRef.current.find((x) => x.uid === uid);
    if (!f) return;
    setTree((t) => t.filter((x) => x.uid !== uid));
    setBasket((b) => [...b, { uid, sprite: f.sprite, emoji: f.emoji, name: f.name, bi: f.bi }]);
  }

  function reset() {
    setTree([]);
    setBasket([]);
    setPicked({});
    say('새 나무를 심었어요 🌱');
  }

  // 보이는 바구니 수: 담았거나 날아가는 중인 과일 10개마다 하나 (최소 1개)
  const committedNow = basket.length + tree.filter((x) => x.state === 'flying').length;
  const shown = Math.min(MAX_BASKETS, Math.max(1, Math.ceil(committedNow / PER_BASKET)));
  const layout = basketLayout(shown);
  const baskets = Array.from({ length: shown }, (_, i) => basket.filter((b) => b.bi === i));

  return (
    <div className="p-tree">
      <div className="tphone">
        <header className="thead">
          <Link className="tback" to="/" aria-label="처음 화면으로 돌아가기">‹</Link>
          <h1>과일 나무 <span aria-hidden="true">🌳</span></h1>
          <button type="button" className="treset" onClick={reset} aria-label="새로 시작">🌱 새로</button>
        </header>

        <form className="tsearch" onSubmit={submit} role="search">
          <input
            type="search"
            list="fruit-names"
            value={text}
            maxLength={12}
            onChange={(e) => setText(e.target.value)}
            placeholder="과일 이름 (예: 사과, 배, 귤, 포도)"
            aria-label="과일 이름"
            enterKeyHint="search"
            autoComplete="off"
          />
          <datalist id="fruit-names">{FRUITS.map((f) => <option key={f.ko} value={f.ko} />)}</datalist>
          <button type="submit" aria-label="검색">🔍</button>
        </form>

        <div className="tchips" aria-label="과일 빠른 선택">
          {FRUITS.map((f) => (
            <button type="button" key={f.ko} className={fruit && fruit.ko === f.ko ? 'on' : ''} onClick={() => chip(f)}>
              <span aria-hidden="true">{f.emoji}</span> {f.ko}
            </button>
          ))}
        </div>

        {status !== 'idle' && (
          <section className="ttray" aria-label="추천 사진" aria-busy={status === 'loading'}>
            {status === 'loading' && (
              <>
                <p className="thint">‘{fruit && fruit.ko}’ 사진을 찾아 과일을 오려내는 중이에요… ✂️</p>
                <div className="tgrid">{Array.from({ length: TRAY }, (_, i) => <div className="cand sk" key={i} />)}</div>
              </>
            )}
            {status === 'error' && <p className="tnote" role="alert">{note}</p>}
            {status === 'ok' && (
              <>
                <p className="thint">사진을 누르면 그 과일이 나무에 열려요 · ✂ 은 배경을 지운 사진</p>
                <div className="tgrid">
                  {cands.map((c, i) => (
                    <button
                      type="button"
                      className="cand"
                      key={c.id}
                      onClick={() => pick(c)}
                      aria-label={`${fruit.ko} 사진 ${i + 1}번 나무에 달기`}
                    >
                      <img src={c.thumb} alt={c.tags.join(', ') || fruit.ko} loading="lazy" />
                      {c.cut.ok && <span className="scissor" aria-hidden="true">✂</span>}
                      {picked[c.id] > 0 && <span className="done" aria-hidden="true">🌳{picked[c.id] > 1 ? picked[c.id] : ''}</span>}
                    </button>
                  ))}
                </div>
                <p className="tcredit">사진 출처: <a href="https://pixabay.com" target="_blank" rel="noopener noreferrer">Pixabay</a></p>
              </>
            )}
          </section>
        )}

        <div className="tstage">
          {toast && <p className="ttoast" key={toast.id} role="status" aria-live="polite">{toast.text}</p>}
          <svg className="tsvg" viewBox="0 0 320 400" preserveAspectRatio="xMidYMax meet" role="group" aria-label="과일 나무">
            <defs>
              <linearGradient id="tsky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#dff3ff" />
                <stop offset="1" stopColor="#fff7e6" />
              </linearGradient>
            </defs>
            <rect width="320" height="400" fill="url(#tsky)" />
            <circle cx="40" cy="44" r="32" fill="#ffd45a" opacity=".28" />
            <circle cx="40" cy="44" r="21" fill="#ffd45a" />
            <g fill="#fff" opacity=".92">
              <ellipse cx="252" cy="38" rx="30" ry="12" />
              <ellipse cx="272" cy="32" rx="20" ry="12" />
              <ellipse cx="228" cy="36" rx="18" ry="9" />
            </g>
            <rect x="0" y="372" width="320" height="28" fill="#a8dc82" />
            <ellipse cx="160" cy="376" rx="175" ry="26" fill="#a8dc82" />
            <path d="M142 236 C146 290 140 340 126 380 L194 380 C182 340 176 290 180 236 Z" fill="#a8693a" />
            <path d="M158 250 C160 300 156 340 148 376" stroke="#c98a55" strokeWidth="5" fill="none" strokeLinecap="round" opacity=".7" />
            <g aria-hidden="true">
              <circle cx="146" cy="304" r="3.2" fill="#3b2a20" />
              <circle cx="168" cy="304" r="3.2" fill="#3b2a20" />
              <ellipse cx="138" cy="312" rx="5" ry="3" fill="#ff8fa3" opacity=".6" />
              <ellipse cx="176" cy="312" rx="5" ry="3" fill="#ff8fa3" opacity=".6" />
              <path d="M150 312 Q157 320 164 312" stroke="#3b2a20" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            </g>
            <g>
              <circle cx="160" cy="128" r="80" fill="#4fb85a" />
              <circle cx="95" cy="166" r="58" fill="#5cc366" />
              <circle cx="225" cy="166" r="58" fill="#5cc366" />
              <circle cx="120" cy="92" r="52" fill="#66cc70" />
              <circle cx="200" cy="92" r="52" fill="#66cc70" />
              <circle cx="160" cy="202" r="54" fill="#58c062" />
              <g fill="#9be6a0" opacity=".55">
                <circle cx="132" cy="72" r="18" />
                <circle cx="206" cy="118" r="13" />
                <circle cx="88" cy="150" r="12" />
                <circle cx="168" cy="214" r="12" />
              </g>
            </g>

            {tree.map((f) => <Fruit key={f.uid} f={f} onHarvest={harvest} onLanded={landed} />)}
            {sparks.map((s) => (
              <text key={s.id} className="spark" x={s.x} y={s.y} fontSize="16" textAnchor="middle" style={{ '--dx': `${s.dx}px`, '--dy': `${s.dy}px` }}>✨</text>
            ))}

            {baskets.map((items, i) => <Basket key={i} items={items} pos={layout[i]} index={i} />)}
          </svg>
        </div>
      </div>
    </div>
  );
}
