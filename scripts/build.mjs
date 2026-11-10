#!/usr/bin/env node
// GitHub 프로필 SVG 생성기
// - 글자는 전부 path로 바꿔 넣는다 (GitHub는 SVG 안 웹폰트를 못 불러오므로 어디서나 똑같이 보이게)
// - 움직임은 SVG 안 CSS keyframes, prefers-reduced-motion 이면 전부 정지
// - 같은 레이아웃을 라이트/다크 팔레트로 두 벌 출력: assets/<name>.svg, assets/<name>-dark.svg
// 실행: npm install && npm run build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import wawoff2 from 'wawoff2';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NM = path.join(ROOT, 'node_modules');
const OUT = path.join(ROOT, 'assets');
fs.mkdirSync(OUT, { recursive: true });

/* ───────────────────────── fonts ───────────────────────── */
const pret = (w) => opentype.loadSync(path.join(NM, 'pretendard/dist/public/static', `Pretendard-${w}.otf`));
async function jb(w) {
  const buf = fs.readFileSync(path.join(NM, 'jetbrains-mono/fonts/webfonts', `JetBrainsMonoNL-${w}.woff2`));
  const ttf = await wawoff2.decompress(buf);
  return opentype.parse(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength));
}
const FONTS = {
  sans: { 400: pret('Regular'), 500: pret('Medium'), 600: pret('SemiBold'), 700: pret('Bold'), 800: pret('ExtraBold') },
  mono: { 400: await jb('Regular'), 500: await jb('Medium'), 700: await jb('Bold'), 800: await jb('ExtraBold') },
};
const near = (set, w) => set[Object.keys(set).map(Number).reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a))];
const SANS_SET = new Set(Object.values(FONTS.sans));

/* ───────────────────────── text → path ───────────────────────── */
function shape(str, o = {}) {
  const { family = 'sans', weight = 400, size = 16, ls = 0 } = o;
  const prim = near(FONTS[family], weight);
  const fb = near(FONTS.sans, family === 'mono' ? Math.min(weight, 600) : weight); // 모노에 한글이 없으면 Pretendard로
  const glyphs = [];
  let x = 0;
  let prev = null;
  for (const ch of Array.from(str)) {
    let font = prim;
    let g = font.charToGlyph(ch);
    if (!g || g.index === 0) { font = fb; g = font.charToGlyph(ch); }
    const k = size / font.unitsPerEm;
    if (prev && prev.font === font && SANS_SET.has(font)) x += font.getKerningValue(prev.g, g) * k;
    glyphs.push({ ch, font, g, x, k });
    x += g.advanceWidth * k + ls;
    prev = { font, g };
  }
  return { glyphs, width: glyphs.length ? x - ls : 0 };
}
const measure = (str, o) => shape(str, o).width;
const r1 = (n) => Math.round(n * 10) / 10;

function glyphD(g, x, y, size) {
  return g.getPath(x, y, size).toPathData(1);
}
/** 글자를 path 하나로. anchor: start | middle | end */
function T(str, x, y, o = {}) {
  const { size = 16, anchor = 'start', fill = '#000', cls, style, opacity } = o;
  const { glyphs, width } = shape(str, o);
  const x0 = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
  let d = '';
  for (const it of glyphs) if (!/\s/.test(it.ch)) d += glyphD(it.g, x0 + it.x, y, size);
  const a = [`d="${d}"`, `fill="${fill}"`];
  if (cls) a.push(`class="${cls}"`);
  if (style) a.push(`style="${style}"`);
  if (opacity != null) a.push(`opacity="${opacity}"`);
  return { svg: d ? `<path ${a.join(' ')}/>` : '', width, x0, x1: x0 + width };
}
/** 여러 스타일 글자를 이어 붙이기. parts: [{t, ...opts, gap}] */
function R(parts, x, y, base = {}) {
  const total = parts.reduce((s, p) => s + measure(p.t, { ...base, ...p }) + (p.gap ?? 0), 0);
  const anchor = base.anchor ?? 'start';
  let cx = anchor === 'middle' ? x - total / 2 : anchor === 'end' ? x - total : x;
  const x0 = cx;
  let svg = '';
  for (const p of parts) {
    const r = T(p.t, cx, y, { ...base, ...p, anchor: 'start' });
    svg += r.svg;
    cx = r.x1 + (p.gap ?? 0);
  }
  return { svg, x0, x1: cx, width: total };
}

/* ───────────────────────── palettes ───────────────────────── */
// 포트폴리오 사이트(my-project-one-sigma-74.vercel.app)와 같은 색: bg #0D1013 · mint #2EE6C5 · coral · violet · blue · amber
const PALETTES = {
  light: {
    card: '#ffffff', bar: '#f6f8fa', line: '#d0d7de', line2: '#e8ecf0', grid: '#e3e8ed', chip: '#f6f8fa',
    text: '#1f2328', muted: '#59636e', dim: '#8c959f',
    mint: '#0b9c84', coral: '#e05a4f', violet: '#7357d9', blue: '#2f6feb', amber: '#bf7a09',
    glow: 0.13,
  },
  dark: {
    card: '#0f1317', bar: '#151a1f', line: '#2a3138', line2: '#1f252b', grid: '#1c2228', chip: '#151a1f',
    text: '#f0f3f6', muted: '#aeb4bd', dim: '#6f767e',
    mint: '#2ee6c5', coral: '#ff7a6b', violet: '#8b7cf6', blue: '#5b8cff', amber: '#ffb454',
    glow: 0.16,
  },
};

/* ───────────────────────── svg helpers ───────────────────────── */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const BASE_CSS =
  '@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}' +
  '@keyframes flow{to{stroke-dashoffset:-16}}' +
  '@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}' +
  '@keyframes breathe{0%,100%{opacity:.45}50%{opacity:1}}' +
  '.blink{animation:blink 1.1s steps(1) infinite}.flow{animation:flow 1.2s linear infinite}' +
  '.pulse{animation:pulse 2.4s ease-in-out infinite}.breathe{animation:breathe 7s ease-in-out infinite}';
const REDUCED = '@media (prefers-reduced-motion:reduce){*{animation:none!important}}';
function doc({ w = 900, h, label, css = '', defs = '', body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title><style>${BASE_CSS}${css}${REDUCED}</style><defs>${defs}</defs>${body}</svg>`;
}
const commonDefs = (c, h) =>
  `<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="${c.grid}"/></pattern>` +
  `<radialGradient id="glowM"><stop offset="0" stop-color="${c.mint}" stop-opacity="${c.glow}"/><stop offset="1" stop-color="${c.mint}" stop-opacity="0"/></radialGradient>` +
  `<radialGradient id="glowV"><stop offset="0" stop-color="${c.violet}" stop-opacity="${c.glow}"/><stop offset="1" stop-color="${c.violet}" stop-opacity="0"/></radialGradient>` +
  `<clipPath id="win"><rect x="1" y="1" width="898" height="${h - 2}" rx="14"/></clipPath>`;

/** 터미널 창 테두리 + 제목 줄 */
function frame(c, { w = 900, h, title, right }) {
  let s = `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="14" fill="${c.card}"/>`;
  s += `<path d="M1.75 40.5V15A13.25 13.25 0 0 1 15 1.75H${w - 15}A13.25 13.25 0 0 1 ${w - 1.75} 15V40.5Z" fill="${c.bar}"/>`;
  s += `<path d="M1.5 40.5H${w - 1.5}" stroke="${c.line}"/>`;
  [c.coral, c.amber, c.mint].forEach((col, i) => { s += `<circle cx="${24 + i * 20}" cy="21" r="6" fill="${col}"/>`; });
  s += T(title, w / 2, 25.5, { family: 'mono', weight: 500, size: 13, anchor: 'middle', fill: c.dim }).svg;
  if (right) {
    const t = T(right, w - 24, 25.5, { family: 'mono', weight: 500, size: 12, anchor: 'end', fill: c.dim });
    s += `<circle class="pulse" cx="${r1(t.x0 - 11)}" cy="21.5" r="3.5" fill="${c.mint}"/>` + t.svg;
  }
  return s;
}
const frameBorder = (c, w, h) => `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="14" fill="none" stroke="${c.line}" stroke-width="1.5"/>`;
const prompt = (c, cmd, y, x = 40) => R([{ t: '$ ', fill: c.mint, weight: 800 }, { t: cmd, fill: c.text, weight: 500 }], x, y, { family: 'mono', size: 15 }).svg;

/** 둥근 알약 배지 */
function pill(c, text, x, y, o = {}) {
  const { accent = c.mint, family = 'sans', weight = 700, size = 12, h = 24, padX = 11, anchor = 'start', fillOp = 0.1, ls = 0 } = o;
  const tw = measure(text, { family, weight, size, ls });
  const w = tw + padX * 2;
  const x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
  const s =
    `<rect x="${r1(x0)}" y="${r1(y - h / 2)}" width="${r1(w)}" height="${h}" rx="${h / 2}" fill="${accent}" fill-opacity="${fillOp}" stroke="${accent}" stroke-width="1.2"/>` +
    T(text, x0 + padX, y + size * 0.36, { family, weight, size, ls, fill: accent }).svg;
  return { svg: s, x0, x1: x0 + w, w };
}

/* ───────────────────────── 1. hero ───────────────────────── */
function hero(c) {
  const W = 900, H = 480;
  const CYC = 9;
  const pct = (t) => `${r1(t * 100)}%`;
  const END = 0.94;
  const kfShow = (n, at) => `@keyframes ${n}{0%,${pct(at)}{opacity:0}${pct(at + 0.015)},${pct(END)}{opacity:1}100%{opacity:0}}`;
  const kfDraw = (n, len, a, b) =>
    `@keyframes ${n}{0%,${pct(a)}{stroke-dashoffset:${len};opacity:1}${pct(b)},${pct(END)}{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}}`;
  const anim = (n, ease = 'linear') => `animation:${n} ${CYC}s ${ease} infinite`;
  let css = '';
  let b = '';

  // 배경
  b += `<g clip-path="url(#win)"><rect x="1" y="41" width="898" height="${H - 42}" fill="url(#dots)"/>`;
  b += `<circle class="breathe" cx="705" cy="265" r="300" fill="url(#glowV)"/>`;
  b += `<circle class="breathe" cx="70" cy="${H}" r="290" fill="url(#glowM)" style="animation-delay:-3.5s"/></g>`;

  /* 왼쪽: 자기소개 */
  const L = 46;
  b += R([{ t: '$ ', fill: c.mint, weight: 800 }, { t: 'whoami', fill: c.text, weight: 500 }], L, 96, { family: 'mono', size: 16 }).svg;
  const name = T('박세준', L - 2, 178, { family: 'sans', weight: 800, size: 72, fill: c.text, ls: -1.5 });
  b += name.svg;
  b += T('@mnunu123', name.x1 + 18, 170, { family: 'mono', weight: 500, size: 15, fill: c.dim }).svg;
  b += T('Build & Verify Engineer', L, 224, { family: 'mono', weight: 800, size: 25, fill: 'url(#gRole)' }).svg;
  b += T('하드웨어부터 서비스까지, 전체 구조를 직접 구현합니다', L, 259, { family: 'sans', weight: 500, size: 17, fill: c.muted }).svg;
  b += R([{ t: '$ ', fill: c.mint, weight: 800 }, { t: 'cat stack.txt', fill: c.text, weight: 500 }], L, 312, { family: 'mono', size: 16 }).svg;
  const stack = ['STM32', 'ROS2', 'YOLOv8', 'FastAPI', 'Next.js'];
  const parts = [];
  stack.forEach((s, i) => {
    parts.push({ t: s, fill: c.blue, weight: 500 });
    if (i < stack.length - 1) parts.push({ t: '  ·  ', fill: c.dim, weight: 400 });
  });
  const st = R(parts, L, 345, { family: 'mono', size: 15 });
  b += st.svg;
  b += `<rect class="blink" x="${r1(st.x1 + 10)}" y="331" width="9" height="18" fill="${c.mint}"/>`;
  b += `<path d="M${L} 374.5H470" stroke="url(#gFade)" stroke-width="1.2"/>`;
  // 숫자 3개
  const stats = [
    ['14', '건', '공모전 수상'],
    ['2', '회', '대상'],
    ['6,100', '만 원', '정부 R&D 과제'],
  ];
  let sx = L;
  stats.forEach(([n, u, label], i) => {
    const num = T(n, sx, 421, { family: 'sans', weight: 800, size: 31, fill: c.text, ls: -0.5 });
    const unit = T(u, num.x1 + 4, 421, { family: 'sans', weight: 600, size: 15, fill: c.muted });
    const lab = T(label, sx, 447, { family: 'sans', weight: 500, size: 13, fill: c.muted });
    b += num.svg + unit.svg + lab.svg;
    const colW = Math.max(unit.x1, lab.x1) - sx;
    sx += colW + 24;
    if (i < stats.length - 1) b += `<path d="M${r1(sx - 12)} 400V452" stroke="${c.line}"/>`;
    sx += 0;
  });

  /* 오른쪽: Jetson → STM32 UART 시퀀스 (Threebot_firmware 실제 프로토콜 문자열) */
  const JX = 588, SX = 806;
  const box = (x, label, cap) => {
    let s = `<rect x="${x - 64}" y="64" width="128" height="34" rx="9" fill="${c.chip}" stroke="${c.line}" stroke-width="1.2"/>`;
    s += T(label, x, 86, { family: 'mono', weight: 700, size: 12, ls: 0.8, anchor: 'middle', fill: c.text }).svg;
    s += T(cap, x, 120, { family: 'sans', weight: 500, size: 12, anchor: 'middle', fill: c.dim }).svg;
    s += `<path d="M${x} 130V432" stroke="${c.line}" stroke-width="1.3" stroke-dasharray="2 6"/>`;
    return s;
  };
  b += box(JX, 'JETSON ORIN', 'ROS2 · 비전 · 판단');
  b += box(SX, 'STM32F407', 'FSM · 액추에이터 구동');

  const msg = (id, y, dir, labelParts, a, bEnd, color) => {
    // dir: 'r' = Jetson→STM32, 'l' = STM32→Jetson
    const x1 = dir === 'r' ? JX + 3 : SX - 3;
    const x2 = dir === 'r' ? SX - 9 : JX + 9;
    const len = Math.abs(x2 - x1);
    css += kfDraw(`d${id}`, r1(len), a, bEnd) + kfShow(`h${id}`, bEnd) + kfShow(`t${id}`, bEnd - 0.01);
    let s = `<path d="M${x1} ${y}H${x2}" stroke="${color}" stroke-width="1.6" stroke-dasharray="${r1(len)}" style="${anim(`d${id}`)}"/>`;
    const tip = dir === 'r' ? SX - 2 : JX + 2;
    const back = dir === 'r' ? tip - 9 : tip + 9;
    s += `<path d="M${tip} ${y}L${back} ${y - 5}L${back} ${y + 5}Z" fill="${color}" style="${anim(`h${id}`)}"/>`;
    s += `<g style="${anim(`t${id}`)}">${R(labelParts, (JX + SX) / 2, y - 10, { anchor: 'middle', size: 12.5 }).svg}</g>`;
    return s;
  };
  b += msg(1, 168, 'r', [{ t: 'ACT:HOME ALL', family: 'mono', weight: 700, fill: c.text }], 0.02, 0.11, c.muted);
  b += msg(2, 212, 'l', [{ t: 'ACK,HOME', family: 'mono', weight: 700, fill: c.mint }, { t: '   수락', family: 'sans', weight: 500, size: 12, fill: c.dim }], 0.15, 0.22, c.mint);

  // 활성 막대 + 호밍 FSM 상태 (svc_stepper.c: SEEK → ABSORB → RESET → BACKOFF → SET_ZERO)
  css += `@keyframes bar{0%,25%{transform:scaleY(0)}74%,${pct(END)}{transform:scaleY(1);opacity:1}100%{transform:scaleY(1);opacity:0}}`;
  b += `<rect x="${SX - 6}" y="224" width="12" height="160" rx="3" fill="${c.mint}" fill-opacity=".16" stroke="${c.mint}" stroke-opacity=".6" style="transform-box:fill-box;transform-origin:50% 0;${anim('bar')}"/>`;
  const states = ['SEEK', 'ABSORB', 'RESET', 'BACKOFF', 'SET_ZERO'];
  const ST = { family: 'mono', weight: 700, size: 11.5, ls: 0.5 };
  states.forEach((sname, i) => {
    const cy = 243 + i * 31;
    const tw = measure(sname, ST);
    const w = tw + 22;
    const x0 = SX - 18 - w;
    const at = 0.3 + i * 0.09;
    css += kfShow(`s${i}`, at);
    // 기본(꺼짐)
    b += `<rect x="${r1(x0)}" y="${cy - 11}" width="${r1(w)}" height="22" rx="11" fill="${c.card}" stroke="${c.line}"/>`;
    b += T(sname, x0 + 11, cy + 4.1, { ...ST, fill: c.dim }).svg;
    b += `<path d="M${r1(x0 + w)} ${cy}H${SX - 7}" stroke="${c.line}" stroke-dasharray="2 3"/>`;
    // 켜짐 (순서대로)
    b += `<g style="${anim(`s${i}`)}"><rect x="${r1(x0)}" y="${cy - 11}" width="${r1(w)}" height="22" rx="11" fill="${c.mint}" fill-opacity=".14" stroke="${c.mint}"/>`;
    b += T(sname, x0 + 11, cy + 4.1, { ...ST, fill: c.mint }).svg;
    b += `<path d="M${r1(x0 + w)} ${cy}H${SX - 7}" stroke="${c.mint}"/></g>`;
  });
  b += msg(3, 408, 'l', [{ t: 'DONE,HOME,ALL', family: 'mono', weight: 700, fill: c.mint }, { t: '   완료', family: 'sans', weight: 500, size: 12, fill: c.dim }], 0.76, 0.84, c.mint);
  b += R(
    [
      { t: 'ACK ≠ DONE', family: 'mono', weight: 700, size: 12, fill: c.muted },
      { t: '   명령 수락과 실제 완료를 따로 확인합니다', family: 'sans', weight: 500, size: 12, fill: c.dim },
    ],
    (JX + SX) / 2, 456, { anchor: 'middle' },
  ).svg;

  const defs =
    commonDefs(c, H) +
    `<linearGradient id="gRole" gradientUnits="userSpaceOnUse" x1="${L}" y1="0" x2="${L + 340}" y2="0"><stop offset="0" stop-color="${c.mint}"/><stop offset="1" stop-color="${c.violet}"/></linearGradient>` +
    `<linearGradient id="gFade" gradientUnits="userSpaceOnUse" x1="${L}" y1="0" x2="470" y2="0"><stop offset="0" stop-color="${c.mint}"/><stop offset=".6" stop-color="${c.violet}" stop-opacity=".5"/><stop offset="1" stop-color="${c.violet}" stop-opacity="0"/></linearGradient>`;
  return doc({
    w: W, h: H, label: '박세준 · Build & Verify Engineer — 하드웨어부터 서비스까지, 전체 구조를 직접 구현합니다', css, defs,
    body: frame(c, { h: H, title: 'mnunu123@nova: ~/profile', right: 'UART 115200 8N1' }) + b + frameBorder(c, W, H),
  });
}

/* ───────────────────────── 2. ticker ───────────────────────── */
const TICKER = [
  ['STM32 FSM', 1], ['UART ACK · DONE', 0], ['ROS2 Humble', 1], ['Jetson Orin', 0], ['ZED Mini ×3', 0], ['YOLOv8-seg', 1],
  ['Mobile-SAM', 0], ['FastAPI · PostgreSQL', 0], ['Next.js · deck.gl', 1], ['Claude Code Sub-Agent', 0], ['multi-agent pipeline', 1],
  ['walk-forward 검증', 0], ['ZYXCAD · AutoLISP', 1], ['Remotion', 0],
];
function ticker(c) {
  const W = 900, H = 46, cy = 23;
  const cols = [c.mint, c.violet, c.coral, c.blue];
  let x = 0;
  let body = '';
  TICKER.forEach(([t, em], i) => {
    body += `<rect x="${r1(x)}" y="${cy - 3.5}" width="7" height="7" transform="rotate(45 ${r1(x + 3.5)} ${cy})" fill="${cols[i % cols.length]}"/>`;
    x += 7 + 14;
    const r = T(t, x, cy + 4.6, { family: 'mono', weight: em ? 700 : 500, size: 13, fill: em ? c.text : c.muted });
    body += r.svg;
    x = r.x1 + 28;
  });
  const CW = r1(x);
  const css = `@keyframes mq{to{transform:translateX(-${CW}px)}}.mq{animation:mq ${r1(CW / 34)}s linear infinite}`;
  const defs =
    `<linearGradient id="mf" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#000"/><stop offset=".07" stop-color="#fff"/><stop offset=".93" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>` +
    `<mask id="fade"><rect x="0" y="0" width="${W}" height="${H}" fill="url(#mf)"/></mask>` +
    `<clipPath id="pill"><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="${(H - 2) / 2}"/></clipPath>`;
  const b =
    `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="${(H - 2) / 2}" fill="${c.card}" stroke="${c.line}" stroke-width="1.3"/>` +
    `<g clip-path="url(#pill)" mask="url(#fade)"><g transform="translate(26 0)"><g class="mq">${body}<g transform="translate(${CW} 0)">${body}</g></g></g></g>`;
  return doc({ w: W, h: H, label: TICKER.map((t) => t[0]).join(' · '), css, defs, body: b });
}

/* ───────────────────────── 3. section headers ───────────────────────── */
const SECTIONS = {
  'sec-awards': ['01', 'awards', '수상', '14 LOADED', 'amber'],
  'sec-layers': ['02', 'layers', '하드웨어부터 서비스까지', 'L1 → L5', 'mint'],
  'sec-projects': ['03', 'projects', '주요 프로젝트', '06 FEATURED', 'coral'],
  'sec-more': ['04', 'more', '그 외 프로젝트', 'ARCHIVE', 'blue'],
  'sec-stack': ['05', 'stack', '기술 스택', 'stack.yaml', 'violet'],
  'sec-edu': ['06', 'education', '교육 · 자격', 'KNU EE', 'blue'],
  'sec-contact': ['07', 'contact', '연락처 · 포트폴리오', 'ONLINE', 'mint'],
};
function section(c, [num, title, sub, badge, accent]) {
  const W = 900, H = 64, cy = 32.5;
  const A = c[accent];
  let b = `<rect x="1.5" y="${cy - 14}" width="48" height="28" rx="14" fill="${c.card}" stroke="${A}" stroke-width="1.3"/>`;
  b += T(num, 25.5, cy + 4.7, { family: 'mono', weight: 800, size: 13, anchor: 'middle', fill: A }).svg;
  const t = T(title, 66, cy + 7.5, { family: 'mono', weight: 800, size: 22, fill: c.text });
  const s = T(sub, t.x1 + 14, cy + 5.4, { family: 'sans', weight: 500, size: 15, fill: c.muted });
  b += t.svg + s.svg;
  const bt = measure(badge, { family: 'mono', weight: 700, size: 11, ls: 1.1 });
  const bw = bt + 38;
  const bx = W - 1.5 - bw;
  b += `<rect x="${r1(bx)}" y="${cy - 13}" width="${r1(bw)}" height="26" rx="13" fill="${A}" fill-opacity=".08" stroke="${A}" stroke-width="1.2"/>`;
  b += `<circle class="pulse" cx="${r1(bx + 15)}" cy="${cy}" r="3.3" fill="${A}"/>`;
  b += T(badge, bx + 26, cy + 4, { family: 'mono', weight: 700, size: 11, ls: 1.1, fill: A }).svg;
  const lx1 = r1(s.x1 + 18), lx2 = r1(bx - 16);
  const defs = `<linearGradient id="gl" gradientUnits="userSpaceOnUse" x1="${lx1}" y1="0" x2="${lx2}" y2="0"><stop offset="0" stop-color="${A}"/><stop offset="1" stop-color="${c.line}" stop-opacity=".5"/></linearGradient>`;
  b += `<path d="M${lx1} ${cy}H${lx2}" stroke="url(#gl)" stroke-width="1.5"/>`;
  return doc({ w: W, h: H, label: `${num} ${title} · ${sub}`, defs, body: b });
}

/* ───────────────────────── 4. awards ───────────────────────── */
const AWARDS = [
  ['2026.11', '최우수', '「탄소, 다시 보다」 AI 콘텐츠 공모전', '이미지 부문 · 10컷 웹툰 《피고인 C, 당신은 CO₂입니까?》 · 한국탄소산업진흥원'],
  ['2026.10', '대상', '판타지아 대구 AI 페스타', '카드뉴스 부문 · 축제 9개를 하나의 이름으로 묶은 카드뉴스 10장'],
  ['2026.05', '최우수', 'AI 활용 대학생 로컬임팩트 포럼', '발표 부문 · 사단법인 루트임팩트'],
  ['2025.12', '최우수', 'KNU-UP 학생 창업아이템 시제품 제작 경진대회', '경북대 지산학연협력기술연구소'],
  ['2025.11', '최우수', '2025 기후테크 아이디어 경진대회', '지식재산전문인력양성사업단'],
  ['2025.10', '대상', '한국도로공사 56주년 AI영상 제작 공모전', 'AI 도구 6개로 혼자 만든 56초 영상'],
  ['2025.09', '최우수', 'KNU-E 창업역량 강화캠프', '경북대 산학협력단'],
];
function awards(c) {
  const W = 900, ROW = 62, Y0 = 104;
  const H = Y0 + AWARDS.length * ROW + 64;
  let b = frame(c, { h: H, title: 'awards.log' });
  b += prompt(c, 'grep -E "대상|최우수" awards.log', 80);
  const cx = 52;
  b += `<path d="M${cx} ${Y0 + ROW / 2}V${Y0 + (AWARDS.length - 1) * ROW + ROW / 2}" stroke="${c.line}" stroke-width="2"/>`;
  AWARDS.forEach(([date, grade, title, sub], i) => {
    const top = Y0 + i * ROW;
    const cy = top + ROW / 2;
    const A = grade === '대상' ? c.amber : c.coral;
    b += `<circle cx="${cx}" cy="${cy}" r="7.5" fill="${c.card}" stroke="${A}" stroke-width="2"/>`;
    b += `<circle cx="${cx}" cy="${cy}" r="3.2" fill="${A}"${grade === '대상' ? ' class="pulse"' : ''}/>`;
    b += T(date, 78, cy - 3, { family: 'mono', weight: 700, size: 14, fill: c.mint }).svg;
    b += T(title, 162, cy - 3, { family: 'sans', weight: 700, size: 17, fill: c.text }).svg;
    b += T(sub, 162, cy + 18, { family: 'sans', weight: 500, size: 13, fill: c.muted }).svg;
    b += pill(c, grade, 866, cy - 7, { accent: A, size: 13, h: 28, padX: 13, anchor: 'end' }).svg;
    if (i < AWARDS.length - 1) b += `<path d="M78 ${top + ROW}H866" stroke="${c.line2}"/>`;
  });
  const sy = Y0 + AWARDS.length * ROW + 34;
  b += `<path d="M40 ${sy - 26}H866" stroke="${c.line}" stroke-dasharray="3 5"/>`;
  b += R([{ t: '+ ', fill: c.dim, family: 'mono', weight: 700 }, { t: '우수 4 · 은상 1 · 장려 2', fill: c.muted, weight: 500 }], 78, sy, { size: 14 }).svg;
  b += R([{ t: '합계 ', fill: c.muted, weight: 500, size: 14 }, { t: '14', fill: c.text, weight: 800, size: 18 }, { t: '건', fill: c.muted, weight: 600, size: 14 }], 866, sy, { anchor: 'end' }).svg;
  return doc({
    w: W, h: H, label: '수상 14건 중 대상 2 · 최우수 5 — ' + AWARDS.map((a) => `${a[0]} ${a[2]} ${a[1]}`).join(' / '),
    defs: commonDefs(c, H), body: b + frameBorder(c, W, H),
  });
}

/* ───────────────────────── 5. layers (하드웨어 → 서비스) ───────────────────────── */
const LAYERS = [
  ['L5', 'Service · AI', 'Next.js 관제 · LLM 에이전트', 'mint'],
  ['L4', 'Data · Backend', 'FastAPI · PostgreSQL · ML', 'blue'],
  ['L3', 'Robotics · Vision', 'ROS2 · ZED · YOLOv8', 'violet'],
  ['L2', 'Firmware', 'STM32 · ESP32 · Arduino', 'coral'],
  ['L1', 'Hardware · CAD', '전장 · 회로 · ZYXCAD 도면', 'amber'],
];
// 각 프로젝트에서 내가 맡은 레이어 (L1=1 … L5=5)
const LAYER_MAP = [
  ['쓰리봇', [1, 2, 3, 4, 5], true],
  ['DRAIN-X', [1]],
  ['PV5 택배', [1, 2]],
  ['면접로봇', [2, 4, 5]],
  ['무드등', [2, 3]],
  ['안전알림', [3, 5]],
  ['KAMP', [4]],
  ['할증레이더', [4, 5]],
  ['에이전트', [4, 5]],
];
function layers(c) {
  const W = 900, GX = 268, GX2 = 866, ROWH = 54, Y0 = 136;
  const H = Y0 + LAYERS.length * ROWH + 64;
  const colW = (GX2 - GX) / LAYER_MAP.length;
  const rowCy = (lv) => Y0 + (5 - lv) * ROWH + ROWH / 2; // L5 위, L1 아래
  let b = frame(c, { h: H, title: 'layers.map' });
  b += prompt(c, './trace --from hardware --to service', 80);
  // 쓰리봇 열 강조
  const hi = LAYER_MAP.findIndex((p) => p[2]);
  const hx = GX + hi * colW;
  b += `<rect x="${r1(hx + 5)}" y="${Y0 - 34}" width="${r1(colW - 10)}" height="${LAYERS.length * ROWH + 40}" rx="12" fill="${c.coral}" fill-opacity=".07" stroke="${c.coral}" stroke-opacity=".35" stroke-dasharray="3 4"/>`;
  // 행
  LAYERS.forEach(([code, name, tech, acc], i) => {
    const top = Y0 + i * ROWH;
    const cy = top + ROWH / 2;
    b += T(code, 40, cy + 1, { family: 'mono', weight: 800, size: 13, fill: c[acc] }).svg;
    b += T(name, 74, cy - 2, { family: 'sans', weight: 700, size: 15, fill: c.text }).svg;
    b += T(tech, 74, cy + 16, { family: 'mono', weight: 500, size: 11, fill: c.dim }).svg;
    if (i > 0) b += `<path d="M40 ${top}H${GX2}" stroke="${c.line2}"/>`;
  });
  // 열 머리
  LAYER_MAP.forEach(([pname, lv, star], j) => {
    const x = GX + j * colW + colW / 2;
    b += T(pname, x, Y0 - 12, { family: 'sans', weight: star ? 800 : 600, size: 12.5, anchor: 'middle', fill: star ? c.coral : c.text }).svg;
    // 빈 칸 점
    for (let L = 1; L <= 5; L++) if (!lv.includes(L)) b += `<circle cx="${r1(x)}" cy="${rowCy(L)}" r="1.8" fill="${c.dim}" opacity=".45"/>`;
    // 연결선 (붙어 있는 레이어끼리는 실선, 건너뛰면 점선)
    const sorted = [...lv].sort((a, z) => a - z);
    for (let k = 0; k < sorted.length - 1; k++) {
      const a = sorted[k], z = sorted[k + 1];
      const dash = z - a > 1 ? ` stroke-dasharray="2 4"` : '';
      b += `<path d="M${r1(x)} ${rowCy(a) - 9}V${rowCy(z) + 9}" stroke="${star ? c.coral : c.line}" stroke-width="${star ? 2 : 1.6}"${dash}/>`;
    }
    for (const L of lv) {
      const acc = c[LAYERS[5 - L][3]];
      b += `<circle cx="${r1(x)}" cy="${rowCy(L)}" r="8" fill="${acc}" fill-opacity=".16" stroke="${acc}" stroke-width="1.5"/>`;
      b += `<circle cx="${r1(x)}" cy="${rowCy(L)}" r="3.6" fill="${acc}"/>`;
    }
  });
  // 쓰리봇 열: L1 → L5 로 올라가는 신호
  const sx = r1(hx + colW / 2);
  const yBot = rowCy(1), yTop = rowCy(5);
  const css = `@keyframes up{0%{transform:translateY(0);opacity:0}8%{opacity:1}88%{opacity:1}100%{transform:translateY(${r1(yTop - yBot)}px);opacity:0}}.sig{animation:up 3.2s cubic-bezier(.45,0,.55,1) infinite}`;
  b += `<g class="sig"><circle cx="${sx}" cy="${yBot}" r="11" fill="${c.coral}" fill-opacity=".22"/><circle cx="${sx}" cy="${yBot}" r="4.5" fill="${c.coral}"/></g>`;
  // 범례
  const ly = Y0 + LAYERS.length * ROWH + 36;
  b += `<circle cx="46" cy="${ly - 4.5}" r="6" fill="${c.mint}" fill-opacity=".16" stroke="${c.mint}" stroke-width="1.3"/><circle cx="46" cy="${ly - 4.5}" r="2.6" fill="${c.mint}"/>`;
  b += T('그 프로젝트에서 제가 맡은 레이어', 60, ly, { family: 'sans', weight: 500, size: 13, fill: c.muted }).svg;
  b += R([{ t: '쓰리봇', weight: 800, fill: c.coral }, { t: '  L1 회로·전장부터 L5 관제 웹까지 한 시스템', weight: 500, fill: c.muted }], 866, ly, { size: 13, anchor: 'end' }).svg;
  return doc({
    w: W, h: H, css, defs: commonDefs(c, H), body: b + frameBorder(c, W, H),
    label: '레이어 지도 — ' + LAYER_MAP.map(([n, lv]) => `${n}: ${lv.map((x) => 'L' + x).join(' ')}`).join(' / '),
  });
}

/* ───────────────────────── 6. projects ───────────────────────── */
const PROJECTS = [
  ['쓰리봇', '빗물받이 청소 로봇 + 관제 플랫폼, 공동창업 PM', ['예창패 우수기업', 'coral'], ['STM32', 'ROS2', 'FastAPI']],
  ['DRAIN-X', '보도에 선 채 일하는 준설 로봇, 도면 6장', null, ['ZYXCAD', 'AutoLISP']],
  ['AI 자동화 파이프라인', '반복 작업을 에이전트 7개 구조로', null, ['Claude Code', 'Gemini']],
  ['KAMP 검사 우선순위', '불량 판별 대신 검사 순서 — 10월 불량 25건 전부 포착', null, ['scikit-learn']],
  ['할증레이더', '할증 공지를 LLM이 읽고 원문 근거와 대조', null, ['Claude', 'Python']],
  ['면접훈련 로봇', 'InMoov 얼굴 서보로 만든 AI 면접관', null, ['Arduino', 'FastAPI']],
];
function projects(c) {
  const W = 900, ROW = 56, Y0 = 100;
  const H = Y0 + PROJECTS.length * ROW + 24;
  let b = frame(c, { h: H, title: 'projects/' });
  b += prompt(c, 'ls projects/ --featured', 80);
  PROJECTS.forEach(([name, desc, badge, stack], i) => {
    const top = Y0 + i * ROW;
    const cy = top + ROW / 2;
    b += `<path d="M40 ${top}H866" stroke="${c.line2}"/>`;
    b += T(String(i + 1).padStart(2, '0'), 40, cy + 5, { family: 'mono', weight: 500, size: 13, fill: c.dim }).svg;
    b += T(name, 76, cy + 6, { family: 'sans', weight: 700, size: 16.5, fill: c.text }).svg;
    const d = T(desc, 258, cy + 5, { family: 'sans', weight: 500, size: 13.5, fill: c.muted });
    b += d.svg;
    if (badge) b += pill(c, badge[0], d.x1 + 12, cy, { accent: c[badge[1]], size: 11.5, h: 22, padX: 9 }).svg;
    const parts = [];
    stack.forEach((s, k) => { parts.push({ t: s, fill: c.blue }); if (k < stack.length - 1) parts.push({ t: ' · ', fill: c.dim }); });
    b += R(parts, 866, cy + 4.5, { family: 'mono', weight: 500, size: 12, anchor: 'end' }).svg;
  });
  return doc({
    w: W, h: H, defs: commonDefs(c, H), body: b + frameBorder(c, W, H),
    label: '주요 프로젝트 — ' + PROJECTS.map((p) => p[0]).join(' / '),
  });
}

/* ───────────────────────── 7. stack ───────────────────────── */
const STACK = [
  ['embedded', ['STM32 (C · HAL)', 'ESP32 (FreeRTOS)', 'Arduino', 'PCA9685', 'UART', 'BLE', 'MQTT']],
  ['robotics', ['ROS2 Humble', 'Jetson Orin', 'ZED SDK', 'MyCobot', 'SO-101', 'InMoov', 'Isaac Sim']],
  ['vision', ['YOLOv8 det/seg', 'Mobile-SAM', 'SAM2', 'MediaPipe', 'OpenCV', 'Roboflow']],
  ['ml_data', ['PyTorch', 'TensorFlow', 'scikit-learn', 'LightGBM', 'pandas', 'walk-forward']],
  ['llm_agents', ['Claude API', 'Claude Code', 'Gemini API', 'Whisper', 'Playwright']],
  ['web_backend', ['Next.js', 'React', 'TypeScript', 'FastAPI', 'PostgreSQL', 'Docker', 'NCP', 'deck.gl']],
  ['cad_design', ['ZYXCAD', 'AutoLISP', '회로도 · 하네스', 'Figma', 'Remotion', '미드저니']],
];
function stack(c) {
  const W = 900, KX = 74, CX = 196, CX2 = 868, LH = 42, Y0 = 66;
  const chipO = { family: 'mono', weight: 500, size: 12.5 };
  const PADX = 11;
  // 줄바꿈 계산
  const rows = [];
  for (const [key, items] of STACK) {
    let x = CX;
    let line = [];
    const lines = [line];
    for (const it of items) {
      const w = measure(it, chipO) + PADX * 2;
      if (x + w > CX2 && line.length) { line = []; lines.push(line); x = CX; }
      line.push([it, x, w]);
      x += w + 8;
    }
    rows.push([key, lines]);
  }
  const nLines = rows.reduce((s, r) => s + r[1].length, 0);
  const H = Y0 + nLines * LH + 22;
  let b = frame(c, { h: H, title: 'stack.yaml' });
  b += `<path d="M58.5 41V${H - 2}" stroke="${c.line2}"/>`;
  let ln = 0;
  rows.forEach(([key, lines], ri) => {
    lines.forEach((line, li) => {
      const cy = Y0 + ln * LH + LH / 2;
      b += T(String(ln + 1), 42, cy + 4.5, { family: 'mono', weight: 500, size: 12, anchor: 'end', fill: c.dim }).svg;
      if (li === 0) b += T(key + ':', KX, cy + 5, { family: 'mono', weight: 600, size: 14, fill: c.violet }).svg;
      for (const [it, x, w] of line) {
        b += `<rect x="${r1(x)}" y="${cy - 14}" width="${r1(w)}" height="28" rx="7" fill="${c.chip}" stroke="${c.line}"/>`;
        b += T(it, x + PADX, cy + 4.4, { ...chipO, fill: c.text }).svg;
      }
      ln++;
    });
  });
  return doc({
    w: W, h: H, defs: commonDefs(c, H), body: b + frameBorder(c, W, H),
    label: '기술 스택 — ' + STACK.map(([k, v]) => `${k}: ${v.join(', ')}`).join(' / '),
  });
}

/* ───────────────────────── 8. footer ───────────────────────── */
function footer(c) {
  const W = 900, H = 84, cy = 46;
  const r = R(
    [
      { t: '[ACK] ', family: 'mono', weight: 800, size: 15, fill: c.mint },
      { t: '끝까지 읽어주셔서 감사합니다', family: 'sans', weight: 500, size: 15, fill: c.text },
    ],
    W / 2 - 8, cy, { anchor: 'middle' },
  );
  let b = r.svg;
  b += `<rect class="blink" x="${r1(r.x1 + 8)}" y="${cy - 14}" width="9" height="18" fill="${c.mint}"/>`;
  b += `<path d="M2 ${cy - 5.5}H${r1(r.x0 - 26)}" stroke="${c.line}"/><path d="M${r1(r.x1 + 44)} ${cy - 5.5}H898" stroke="${c.line}"/>`;
  return doc({ w: W, h: H, label: '끝까지 읽어주셔서 감사합니다', body: b });
}

/* ───────────────────────── write ───────────────────────── */
const BUILDERS = {
  hero, ticker, awards, layers, projects, stack, footer,
  ...Object.fromEntries(Object.entries(SECTIONS).map(([k, v]) => [k, (c) => section(c, v)])),
};
let total = 0;
for (const [name, fn] of Object.entries(BUILDERS)) {
  for (const [mode, c] of Object.entries(PALETTES)) {
    const file = path.join(OUT, mode === 'light' ? `${name}.svg` : `${name}-dark.svg`);
    const svg = fn(c);
    fs.writeFileSync(file, svg);
    total += svg.length;
  }
}
console.log(`assets: ${Object.keys(BUILDERS).length * 2} files, ${(total / 1024).toFixed(0)} KB`);
