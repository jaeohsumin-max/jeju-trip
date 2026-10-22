import { useEffect, useRef, useState } from 'react';
import './Photos.css';

// 제주 사진 화면: 주제 탭을 고르거나, 🔍 돋보기 검색창에 원하는 말을 써서 /api/photos 로 Pixabay 사진을 찾아요.
// 사진을 누르면 크게 보여 줘요 (좌우 넘기기, 스와이프, ← → 키, Esc 닫기).
const TOPICS = [
  { name: '돌하르방', icon: '🗿' },
  { name: '감귤', icon: '🍊' },
  { name: '한라봉', icon: '🍋' },
  { name: '흑돼지', icon: '🐖' },
  { name: '갈치', icon: '🐟' },
];
const MAX_QUERY = 40;

// Pixabay 주소만 화면에 써요 (서버가 한 번 거르지만 여기서도 한 번 더)
function safeUrl(u) {
  try {
    const x = new URL(String(u));
    return x.protocol === 'https:' && (x.hostname === 'pixabay.com' || x.hostname.endsWith('.pixabay.com')) ? x.href : '';
  } catch (e) {
    return '';
  }
}

// mode: { kind: 'topic' | 'q', value }  →  결과 { status: 'ok' | 'error', photos | note }
async function loadPhotos(mode) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const url = '/api/photos?' + (mode.kind === 'q' ? 'q=' : 'topic=') + encodeURIComponent(mode.value);
    const r = await fetch(url, { signal: ctl.signal });
    const d = await r.json();
    if (!d || !d.ok || !Array.isArray(d.photos)) return { status: 'error', note: (d && d.note) || '사진을 가져오지 못했어요' };
    const photos = d.photos
      .map((p) => ({ ...p, thumb: safeUrl(p.thumb), view: safeUrl(p.view), pageUrl: safeUrl(p.pageUrl), tags: Array.isArray(p.tags) ? p.tags : [] }))
      .filter((p) => p.thumb && p.view && p.pageUrl);
    return photos.length ? { status: 'ok', photos } : { status: 'error', note: '사진을 찾지 못했어요' };
  } catch (e) {
    return { status: 'error', note: '사진을 가져오지 못했어요' };
  } finally {
    clearTimeout(timer);
  }
}

// 목록의 사진 한 장 (불러오는 동안은 반짝이는 자리, 다 오면 부드럽게 나타나요)
function Tile({ photo, label, onOpen, onBad }) {
  const [loaded, setLoaded] = useState(false);
  const alt = photo.tags.length ? photo.tags.join(', ') : label + ' 사진';
  return (
    <button type="button" className={'ps-tile' + (loaded ? ' on' : '')} onClick={onOpen} aria-label={'사진 크게 보기: ' + alt}>
      <img src={photo.thumb} alt={alt} loading="lazy" onLoad={() => setLoaded(true)} onError={() => onBad(photo.id)} />
    </button>
  );
}

export default function PhotoSheet({ onClose }) {
  const [mode, setMode] = useState({ kind: 'topic', value: TOPICS[0].name });
  const [text, setText] = useState(''); // 검색창에 쓴 글
  const [data, setData] = useState({}); // 키 → { status, photos, note }
  const [bad, setBad] = useState({}); // 키 → 불러오지 못한 사진 id 목록 (사진 주소가 만료됐을 때 등)
  const [viewer, setViewer] = useState(-1);
  const [tries, setTries] = useState(0); // '다시 시도'를 누르면 올라가요
  const closeRef = useRef(null);
  const inputRef = useRef(null);
  const touchX = useRef(null);

  const key = mode.kind + ':' + mode.value;
  const cur = data[key] || { status: 'loading' };
  const badIds = bad[key] || [];
  const photos = cur.status === 'ok' ? cur.photos.filter((x) => !badIds.includes(x.id)) : [];
  const allBad = cur.status === 'ok' && photos.length === 0; // 받은 사진이 전부 안 열릴 때
  const markBad = (id) => setBad((b) => (b[key] && b[key].includes(id) ? b : { ...b, [key]: [...(b[key] || []), id] }));
  const retry = () => {
    setBad((b) => ({ ...b, [key]: [] }));
    setData((d) => ({ ...d, [key]: { status: 'loading' } }));
    setTries((n) => n + 1);
  };

  useEffect(() => {
    if (data[key] && data[key].status === 'ok') return undefined; // 이미 받은 것은 다시 안 받아요
    let dead = false;
    setData((d) => ({ ...d, [key]: { status: 'loading' } }));
    loadPhotos(mode).then((r) => { if (!dead) setData((d) => ({ ...d, [key]: r })); });
    return () => { dead = true; };
  }, [key, tries]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { closeRef.current && closeRef.current.focus(); }, []);

  const go = (step) => setViewer((i) => (i < 0 || !photos.length ? i : (i + step + photos.length) % photos.length));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (viewer >= 0) setViewer(-1);
        else onClose();
      } else if (viewer >= 0 && e.key === 'ArrowLeft') go(-1);
      else if (viewer >= 0 && e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function search(e) {
    e.preventDefault();
    const v = text.trim().replace(/\s+/g, ' ');
    if (!v) { inputRef.current && inputRef.current.focus(); return; }
    setMode({ kind: 'q', value: v });
    setViewer(-1);
  }

  const p = viewer >= 0 ? photos[viewer] || null : null;
  const label = mode.value;

  return (
    <div className="ps" role="dialog" aria-modal="true" aria-label="제주 사진">
      <div className="ps-head">
        <h2>제주 사진 <span aria-hidden="true">📷</span></h2>
        <button type="button" className="ps-x" onClick={onClose} ref={closeRef} aria-label="사진 화면 닫기">✕</button>
      </div>

      <form className="ps-search" onSubmit={search} role="search">
        <input
          ref={inputRef}
          type="search"
          value={text}
          maxLength={MAX_QUERY}
          onChange={(e) => setText(e.target.value)}
          placeholder="사진 검색 (예: 한라산, 해녀, tangerine)"
          aria-label="사진 검색어"
          enterKeyHint="search"
          autoComplete="off"
        />
        <button type="submit" aria-label="검색">🔍</button>
      </form>

      <div className="ps-tabs" role="tablist" aria-label="사진 주제">
        {TOPICS.map((t) => {
          const on = mode.kind === 'topic' && mode.value === t.name;
          return (
            <button
              key={t.name}
              type="button"
              role="tab"
              aria-selected={on}
              className={'ps-tab' + (on ? ' on' : '')}
              onClick={() => { setMode({ kind: 'topic', value: t.name }); setViewer(-1); }}
            >
              <span aria-hidden="true">{t.icon}</span> {t.name}
            </button>
          );
        })}
      </div>

      <div className="ps-body">
        <p className="ps-hint">
          {mode.kind === 'q' ? <>‘<b>{mode.value}</b>’ 검색 결과예요. </> : null}
          Pixabay 검색 결과라서 제주에서 찍은 사진이 아닌 것도 섞여 있을 수 있어요.
        </p>
        {cur.status === 'loading' && (
          <div className="ps-grid" aria-busy="true" aria-label="사진을 불러오는 중">
            {Array.from({ length: 6 }, (_, i) => <div className="ps-tile sk" key={i} />)}
          </div>
        )}
        {(cur.status === 'error' || allBad) && (
          <div className="ps-empty">
            <p>{allBad ? '사진을 불러오지 못했어요' : cur.note}</p>
            <button type="button" onClick={retry}>다시 시도</button>
          </div>
        )}
        {cur.status === 'ok' && !allBad && (
          <div className="ps-grid">
            {photos.map((ph, i) => <Tile key={ph.id} photo={ph} label={label} onOpen={() => setViewer(i)} onBad={markBad} />)}
          </div>
        )}
        <p className="ps-credit">사진 출처: <a href="https://pixabay.com" target="_blank" rel="noopener noreferrer">Pixabay</a></p>
      </div>

      {p && (
        <div className="ps-viewer" role="dialog" aria-modal="true" aria-label="사진 크게 보기" onClick={() => setViewer(-1)}>
          <button type="button" className="ps-x v" onClick={() => setViewer(-1)} aria-label="크게 보기 닫기">✕</button>
          <span className="ps-count">{viewer + 1} / {photos.length}</span>
          <figure
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              if (touchX.current === null) return;
              const dx = e.changedTouches[0].clientX - touchX.current;
              touchX.current = null;
              if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
            }}
          >
            <img
              key={p.id}
              src={p.view}
              alt={p.tags.join(', ') || label + ' 사진'}
              onError={(e) => { if (e.currentTarget.src !== p.thumb) e.currentTarget.src = p.thumb; }}
            />
            <figcaption>
              {p.tags.length > 0 && <span className="ps-tags">{p.tags.map((t) => <span key={t}>#{t}</span>)}</span>}
              <a href={p.pageUrl} target="_blank" rel="noopener noreferrer">📷 {p.user || 'Pixabay'} · Pixabay</a>
            </figcaption>
          </figure>
          {photos.length > 1 && (
            <>
              <button type="button" className="ps-nav prev" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="이전 사진">‹</button>
              <button type="button" className="ps-nav next" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="다음 사진">›</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
