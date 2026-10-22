import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTitle, PROFILE_KEY } from '../lib.js';
import './Profile.css';

const TABS = [
  { key: 'style', label: '스타일', title: '어떤 여행을 좋아하세요?', hint: '마음에 드는 걸 여러 개 골라도 돼요.', multi: true,
    opts: [['바다', '🌊'], ['숲', '🌲'], ['오름', '⛰️'], ['시장', '🍊'], ['박물관', '🏛️']] },
  { key: 'pace', label: '속도', title: '어떤 속도가 편하세요?', hint: '하나만 골라 주세요.',
    opts: [['느긋하게', '🐢'], ['보통', '🚶'], ['빡빡하게', '🏃']] },
  { key: 'with', label: '같이 가는 사람', title: '누구와 함께 가세요?', hint: '하나만 골라 주세요.',
    opts: [['혼자', '🙂'], ['친구', '👫'], ['가족', '👨‍👩‍👧'], ['아이와', '🧒']] },
];

// 이 브라우저의 localStorage 에서 읽기 (못 읽으면 빈 상태로 시작)
function loadProfile() {
  const empty = { style: [], pace: '', with: '' };
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return empty;
    const d = JSON.parse(raw);
    return {
      style: Array.isArray(d.style) ? d.style.filter((x) => typeof x === 'string') : [],
      pace: typeof d.pace === 'string' ? d.pace : '',
      with: typeof d.with === 'string' ? d.with : '',
    };
  } catch (e) {
    return empty;
  }
}

// my_profile.json 파일로 내 기기에 내려받기 (서버로는 보내지 않아요)
function downloadJson(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'my_profile.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function Profile() {
  useTitle('내 여행 취향 | 제주 오름이');
  const [data, setData] = useState(loadProfile);
  const [tab, setTab] = useState('style');
  const [msg, setMsg] = useState(null); // { text, cls, sub }
  const tabRefs = useRef({});

  const has = (k) => (k === 'style' ? data.style.length > 0 : !!data[k]);

  function showTab(key, focus) {
    setTab(key);
    if (focus) tabRefs.current[key]?.focus();
  }
  function onTabKey(e, i) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const n = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
      showTab(TABS[n].key, true);
      e.preventDefault();
    }
  }
  // 값을 바꾸면 "저장했어요" 문구는 지워요 (아직 저장 전이니까요)
  function pick(t, value) {
    setMsg(null);
    setData((d) => {
      if (t.multi) {
        const on = d[t.key].includes(value);
        return { ...d, [t.key]: on ? d[t.key].filter((v) => v !== value) : [...d[t.key], value] };
      }
      return { ...d, [t.key]: value };
    });
  }

  function save() {
    let stored = true;
    let filed = true;
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(data)); } catch (e) { stored = false; }
    try { downloadJson(data); } catch (e) { filed = false; }
    if (stored && filed) setMsg({ text: '저장했어요', cls: 'ok', sub: 'my_profile.json 파일도 내 기기에 내려받았어요.' });
    else if (stored) setMsg({ text: '저장했어요', cls: 'ok', sub: '파일은 내려받지 못했어요.' });
    else if (filed) setMsg({ text: '파일로만 저장했어요', cls: 'ok', sub: '이 브라우저에는 저장할 수 없어서, 다시 열면 선택이 비어 있어요.' });
    else setMsg({ text: '저장하지 못했어요', cls: 'err', sub: '시크릿 창이거나 저장이 막혀 있을 수 있어요.' });
  }

  return (
    <div className="p-profile">
      <div className="app">
        <header>
          <Link className="back" to="/" aria-label="처음 화면으로 돌아가기">
            <span aria-hidden="true">‹</span><img src="/images/logo.svg" alt="" />
          </Link>
          <h1>내 여행 취향</h1>
          <p>알려 주시면 취향에 맞게 추천해 드릴게요.</p>
        </header>

        <div className="tabs" role="tablist" aria-label="여행 취향">
          {TABS.map((t, i) => (
            <button
              key={t.key}
              ref={(el) => { tabRefs.current[t.key] = el; }}
              className={'tab' + (has(t.key) ? ' has' : '')}
              role="tab"
              id={'tab-' + t.key}
              aria-controls={'panel-' + t.key}
              aria-selected={tab === t.key}
              tabIndex={tab === t.key ? 0 : -1}
              onClick={() => showTab(t.key)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {t.label}<span className="done" aria-hidden="true">✓</span>
            </button>
          ))}
        </div>

        <main>
          {TABS.map((t) => (
            <section key={t.key} className="panel" id={'panel-' + t.key} role="tabpanel" aria-labelledby={'tab-' + t.key} hidden={tab !== t.key}>
              <h2>{t.title}</h2>
              <p className="hint">{t.hint}</p>
              <div className="opts">
                {t.opts.map(([value, emoji]) => (
                  <label className="opt" key={value}>
                    <input
                      type={t.multi ? 'checkbox' : 'radio'}
                      name={t.key}
                      value={value}
                      checked={t.multi ? data.style.includes(value) : data[t.key] === value}
                      onChange={() => pick(t, value)}
                    />
                    <span><i className="emoji" aria-hidden="true">{emoji}</i>{value}<i className="mark" aria-hidden="true">✓</i></span>
                  </label>
                ))}
              </div>
            </section>
          ))}
        </main>

        <div className="save-bar">
          <button className="save" type="button" onClick={save}>저장</button>
          <p id="msg" className={msg ? msg.cls : ''} role="status" aria-live="polite">
            {msg && msg.text}
            {msg && msg.sub && <span className="sub">{msg.sub}</span>}
          </p>
          <p className="note">이 기기(이 브라우저)에만 저장되고, my_profile.json 파일로도 내려받아요. 이름이나 전화번호는 받지 않아요.</p>
        </div>
      </div>
    </div>
  );
}
