import { Link } from 'react-router-dom';
import { useTitle } from '../lib.js';
import './Landing.css';

const ASKS = [
  { ico: '🌤️', title: '지금 오름 날씨', text: '가려는 오름의 날씨를 찾아보고, 지금 가도 괜찮은지 알려 드려요.', ask: '“현재 오름 날씨 알려 주세요”' },
  { ico: '☔', title: '비 오는 날 가도 되는 오름', text: '비나 바람이 있는 날에도 비교적 안전하게 다녀올 수 있는 오름을 골라 드려요.', ask: '“비 와도 괜찮은 오름은요?”' },
  { ico: '🕒', title: '가기 좋은 시간', text: '날씨와 걷는 시간을 보고, 언제 가면 좋을지 시간대를 추천해 드려요.', ask: '“몇 시에 가면 좋을까요?”' },
];

const STEPS = [
  { b: '묻기', t: '궁금한 걸 편하게 말해 주세요.' },
  { b: '찾아보고 판단', t: '날씨와 오름 정보를 찾아보고, 가도 괜찮은지 따져 봐요.' },
  { b: '추천 받기', t: '이유 한 줄과 함께 한 가지씩 추천해 드려요.' },
];

export default function Landing() {
  useTitle('제주 오름이 | 오름이 궁금할 때 물어보세요');
  return (
    <div className="p-landing">
      <header className="hero">
        <div className="wrap">
          <img className="logo" src="/images/logo.svg" alt="제주 오름이 로고: 오름 위로 떠오른 선글라스 쓴 햇살" />
          <h1><span>제주 오름이</span></h1>
          <p className="promise">제주 여행하는 사람들에게 오름에 대해 궁금한 것을 제대로 답해 주는 AI</p>
          <Link className="btn" to="/agent">지금 물어보기</Link>
          <Link className="sublink" to="/profile">내 여행 취향 알려 주기</Link>
        </div>
      </header>

      <section>
        <div className="wrap">
          <h2>이런 걸 물어볼 수 있어요</h2>
          <p className="lead">오름에 가기 전에, 또는 오름 앞에서 편하게 물어보세요.</p>
          <div className="cards">
            {ASKS.map((a) => (
              <div className="card" key={a.title}>
                <div className="ico">{a.ico}</div>
                <h3>{a.title}</h3>
                <p>{a.text}</p>
                <span className="ask">{a.ask}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="how">
        <div className="wrap">
          <h2>이렇게 써요</h2>
          <p className="lead">세 단계면 돼요.</p>
          <ol className="steps">
            {STEPS.map((s) => (
              <li key={s.b}><div><b>{s.b}</b><span>{s.t}</span></div></li>
            ))}
          </ol>
        </div>
      </section>

      <section className="end">
        <div className="wrap">
          <h2>오름이 궁금하세요?</h2>
          <p className="lead">궁금한 걸 지금 바로 물어보세요.</p>
          <Link className="btn" to="/agent">지금 물어보기</Link>
          <p className="small">아직 연습 중인 에이전트예요</p>
        </div>
      </section>

      <footer>© 제주 오름이</footer>
    </div>
  );
}
