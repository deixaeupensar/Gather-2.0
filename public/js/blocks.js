// Definição dos blocos e geração procedural das texturas (pixel art 16x16)
export const T = 16;

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
const vary = (c, r, amt) => { const f = 1 + (r - 0.5) * amt; return [clamp(c[0] * f), clamp(c[1] * f), clamp(c[2] * f)]; };
const mul = (c, f) => [clamp(c[0] * f), clamp(c[1] * f), clamp(c[2] * f)];

function px(img, x, y, c, a = 255) {
  const i = (y * T + x) * 4;
  img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; img[i + 3] = a;
}
function noise(img, R, c, amt) { for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) px(img, x, y, vary(c, R(), amt)); }
function border(img, c) { for (let i = 0; i < T; i++) { px(img, i, 0, c); px(img, i, T - 1, c); px(img, 0, i, c); px(img, T - 1, i, c); } }

const painters = {
  grass_top(img, R) { noise(img, R, [92, 168, 70], 0.32); for (let k = 0; k < 14; k++) px(img, R() * T | 0, R() * T | 0, [120, 196, 88]); },
  dirt(img, R) { noise(img, R, [134, 96, 67], 0.3); for (let k = 0; k < 12; k++) px(img, R() * T | 0, R() * T | 0, [100, 70, 48]); },
  grass_side(img, R) {
    painters.dirt(img, R);
    for (let x = 0; x < T; x++) { const h = 3 + (R() * 3 | 0); for (let y = 0; y < h; y++) px(img, x, y, vary([92, 168, 70], R(), 0.3)); }
  },
  stone(img, R) { noise(img, R, [128, 128, 132], 0.22); for (let k = 0; k < 16; k++) px(img, R() * T | 0, R() * T | 0, [102, 102, 108]); },
  cobble(img, R) {
    const pts = Array.from({ length: 7 }, () => [R() * T, R() * T, 0.8 + R() * 0.35]);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      let d1 = 1e9, d2 = 1e9, best = 0;
      pts.forEach((p, i) => {
        for (const ox of [-T, 0, T]) for (const oy of [-T, 0, T]) {
          const d = Math.hypot(x + 0.5 - p[0] - ox, y + 0.5 - p[1] - oy);
          if (d < d1) { d2 = d1; d1 = d; best = i; } else if (d < d2) d2 = d;
        }
      });
      px(img, x, y, d2 - d1 < 1.1 ? [78, 78, 84] : vary(mul([140, 140, 146], pts[best][2]), R(), 0.12));
    }
  },
  planks(img, R) {
    const base = [182, 138, 84];
    for (let row = 0; row < 4; row++) {
      const shade = 0.9 + R() * 0.2, seam = R() * T | 0;
      for (let y = row * 4; y < row * 4 + 4; y++) for (let x = 0; x < T; x++) {
        const c = y % 4 === 3 || x === seam ? mul(base, 0.62) : vary(mul(base, shade), R(), 0.1);
        px(img, x, y, c);
      }
    }
  },
  log_side(img, R) {
    for (let x = 0; x < T; x++) { const s = 0.75 + R() * 0.35; for (let y = 0; y < T; y++) px(img, x, y, vary(mul([116, 84, 52], s), R(), 0.12)); }
  },
  log_top(img, R) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      const c = d > 6.6 ? [104, 74, 46] : (Math.floor(d * 1.3) % 2 ? [186, 146, 94] : [156, 118, 74]);
      px(img, x, y, vary(c, R(), 0.08));
    }
  },
  leaves(img, R) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      if (R() < 0.16) px(img, x, y, [0, 0, 0], 0); else px(img, x, y, vary([58, 138, 52], R(), 0.55));
    }
  },
  glass(img) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) px(img, x, y, [0, 0, 0], 0);
    border(img, [205, 232, 245]);
    for (let i = 3; i < 7; i++) px(img, i, 9 - i, [240, 250, 255]);
    for (let i = 9; i < 12; i++) px(img, i, 22 - i, [240, 250, 255]);
  },
  brick(img, R) {
    noise(img, R, [196, 190, 180], 0.08);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 4 : 0;
      for (let b = -1; b < 2; b++) {
        const c = mul([164, 72, 56], 0.85 + R() * 0.3);
        for (let y = row * 4; y < row * 4 + 3; y++) for (let x = b * 8 + off; x < b * 8 + off + 7; x++) if (x >= 0 && x < T) px(img, x, y, vary(c, R(), 0.12));
      }
    }
  },
  sand(img, R) { noise(img, R, [222, 206, 150], 0.14); },
  smooth(img, R) { noise(img, R, [178, 178, 182], 0.07); border(img, [146, 146, 152]); },
  metal(img, R) {
    noise(img, R, [188, 194, 200], 0.06); border(img, [140, 146, 154]);
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) { px(img, x, y, [110, 116, 124]); px(img, x - 1, y - 1, [230, 234, 238]); }
  },
  lamp(img, R) {
    noise(img, R, [255, 222, 120], 0.1);
    for (let i = 0; i < T; i++) { px(img, i, 7, [255, 246, 200]); px(img, i, 8, [255, 246, 200]); px(img, 7, i, [255, 246, 200]); px(img, 8, i, [255, 246, 200]); }
    border(img, [150, 110, 50]);
  },
  bookshelf(img, R) {
    painters.planks(img, R);
    for (const y0 of [1, 9]) {
      let x = 1;
      while (x < T - 1) {
        const w = 1 + (R() * 2 | 0), h = 4 + (R() * 3 | 0);
        const c = [[170, 50, 50], [50, 90, 170], [60, 140, 70], [200, 170, 60], [120, 60, 140], [220, 220, 210]][R() * 6 | 0];
        for (let xx = x; xx < Math.min(T - 1, x + w); xx++) for (let y = y0 + 6 - h; y < y0 + 6; y++) px(img, xx, y, vary(c, R(), 0.15));
        x += w;
      }
    }
  },
  screen(img, R) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) px(img, x, y, [18, 32, 66]);
    for (let y = 3; y < 13; y += 2) { const len = 3 + (R() * 9 | 0); for (let x = 3; x < 3 + len; x++) px(img, x, y, [90, 170, 255]); }
    border(img, [34, 34, 40]);
  },
};

const color = h => (img, R) => { noise(img, R, hex(h), 0.1); };
// concreto: liso, só um respiro de variação (sem granulado)
const concrete = h => (img, R) => { noise(img, R, hex(h), 0.012); };
// reboco liso (parede de escritório)
const plaster = h => (img, R) => { noise(img, R, hex(h), 0.006); };
// piso de tábuas longas, emendas desencontradas e veio sutil
const woodFloor = h => (img, R) => {
  const c = hex(h);
  for (let row = 0; row < 4; row++) {
    const tone = 0.94 + R() * 0.12, seam = (row * 7 + 3) % T;
    for (let y = row * 4; y < row * 4 + 4; y++) for (let x = 0; x < T; x++) {
      let k = tone * (1 + Math.sin((x + row * 5) * 0.9 + y) * 0.015);
      if (y % 4 === 3) k *= 0.86; else if (x === seam) k *= 0.9;
      px(img, x, y, vary(mul(c, k), R(), 0.025));
    }
  }
};
// porcelanato: placa grande, rejunte fino só na borda do bloco
const tileFloor = (h, g) => (img, R) => {
  noise(img, R, hex(h), 0.01);
  for (let i = 0; i < T; i++) { px(img, i, 0, hex(g)); px(img, 0, i, hex(g)); }
};
const carpet = h => (img, R) => { noise(img, R, hex(h), 0.09); };
// teto modular: 2x2 placas por bloco
const ceiling = (h, g) => (img, R) => {
  noise(img, R, hex(h), 0.01);
  for (let i = 0; i < T; i++) { px(img, i, 0, hex(g)); px(img, 0, i, hex(g)); px(img, i, 8, hex(g)); px(img, 8, i, hex(g)); }
};
function ledPanel(img, R) {
  noise(img, R, [255, 251, 236], 0.01);
  for (let i = 0; i < T; i++) { px(img, i, 0, [205, 209, 213]); px(img, 0, i, [205, 209, 213]); px(img, i, T - 1, [205, 209, 213]); px(img, T - 1, i, [205, 209, 213]); }
}
// ripado: ripas verticais de madeira com fresta escura
const slats = (h, gap) => (img, R) => {
  const c = hex(h);
  for (let x = 0; x < T; x++) {
    const slat = Math.floor(x / 4), inGap = x % 4 === 3, tone = 0.92 + ((slat * 37) % 5) * 0.035;
    for (let y = 0; y < T; y++) px(img, x, y, inGap ? hex(gap) : vary(mul(c, tone * (1 + Math.sin(y * 0.7 + slat) * 0.02)), R(), 0.02));
  }
};

// ids são persistidos no mundo: só adicione no final, nunca reordene
export const BLOCKS = [
  null,
  { name: 'Grama', top: 'grass_top', side: 'grass_side', bottom: 'dirt' },
  { name: 'Terra', all: 'dirt' },
  { name: 'Pedra', all: 'stone' },
  { name: 'Tábuas', all: 'planks' },
  { name: 'Tronco', top: 'log_top', side: 'log_side', bottom: 'log_top' },
  { name: 'Folhas', all: 'leaves', transparent: true },
  { name: 'Areia', all: 'sand' },
  { name: 'Vidro', all: 'glass', transparent: true },
  { name: 'Tijolo', all: 'brick' },
  { name: 'Pedregulho', all: 'cobble' },
  { name: 'Pedra polida', all: 'smooth' },
  { name: 'Metal', all: 'metal' },
  { name: 'Luminária', all: 'lamp' },
  { name: 'Estante', top: 'planks', side: 'bookshelf', bottom: 'planks' },
  { name: 'Branco', all: 'c_white', paint: color('#eeeeee') },
  { name: 'Cinza claro', all: 'c_lgray', paint: color('#a5a7ab') },
  { name: 'Cinza', all: 'c_gray', paint: color('#5b5e63') },
  { name: 'Preto', all: 'c_black', paint: color('#26272b') },
  { name: 'Vermelho', all: 'c_red', paint: color('#d0413a') },
  { name: 'Laranja', all: 'c_orange', paint: color('#ec8a2e') },
  { name: 'Amarelo', all: 'c_yellow', paint: color('#f2cd3a') },
  { name: 'Lima', all: 'c_lime', paint: color('#86d13d') },
  { name: 'Verde', all: 'c_green', paint: color('#3a8f45') },
  { name: 'Ciano', all: 'c_cyan', paint: color('#2fb3c2') },
  { name: 'Azul', all: 'c_blue', paint: color('#3a64d0') },
  { name: 'Roxo', all: 'c_purple', paint: color('#8746c8') },
  { name: 'Rosa', all: 'c_pink', paint: color('#ea7fb5') },
  { name: 'Marrom', all: 'c_brown', paint: color('#7b5434') },
  { name: 'Tela (TV)', all: 'tv_15' },
  // concreto: liso, com textura bem sutil
  { name: 'Concreto branco', all: 'k_white', paint: concrete('#e3e5e6') },
  { name: 'Concreto cinza claro', all: 'k_lgray', paint: concrete('#b4b7ba') },
  { name: 'Concreto cinza', all: 'k_gray', paint: concrete('#6a6e73') },
  { name: 'Concreto preto', all: 'k_black', paint: concrete('#2a2c30') },
  { name: 'Concreto vermelho', all: 'k_red', paint: concrete('#a8322d') },
  { name: 'Concreto laranja', all: 'k_orange', paint: concrete('#e0631c') },
  { name: 'Concreto amarelo', all: 'k_yellow', paint: concrete('#efb326') },
  { name: 'Concreto lima', all: 'k_lime', paint: concrete('#69a42c') },
  { name: 'Concreto verde', all: 'k_green', paint: concrete('#4a6a2b') },
  { name: 'Concreto ciano', all: 'k_cyan', paint: concrete('#1f8996') },
  { name: 'Concreto azul', all: 'k_blue', paint: concrete('#2f3c99') },
  { name: 'Concreto roxo', all: 'k_purple', paint: concrete('#6a2b9b') },
  { name: 'Concreto rosa', all: 'k_pink', paint: concrete('#d5668f') },
  { name: 'Concreto marrom', all: 'k_brown', paint: concrete('#64432b') },
  { name: 'Concreto bege', all: 'k_beige', paint: concrete('#d9cdb0') },
  // acabamentos modernos
  { name: 'Parede lisa branca', all: 'm_plaster', paint: plaster('#eceeef') },
  { name: 'Parede lisa cinza', all: 'm_plaster2', paint: plaster('#c9cdd1') },
  { name: 'Piso de madeira clara', all: 'm_oak', paint: woodFloor('#caa57b') },
  { name: 'Porcelanato', all: 'm_tile', paint: tileFloor('#d9dbdd', '#c4c7ca') },
  { name: 'Carpete', all: 'm_carpet', paint: carpet('#4b5661') },
  { name: 'Teto modular', all: 'm_ceiling', paint: ceiling('#f1f2f3', '#d6d9dc') },
  { name: 'Painel de LED', all: 'm_led', paint: ledPanel },
  { name: 'Madeira nogueira', all: 'm_walnut', paint: woodFloor('#7a5236') },
  { name: 'Ripado de madeira', all: 'm_slats', paint: slats('#8a5a3b', '#2f241d') },
];
// os painters "c_*" precisam ser registrados
BLOCKS.forEach(b => { if (b && b.paint) painters[b.all] = b.paint; });

// Tela como TV desligada: tela preta e borda cinza-escura só nos lados sem outro bloco Tela.
// máscara: 1 = borda em cima, 2 = direita, 4 = embaixo, 8 = esquerda
for (let m = 0; m < 16; m++) painters['tv_' + m] = (img, R) => {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) px(img, x, y, vary([14, 15, 18], R(), 0.04));
  const edge = [58, 61, 66], inner = [34, 36, 40];
  for (let i = 0; i < T; i++) {
    if (m & 1) { px(img, i, 0, edge); px(img, i, 1, inner); }
    if (m & 4) { px(img, i, T - 1, edge); px(img, i, T - 2, inner); }
    if (m & 8) { px(img, 0, i, edge); px(img, 1, i, inner); }
    if (m & 2) { px(img, T - 1, i, edge); px(img, T - 2, i, inner); }
  }
};

export const BLOCK_IDS = BLOCKS.map((b, i) => i).filter(i => i > 0);
export const isTransparent = id => !!(BLOCKS[id] && BLOCKS[id].transparent);
export const isOpaque = id => id > 0 && !!BLOCKS[id] && !BLOCKS[id].transparent;
export const isSolid = id => id > 0;

// --- atlas
const tileNames = [];
const tileOf = name => { let i = tileNames.indexOf(name); if (i < 0) { i = tileNames.length; tileNames.push(name); } return i; };
// faceTiles[id] = [esq, dir, baixo, cima, trás, frente]
export const faceTiles = BLOCKS.map(b => {
  if (!b) return null;
  const top = tileOf(b.top || b.all), side = tileOf(b.side || b.all), bottom = tileOf(b.bottom || b.all);
  return [side, side, bottom, top, side, side];
});
// as 16 variantes da TV ficam em sequência no atlas
const TV0 = tileNames.length;
for (let m = 0; m < 16; m++) if (!tileNames.includes('tv_' + m)) tileNames.push('tv_' + m);
export const TV_TILE = m => tileNames.indexOf('tv_' + m);
export const TV_ID = 29;
export const TILE_COUNT = tileNames.length;

let atlasCanvas = null;
export function buildAtlas() {
  if (atlasCanvas) return atlasCanvas;
  const cv = document.createElement('canvas');
  cv.width = T * TILE_COUNT; cv.height = T;
  const ctx = cv.getContext('2d');
  tileNames.forEach((name, i) => {
    const data = ctx.createImageData(T, T);
    const R = rng(1000 + i * 7919);
    (painters[name] || color('#ff00ff'))(data.data, R);
    ctx.putImageData(data, i * T, 0);
  });
  atlasCanvas = cv;
  return cv;
}

// ícone isométrico para a interface
export function blockIcon(id, size = 40) {
  const atlas = buildAtlas();
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const ft = faceTiles[id];
  if (!ft) return cv;
  const s = size / 2, h = s / 2;
  const face = (tile, a, b, c, d, e, f, shade) => {
    ctx.save();
    ctx.setTransform(a, b, c, d, e, f);
    ctx.drawImage(atlas, tile * T, 0, T, T, 0, 0, T, T);
    if (shade) { ctx.fillStyle = `rgba(0,0,0,${shade})`; ctx.globalCompositeOperation = 'source-atop'; ctx.fillRect(0, 0, T, T); }
    ctx.restore();
  };
  const k = s / T;
  face(ft[3], k, k / 2, -k, k / 2, s, 0, 0);                 // topo
  face(ft[0], k, k / 2, 0, k, 0, h, 0.18);                    // esquerda
  face(ft[1], k, -k / 2, 0, k, s, h + h, 0.35);               // direita
  return cv;
}
