// 내 컴퓨터에서 /api/* 를 시험하는 작은 서버 (vercel dev 대신). 사용: npm run dev:api  → http://localhost:3100
// api 폴더의 함수를 그대로 불러요. 열쇠는 .env 의 GEMINI_API_KEY=값 에서만 읽고, 출력하지 않아요.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
try {
  const raw = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (e) {
  /* .env 가 없으면 연습 모드로 동작해요 */
}

const PORT = Number(process.env.API_PORT) || 3100;

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const m = u.pathname.match(/^\/api\/([a-z]+)$/); // _ 로 시작하는 도구 파일은 열지 않아요
  const file = m && path.join(ROOT, 'api', m[1] + '.js');
  if (!file || !fs.existsSync(file)) {
    res.statusCode = 404;
    return res.end();
  }
  let data = '';
  req.on('data', (c) => (data += c));
  req.on('end', async () => {
    try { req.body = data ? JSON.parse(data) : {}; } catch (e) { req.body = {}; }
    req.query = Object.fromEntries(u.searchParams);
    res.status = (s) => { res.statusCode = s; return res; };
    res.json = (b) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(b)); };
    try {
      await require(file)(req, res);
    } catch (e) {
      console.error('api failed: ' + String((e && e.name) || 'Error'));
      if (!res.headersSent) { res.statusCode = 500; res.end(); }
    }
  });
}).listen(PORT, () => console.log('api on http://localhost:' + PORT));
