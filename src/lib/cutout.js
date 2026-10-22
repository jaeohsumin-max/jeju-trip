// 사진에서 과일만 오려내기 (브라우저 안에서, 따로 내려받는 도구 없이)
// 방법: 사진 가장자리 색을 '배경색'으로 보고, 가장자리에서 안쪽으로 번지는 같은 색을 지워요.
//       배경이 단색(흰색·검은색 등)인 스튜디오 사진에서 잘 되고, 배경이 복잡하면 실패로 알려 줘요.
// 결과는 하얀 테두리가 둘린 스티커 모양의 투명 PNG(데이터 주소)예요.

const WORK = 240; // 처리할 때 사진의 긴 변 크기
const OUT = 128; // 만들어 내는 그림의 긴 변 크기
const PAD = 6; // 스티커 테두리 여유
const TOL = 40; // 배경색과 이 정도(RGB 거리)까지 비슷하면 배경으로 봐요

export function loadImage(url, ms = 12000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // 사진 서버가 허락해서(CORS) 브라우저가 픽셀을 읽을 수 있어요
    const t = setTimeout(() => { img.src = ''; reject(new Error('timeout')); }, ms);
    img.onload = () => { clearTimeout(t); resolve(img); };
    img.onerror = () => { clearTimeout(t); reject(new Error('load')); };
    img.src = url;
  });
}

const median = (arr) => {
  const s = Float64Array.from(arr).sort();
  return s[s.length >> 1];
};

// 이미 불러온 사진에서 과일 오려내기 → { ok, url?, score?, reason? }
export function cutoutFromImage(img) {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh) return { ok: false, reason: 'size' };
  const s = Math.min(1, WORK / Math.max(nw, nh));
  const w = Math.max(16, Math.round(nw * s));
  const h = Math.max(16, Math.round(nh * s));
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  let src;
  try {
    src = ctx.getImageData(0, 0, w, h);
  } catch (e) {
    return { ok: false, reason: 'cors' };
  }
  const d = src.data;
  const N = w * h;

  // 1) 가장자리(바깥 2칸) 색의 중앙값 = 배경색. 가장자리가 고르지 않으면 배경이 복잡한 사진이에요.
  const border = [];
  for (let x = 0; x < w; x++) for (const y of [0, 1, h - 2, h - 1]) border.push(y * w + x);
  for (let y = 2; y < h - 2; y++) for (const x of [0, 1, w - 2, w - 1]) border.push(y * w + x);
  const br = median(border.map((p) => d[p * 4]));
  const bgc = median(border.map((p) => d[p * 4 + 1]));
  const bb = median(border.map((p) => d[p * 4 + 2]));
  const near = (p) => {
    const i = p * 4;
    const dr = d[i] - br;
    const dg = d[i + 1] - bgc;
    const db = d[i + 2] - bb;
    return dr * dr + dg * dg + db * db < TOL * TOL;
  };
  const borderNear = border.filter(near).length / border.length;
  if (borderNear < 0.85) return { ok: false, reason: 'busy' };

  // 2) 가장자리에서 시작해 배경색이 이어지는 곳을 배경으로 칠해요 (안쪽의 하이라이트는 남아요)
  const bg = new Uint8Array(N);
  const stack = new Int32Array(N);
  let sp = 0;
  for (const p of border) {
    if (!bg[p] && near(p)) { bg[p] = 1; stack[sp++] = p; }
  }
  while (sp) {
    const p = stack[--sp];
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0 && !bg[p - 1] && near(p - 1)) { bg[p - 1] = 1; stack[sp++] = p - 1; }
    if (x < w - 1 && !bg[p + 1] && near(p + 1)) { bg[p + 1] = 1; stack[sp++] = p + 1; }
    if (y > 0 && !bg[p - w] && near(p - w)) { bg[p - w] = 1; stack[sp++] = p - w; }
    if (y < h - 1 && !bg[p + w] && near(p + w)) { bg[p + w] = 1; stack[sp++] = p + w; }
  }

  // 3) 남은 덩어리 중 가장 큰 것(과일)과, 그 4% 이상인 덩어리(잎·꼭지)만 남겨요
  const label = new Int32Array(N).fill(-1);
  const areas = [];
  for (let start = 0; start < N; start++) {
    if (bg[start] || label[start] !== -1) continue;
    const id = areas.length;
    let area = 0;
    label[start] = id;
    stack[0] = start;
    sp = 1;
    while (sp) {
      const p = stack[--sp];
      area++;
      const x = p % w;
      const y = (p / w) | 0;
      if (x > 0 && !bg[p - 1] && label[p - 1] === -1) { label[p - 1] = id; stack[sp++] = p - 1; }
      if (x < w - 1 && !bg[p + 1] && label[p + 1] === -1) { label[p + 1] = id; stack[sp++] = p + 1; }
      if (y > 0 && !bg[p - w] && label[p - w] === -1) { label[p - w] = id; stack[sp++] = p - w; }
      if (y < h - 1 && !bg[p + w] && label[p + w] === -1) { label[p + w] = id; stack[sp++] = p + w; }
    }
    areas.push(area);
  }
  if (!areas.length) return { ok: false, reason: 'empty' };
  const maxArea = Math.max(...areas);
  const keepId = new Set(areas.map((a, i) => (a >= maxArea * 0.04 ? i : -1)).filter((i) => i >= 0));
  const sorted = [...areas].sort((a, b) => b - a);
  const secondRatio = sorted.length > 1 ? sorted[1] / sorted[0] : 0;

  // 4) 모양 점검: 너무 작거나 크거나, 사진 가장자리에 잘렸거나, 속이 성긴 덩어리는 실패로 봐요
  const keep = new Uint8Array(N);
  let fg = 0;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let p = 0; p < N; p++) {
    if (label[p] >= 0 && keepId.has(label[p])) {
      keep[p] = 1;
      fg++;
      const x = p % w;
      const y = (p / w) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const fgFraction = fg / N;
  const fillRatio = fg / (bw * bh);
  const touches = (minX <= 1) + (minY <= 1) + (maxX >= w - 2) + (maxY >= h - 2);
  if (fgFraction < 0.06) return { ok: false, reason: 'small' };
  if (fgFraction > 0.85) return { ok: false, reason: 'large' };
  if (fillRatio < 0.4) return { ok: false, reason: 'sparse' };
  if (touches >= 2) return { ok: false, reason: 'cropped' };
  const aspect = bw / bh;
  const score = 0.5 * fillRatio
    + 0.3 * (1 - Math.min(1, Math.abs(Math.log(aspect))))
    + 0.2 * (fgFraction >= 0.12 && fgFraction <= 0.6 ? 1 : 0.4)
    - (secondRatio > 0.25 ? 0.15 : 0); // 같은 크기의 과일이 여러 개면 한 개짜리보다 낮게

  // 5) 가장자리 다듬기: 1칸 깎고(배경색 테두리 제거) 3x3 평균으로 부드럽게
  const eroded = new Uint8Array(N);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!keep[p]) continue;
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || !keep[p - 1] || !keep[p + 1] || !keep[p - w] || !keep[p + w];
      eroded[p] = edge ? 0 : 255;
    }
  }
  const out = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h) sum += eroded[yy * w + xx];
        }
      }
      const p = y * w + x;
      out.data[p * 4] = d[p * 4];
      out.data[p * 4 + 1] = d[p * 4 + 1];
      out.data[p * 4 + 2] = d[p * 4 + 2];
      out.data[p * 4 + 3] = Math.round(sum / 9);
    }
  }
  const cut = document.createElement('canvas');
  cut.width = w;
  cut.height = h;
  cut.getContext('2d').putImageData(out, 0, 0);

  // 6) 과일 부분만 잘라 크기를 맞추고, 하얀 테두리(스티커)와 살짝 그림자를 둘러요
  const sc = Math.min(1.2, (OUT - 2 * PAD) / Math.max(bw, bh));
  const cw = Math.round(bw * sc) + 2 * PAD;
  const chh = Math.round(bh * sc) + 2 * PAD;
  const fruit = document.createElement('canvas');
  fruit.width = cw;
  fruit.height = chh;
  fruit.getContext('2d').drawImage(cut, minX, minY, bw, bh, PAD, PAD, Math.round(bw * sc), Math.round(bh * sc));
  const sil = document.createElement('canvas'); // 하얀 실루엣
  sil.width = cw;
  sil.height = chh;
  const sctx = sil.getContext('2d');
  sctx.drawImage(fruit, 0, 0);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = '#fff';
  sctx.fillRect(0, 0, cw, chh);
  const fin = document.createElement('canvas');
  fin.width = cw;
  fin.height = chh;
  const fctx = fin.getContext('2d');
  fctx.shadowColor = 'rgba(0,0,0,0.25)';
  fctx.shadowBlur = 4;
  fctx.shadowOffsetY = 2;
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    fctx.drawImage(sil, Math.cos(ang) * 3, Math.sin(ang) * 3);
  }
  fctx.shadowColor = 'transparent';
  fctx.drawImage(fruit, 0, 0);
  return { ok: true, url: fin.toDataURL('image/png'), score, w: cw, h: chh, fillRatio, fgFraction };
}

// 주소로 사진을 불러와 오려내기. 불러오기나 처리가 실패해도 던지지 않고 { ok:false } 로 알려 줘요.
export async function cutoutUrl(url) {
  try {
    return cutoutFromImage(await loadImage(url));
  } catch (e) {
    return { ok: false, reason: 'load' };
  }
}
