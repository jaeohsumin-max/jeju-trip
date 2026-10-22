import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTitle } from '../lib.js';
import './ToolsTest.css';

const INDOOR_LABEL = { '': '전체', true: '실내', false: '야외' };

export default function ToolsTest() {
  useTitle('find_spots 시험');
  const [area, setArea] = useState('동쪽');
  const [indoor, setIndoor] = useState('');
  const [status, setStatus] = useState({ text: '', err: false });
  const [spots, setSpots] = useState([]);

  async function run(e) {
    e.preventDefault();
    setStatus({ text: '찾는 중…', err: false });
    setSpots([]);
    const qs = new URLSearchParams({ area });
    if (indoor) qs.set('indoor', indoor);
    try {
      const r = await fetch('/api/tools?' + qs);
      const d = await r.json();
      if (!r.ok || d.error) {
        setStatus({ text: '오류: ' + (d.error || r.status), err: true });
        return;
      }
      setSpots(d.spots);
      setStatus({
        text: area + ' · ' + INDOOR_LABEL[indoor === '' ? '' : indoor === 'true'] + ' → ' + d.count + '곳' +
          (d.truncated ? ' (8곳까지만 보여 줘요)' : '') + (d.count ? '' : ' — 목록에 없어요'),
        err: false,
      });
    } catch (err) {
      setStatus({ text: '불러오지 못했어요. 서버가 켜져 있는지 확인해 주세요.', err: true });
    }
  }

  return (
    <div className="p-tools">
      <main>
        <Link className="home" to="/">← 메인으로</Link>
        <h1>find_spots 시험</h1>
        <p className="sub">지역과 실내 여부를 고르면 <code>/api/tools</code> 의 find_spots 를 그대로 불러서 결과를 표로 보여 줘요.</p>
        <form onSubmit={run}>
          <label>지역
            <select value={area} onChange={(e) => setArea(e.target.value)}>
              <option>동쪽</option><option>서쪽</option><option>서귀포</option><option>제주시</option>
            </select>
          </label>
          <label>실내 여부
            <select value={indoor} onChange={(e) => setIndoor(e.target.value)}>
              <option value="">전체 (생략)</option><option value="true">실내만</option><option value="false">야외만</option>
            </select>
          </label>
          <button type="submit">찾기</button>
        </form>
        <p id="status" className={status.err ? 'err' : ''} role="status">{status.text}</p>
        <div className="wrap">
          {spots.length > 0 && (
            <table>
              <thead><tr><th>이름</th><th>지역</th><th>실내 여부</th><th>설명</th></tr></thead>
              <tbody>
                {spots.map((s) => (
                  <tr key={s.name}>
                    <td>{s.name}</td><td>{s.area}</td><td>{s.indoor ? '실내' : '야외'}</td><td>{s.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
