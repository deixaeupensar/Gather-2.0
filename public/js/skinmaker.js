// Criador de skins originais no layout padrão 64x64 dos jogos de blocos.
// Pinta cada parte (cabeça, corpo, braços, pernas) face a face, com leve variação de tom.

export const TONES = ['#f6d7b8', '#eac39d', '#d9a77a', '#c08a5d', '#9c6b43', '#7a4f2e', '#5a3820'];
export const HAIR_COLORS = ['#1d1a17', '#3b2416', '#6b4423', '#a56b39', '#d9b36a', '#e8d9a8', '#b34a2a', '#8a8a8a', '#e9e9e9', '#4a6fd1', '#c0479a'];
export const CLOTH_COLORS = ['#2b3a55', '#3a64d0', '#2fb3c2', '#3a8f45', '#86d13d', '#f2cd3a', '#ec8a2e', '#d0413a', '#ea7fb5', '#8746c8', '#eeeeee', '#5b5e63', '#26272b', '#7b5434'];
export const EYE_COLORS = ['#3b2416', '#2e5aa8', '#3a8f45', '#5d5d5d', '#7b5434'];
export const HAIR_STYLES = { curto: 'Curto', longo: 'Longo', careca: 'Careca', moicano: 'Moicano', franja: 'Franja' };
export const TOPS = { camiseta: 'Camiseta', manga_longa: 'Manga longa', moletom: 'Moletom', social: 'Camisa e gravata', terno: 'Terno' };
export const EXTRAS = { nada: 'Nada', oculos: 'Óculos', barba: 'Barba', bigode: 'Bigode', bone: 'Boné', fone: 'Fone de ouvido' };

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (R, arr) => arr[Math.floor(R() * arr.length)];
export function randomParams(seed = Math.random() * 1e9 | 0) {
  const R = rng(seed);
  return {
    tone: pick(R, TONES), hair: pick(R, HAIR_COLORS), hairStyle: pick(R, Object.keys(HAIR_STYLES)), eyes: pick(R, EYE_COLORS),
    top: pick(R, Object.keys(TOPS)), shirt: pick(R, CLOTH_COLORS), accent: pick(R, CLOTH_COLORS), pants: pick(R, ['#2b3a55', '#26272b', '#5b5e63', '#7b5434', '#3a64d0', '#a5a7ab']),
    shoes: pick(R, ['#26272b', '#eeeeee', '#7b5434', '#d0413a']), extra: R() < 0.5 ? 'nada' : pick(R, Object.keys(EXTRAS)),
  };
}

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const shade = (c, f) => c.map(v => Math.max(0, Math.min(255, Math.round(v * f))));

// faces de uma caixa w×h×d com textura em (u, v): top, bottom, right, front, left, back
function faces(u, v, w, h, d) {
  return {
    top: [u + d, v, w, d], bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h], front: [u + d, v + d, w, h], left: [u + d + w, v + d, d, h], back: [u + 2 * d + w, v + d, w, h],
  };
}

export function makeSkin(p) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(64, 64), D = img.data;
  const R = rng(12345);
  const set = (x, y, c, noise = 0.06) => { const k = 1 + (R() - 0.5) * noise * 2; const s = shade(c, k); const i = (y * 64 + x) * 4; D[i] = s[0]; D[i + 1] = s[1]; D[i + 2] = s[2]; D[i + 3] = 255; };
  // pinta uma caixa chamando fn(face, x, y, w, h) -> cor [r,g,b] ou null
  const box = (u, v, w, h, d, fn) => {
    for (const [face, [fx, fy, fw, fh]] of Object.entries(faces(u, v, w, h, d)))
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { const c = fn(face, x, y, fw, fh); if (c) set(fx + x, fy + y, c); }
  };
  const tone = hex(p.tone), hair = hex(p.hair), eyes = hex(p.eyes), shirt = hex(p.shirt), accent = hex(p.accent), pants = hex(p.pants), shoes = hex(p.shoes);
  const white = [245, 245, 245], dark = shade(tone, 0.7);

  // ---- cabeça
  box(0, 0, 8, 8, 8, (f, x, y) => {
    const st = p.hairStyle;
    if (f === 'top') return st === 'careca' ? shade(tone, 1.02) : (st === 'moicano' ? (x >= 3 && x <= 4 ? hair : shade(tone, 0.95)) : hair);
    if (f === 'bottom') return tone;
    if (st === 'moicano') { if ((f === 'back' && (x === 3 || x === 4) && y < 6) || (f === 'front' && (x === 3 || x === 4) && y === 0)) return hair; }
    else if (st !== 'careca') {
      const longo = st === 'longo';
      if (f === 'back' && y < (longo ? 8 : 4)) return hair;
      if ((f === 'right' || f === 'left') && (y < 2 || (longo && y < 7 && (f === 'right' ? x < 5 : x > 2)) || (!longo && y < 3 && (f === 'right' ? x < 4 : x > 3)))) return hair;
      if (f === 'front' && (y === 0 || (y === 1 && (st === 'franja' || x < 2 || x > 5)) || (st === 'franja' && y === 2 && x < 6) || (longo && (x === 0 || x === 7) && y < 6))) return hair;
    }
    if (f === 'front') {
      if (y === 3 && (x === 1 || x === 2 || x === 5 || x === 6)) return shade(st === 'careca' || st === 'moicano' ? hair : hair, 0.9); // sobrancelhas
      if (y === 4 && (x === 1 || x === 6)) return white;
      if (y === 4 && (x === 2 || x === 5)) return eyes;
      if (y === 5 && (x === 3 || x === 4) && p.extra !== 'bigode') return shade(tone, 0.85); // nariz
      if (y === 6 && x >= 3 && x <= 4) return [150, 70, 70]; // boca
      if (p.extra === 'barba' && (y >= 6 || (y === 5 && (x < 2 || x > 5))) && !(y === 6 && x >= 3 && x <= 4)) return hair;
      if (p.extra === 'bigode' && y === 5 && x >= 2 && x <= 5) return hair;
      if (p.extra === 'oculos' && y === 4 && (x === 0 || x === 3 || x === 4 || x === 7)) return [30, 30, 30];
      if (p.extra === 'oculos' && y === 4) return x === 1 || x === 6 ? [190, 220, 235] : [40, 60, 90];
    }
    if (p.extra === 'barba' && (f === 'right' || f === 'left') && y >= 5 && (f === 'right' ? x > 4 : x < 3)) return hair;
    if (p.extra === 'oculos' && (f === 'right' || f === 'left') && y === 4) return [30, 30, 30];
    if (p.extra === 'fone' && (f === 'right' || f === 'left') && y >= 3 && y <= 5 && x >= 3 && x <= 5) return [30, 30, 30];
    return f === 'front' || f === 'back' || f === 'right' || f === 'left' ? tone : tone;
  });
  // camada de cima da cabeça: boné / arco do fone
  if (p.extra === 'bone' || p.extra === 'fone') box(32, 0, 8, 8, 8, (f, x, y) => {
    if (p.extra === 'fone') return (f === 'top' && (x === 3 || x === 4)) || ((f === 'right' || f === 'left') && y < 3 && x >= 3 && x <= 4) ? [30, 30, 30] : null;
    if (f === 'top') return accent;
    if (y <= 1 && f !== 'bottom') return f === 'front' && y === 1 ? shade(accent, 0.75) : accent;
    return null;
  });

  // ---- corpo
  const jacket = p.top === 'terno' ? shade(shirt, 1) : null;
  box(16, 16, 8, 12, 4, (f, x, y) => {
    if (f === 'top') return p.top === 'moletom' || p.top === 'terno' ? shirt : (x >= 3 && x <= 4 && y >= 1 ? tone : shirt);
    if (f === 'bottom') return pants;
    if (y >= 10) return y === 10 && (p.top === 'social' || p.top === 'terno') ? [40, 30, 25] : pants; // cinto/calça
    if (f === 'front') {
      if (p.top === 'camiseta' || p.top === 'manga_longa') { if (y === 0 && x >= 3 && x <= 4) return tone; if (y === 0 && (x === 2 || x === 5)) return shade(shirt, 0.8); }
      if (p.top === 'social') { if (x >= 3 && x <= 4 && y >= 1 && y <= 7) return accent; if (y === 0 && x >= 2 && x <= 5) return white; }
      if (p.top === 'terno') { if (x >= 3 && x <= 4) return y === 0 ? white : y <= 6 ? accent : white; if ((x === 2 || x === 5) && y < 5) return white; return jacket; }
      if (p.top === 'moletom') { if (y >= 5 && y <= 8 && x >= 1 && x <= 6) return shade(shirt, 0.85); if (y === 0 && (x === 3 || x === 4)) return accent; }
    }
    if (p.top === 'moletom' && f === 'back' && y < 3) return shade(shirt, 0.88);
    return shirt;
  });
  // ---- braços (direito e esquerdo)
  const sleeve = { camiseta: 4, manga_longa: 11, moletom: 11, social: 11, terno: 11 }[p.top];
  const arm = (f, x, y) => {
    if (f === 'top') return shirt;
    if (f === 'bottom') return tone;
    if (y < sleeve) return p.top === 'social' && y === sleeve - 1 ? white : shirt;
    return y === 11 && sleeve === 11 ? tone : tone;
  };
  box(40, 16, 4, 12, 4, arm);
  box(32, 48, 4, 12, 4, arm);
  // ---- pernas
  const leg = (f, x, y) => (f === 'top' ? pants : f === 'bottom' ? shoes : y >= 10 ? (y === 10 && f !== 'back' ? shade(shoes, 1.15) : shoes) : pants);
  box(0, 16, 4, 12, 4, leg);
  box(16, 48, 4, 12, 4, leg);

  // a camada de cima (32,0) precisa continuar transparente onde não foi pintada
  ctx.putImageData(img, 0, 0);
  return cv;
}

// vista frontal achatada da skin (para galeria/prévia)
export function frontPreview(skin, scale = 4) {
  const cv = document.createElement('canvas'); cv.width = 16 * scale; cv.height = 32 * scale;
  const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
  const d = (sx, sy, sw, sh, dx, dy) => x.drawImage(skin, sx, sy, sw, sh, dx * scale, dy * scale, sw * scale, sh * scale);
  const tall = skin.height === 64;
  d(8, 8, 8, 8, 4, 0); d(40, 8, 8, 8, 4, 0);          // cabeça + chapéu
  d(20, 20, 8, 12, 4, 8);                               // corpo
  d(44, 20, 4, 12, 0, 8);                               // braço direito (lado esquerdo da imagem)
  if (tall) d(36, 52, 4, 12, 12, 8); else d(44, 20, 4, 12, 12, 8);
  d(4, 20, 4, 12, 4, 20);                               // perna direita
  if (tall) d(20, 52, 4, 12, 8, 20); else d(4, 20, 4, 12, 8, 20);
  return cv;
}
