// Decorações embutidas em estilo voxel (montadas com caixinhas em unidades de 1/16 de bloco).
// Cada uma vira um "modelo" com id "d:<nome>" e funciona igual aos modelos importados.
import * as THREE from 'three';

// caixa: [x, y, z, largura, altura, profundidade, cor, brilha?]  (frente = +Z, fundo = -Z)
const WOOD = '#a0703c', WOOD_D = '#7a522a', GREEN = '#2e7d32', RED = '#c62828', GOLD = '#ffd54f', SNOW = '#f4f8fb';

function legs4(w, d, h, c, t = 2, inset = 1) {
  return [[inset, 0, inset], [w - inset - t, 0, inset], [inset, 0, d - inset - t], [w - inset - t, 0, d - inset - t]].map(([x, y, z]) => [x, y, z, t, h, t, c]);
}
function christmasTree() {
  const b = [[13, 0, 13, 6, 6, 6, '#6b4423']];
  const layers = [[3, 6, 26, 8], [6, 14, 20, 8], [9, 22, 14, 8], [12, 30, 8, 7], [14, 37, 4, 4]];
  const cols = ['#e53935', '#fdd835', '#1e88e5', '#fb8c00', '#ec407a', '#ffffff'];
  let k = 0;
  layers.forEach(([o, y, s, h], li) => {
    b.push([o, y, o, s, h, s, li % 2 ? '#23803a' : '#1f6b2e']);
    if (s < 6) return;
    // enfeites brilhantes nas 4 faces da camada
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      const t = o + 2 + ((j * 7 + i * 3 + li * 5) % (s - 5)), yy = y + 1 + ((i + j + li) % (h - 3));
      const c = cols[k++ % cols.length];
      if (i === 0) b.push([t, yy, o + s, 2, 2, 1, c, 1]);
      if (i === 1) b.push([t, yy, o - 1, 2, 2, 1, c, 1]);
      if (i === 2) b.push([o + s, yy, t, 1, 2, 2, c, 1]);
      if (i === 3) b.push([o - 1, yy, t, 1, 2, 2, c, 1]);
    }
  });
  b.push([14, 41, 15, 4, 4, 2, GOLD, 1], [15, 40, 14, 2, 6, 4, GOLD, 1]);
  return b;
}
function gift(c, r) {
  return [[3, 0, 3, 10, 8, 10, c], [7, 0, 2.9, 2, 8.2, 10.2, r], [2.9, 0, 7, 10.2, 8.2, 2, r], [5.5, 8, 7, 2, 2, 2, r], [8.5, 8, 7, 2, 2, 2, r]];
}
function candyCane() {
  const b = [];
  for (let i = 0; i < 7; i++) b.push([7, i * 2, 7, 2, 2, 2, i % 2 ? '#ffffff' : RED]);
  b.push([7, 14, 7, 2, 2, 2, '#ffffff'], [8, 15, 7, 2, 2, 2, RED], [10, 15, 7, 2, 2, 2, '#ffffff'], [11, 13, 7, 2, 2, 2, RED]);
  return b;
}
// lata de energético: corpo "redondo" (duas caixas em cruz), tampa metálica e três garras brilhantes na frente
function energyCan(body, claw, rim) {
  // ~4 cm de largura e 7 cm de altura na escala do mundo (1 bloco = 16 unidades)
  const b = [[7.1, 0, 7.5, 1.8, 3.6, 1, body], [7.5, 0, 7.1, 1, 3.6, 1.8, body], [7.25, 0, 7.25, 1.5, 3.6, 1.5, body],
    [7.25, 3.6, 7.25, 1.5, 0.2, 1.5, rim], [7.75, 3.8, 7.6, 0.5, 0.08, 0.6, '#8a9097'], [7.2, 0, 7.2, 1.6, 0.15, 1.6, rim]];
  // garras (riscos verticais tortos) na frente (+Z), encostadas na face da lata
  for (const [x, y0, len] of [[7.58, 0.7, 2.4], [7.93, 0.55, 2.7], [8.28, 0.7, 2.4]])
    for (let k = 0; k < len; k += 0.3) b.push([x + Math.sin(k * 2.2) * 0.04, y0 + k, 8.9, 0.14, 0.34, 0.06, claw, 1]);
  return b;
}
// ---- Natal (mais)
const SKIN = '#f2c6a0', WHITE = '#fafafa', BLACK = '#1b1b1b', BROWN = '#8b5a2b', GOLD2 = '#ffc107';
function santa() {
  return [
    [4, 0, 5, 3, 3, 4, BLACK], [9, 0, 5, 3, 3, 4, BLACK], [4, 3, 5.5, 3, 6, 3, RED], [9, 3, 5.5, 3, 6, 3, RED],
    [3, 9, 4, 10, 9, 8, RED], [2.8, 9, 3.8, 10.4, 1, 8.4, WHITE], [2.9, 11, 3.9, 10.2, 1.5, 8.2, BLACK], [7, 11, 12.05, 2, 1.5, 0.3, GOLD],
    [7.3, 12.5, 12, 1.4, 5.5, 0.3, WHITE], [1, 11, 6, 2, 6, 3, RED], [13, 11, 6, 2, 6, 3, RED], [1, 9.5, 6, 2, 1.5, 3, BLACK], [13, 9.5, 6, 2, 1.5, 3, BLACK],
    [4, 10, 1, 8, 9, 3, '#7a5a3a'],                                           // saco nas costas
    [5, 18, 5, 6, 6, 6, SKIN], [4.5, 15.5, 10.5, 7, 5, 1.5, WHITE], [5.5, 19.5, 11, 5, 1, 0.6, WHITE], // barba e bigode
    [6.3, 21.5, 11, 1, 1, 0.2, BLACK], [8.7, 21.5, 11, 1, 1, 0.2, BLACK], [7.5, 20.3, 11, 1, 1, 0.5, '#e8a07a'],
    [4.3, 23.5, 4.3, 7.4, 1.2, 7.4, WHITE], [4.8, 24.7, 4.8, 6.4, 2, 6.4, RED], [5.8, 26.7, 5.8, 4.4, 2, 4.4, RED], [6.8, 28.7, 6.8, 2.4, 1.5, 2.4, RED], [7, 30, 7, 2, 2, 2, WHITE],
  ];
}
function reindeer() { // frente para +Z, corpo ao longo de Z (1 x 2)
  const D = '#6b4423', b = [[5, 10, 6, 6, 8, 18, BROWN], [5.5, 0, 7, 2, 10, 2, D], [8.5, 0, 7, 2, 10, 2, D], [5.5, 0, 21, 2, 10, 2, D], [8.5, 0, 21, 2, 10, 2, D],
    [6, 15, 21, 4, 7, 4, BROWN], [5.5, 20, 23, 5, 5, 7, BROWN], [7, 20.5, 30, 2, 2, 1, '#e53935', 1], [5.4, 22.5, 27, 0.2, 1, 1, BLACK], [10.4, 22.5, 27, 0.2, 1, 1, BLACK],
    [5.8, 17, 20.8, 4.4, 1, 4.4, RED], [7.3, 15.8, 25.3, 1.4, 1.4, 1.4, GOLD, 1], [7, 15, 5, 2, 2, 1.5, WHITE], [5.5, 10, 9, 5, 0.5, 12, '#a07040']];
  for (const s of [-1, 1]) { const x = s < 0 ? 5 : 10; b.push([x, 25, 25, 1, 4, 1, '#d7ccc8'], [x + (s < 0 ? -1.5 : 1), 27.5, 25, 1.5, 1, 1, '#d7ccc8'], [x, 28, 23.5, 1, 1, 1.5, '#d7ccc8']); }
  return b;
}
function sleigh() { // 1 x 2, frente para +Z
  return [[2, 0, 1, 1, 1, 29, GOLD], [13, 0, 1, 1, 1, 29, GOLD], [2, 1, 29, 1, 4, 1, GOLD], [13, 1, 29, 1, 4, 1, GOLD], [2, 4, 27.5, 1, 1, 2, GOLD], [13, 4, 27.5, 1, 1, 2, GOLD],
    [2, 2, 3, 12, 7, 22, RED], [2, 9, 3, 12, 8, 3, RED], [2, 9, 22, 12, 3, 3, RED], [3, 8.6, 6, 10, 0.5, 15, '#5d1010'], [1.8, 6, 2.8, 12.4, 1, 22.4, GOLD],
    [4, 9, 9, 4, 4, 4, '#2e7d32'], [9, 9, 11, 4, 3, 4, '#1e63c6'], [6, 9, 15, 3, 5, 3, '#ffd54f'], [6.7, 13, 9, 1.2, 0.3, 4, GOLD]];
}
function festoon() { // festão com luzinhas (parede, no alto)
  const b = [[0, 2.5, 0, 16, 3, 2.2, '#1f6b2e'], [1.5, 1.2, 0, 13, 1.5, 2, '#23803a'], [4, 0.6, 0, 8, 1, 1.8, '#1f6b2e']];
  const cols = ['#e53935', '#fdd835', '#1e88e5', '#43a047', '#ec407a'];
  [[1.5, 2.2], [4.5, 1.2], [7.5, 0.6], [10.5, 1.2], [13.5, 2.2]].forEach(([x, y], k) => b.push([x, y, 2, 1, 1, 0.8, cols[k], 1]));
  return b;
}
function baubles() { // bolas penduradas (do teto, ocupa a célula logo abaixo dele)
  const b = [];
  for (const [x, z, top, len, c] of [[5, 7.5, 16, 8, RED], [10, 8, 16, 6, '#1e88e5'], [7.5, 3.5, 16, 4, GOLD2], [8, 12, 16, 9, '#e91e63']]) {
    b.push([x, top - len, z, 0.3, len, 0.3, '#bdbdbd'], [x - 0.6, top - len - 0.6, z - 0.6, 1.5, 0.7, 1.5, '#b0b0b0'], [x - 1.1, top - len - 3.5, z - 1.1, 2.5, 3, 2.5, c]);
  }
  return b;
}
function candles() {
  return [[5, 0, 5, 6, 0.5, 6, '#c9a227'], [6, 0.5, 6, 1.2, 3, 1.2, WHITE], [8.5, 0.5, 7, 1.2, 4, 1.2, WHITE], [7, 0.5, 8.8, 1.2, 2.5, 1.2, WHITE],
    [6.25, 3.5, 6.25, 0.7, 1, 0.7, '#ffb300', 1], [8.75, 4.5, 7.25, 0.7, 1, 0.7, '#ffb300', 1], [7.25, 3, 9.05, 0.7, 1, 0.7, '#ffb300', 1],
    [4.5, 0.5, 10, 2, 0.4, 1.2, GREEN], [9.5, 0.5, 10.3, 2, 0.4, 1.2, GREEN], [7, 0.6, 10.6, 0.8, 0.8, 0.8, RED, 1]];
}
function gingerbread() {
  const G = '#b5651d';
  return [[6.5, 0, 7.5, 1.3, 2.4, 1, G], [8.2, 0, 7.5, 1.3, 2.4, 1, G], [6.3, 2.4, 7.5, 3.4, 2.8, 1, G], [5, 3.8, 7.5, 1.4, 1, 1, G], [9.6, 3.8, 7.5, 1.4, 1, 1, G],
    [6.6, 5.2, 7.5, 2.8, 2.6, 1, G], [7.2, 6.4, 8.5, 0.4, 0.4, 0.1, WHITE], [8.4, 6.4, 8.5, 0.4, 0.4, 0.1, WHITE], [7.6, 5.6, 8.5, 0.6, 0.25, 0.1, WHITE],
    [7.8, 4, 8.5, 0.4, 0.4, 0.1, RED], [7.8, 3, 8.5, 0.4, 0.4, 0.1, '#43a047']];
}
function bells() {
  return [[6, 8, 0, 4, 2, 1.5, RED], [4.5, 7, 0, 2, 2, 1.2, RED], [9.5, 7, 0, 2, 2, 1.2, RED], [7, 9.6, 0, 2, 1, 1, GREEN], [5, 9.6, 0.2, 1.5, 0.8, 1, GREEN],
    [4, 2, 0.5, 3, 4, 2, GOLD2], [9, 2, 0.5, 3, 4, 2, GOLD2], [3.7, 2, 0.3, 3.6, 0.8, 2.4, '#ffb300'], [8.7, 2, 0.3, 3.6, 0.8, 2.4, '#ffb300'],
    [5, 1.2, 1, 1, 0.8, 1, '#8d6e63'], [10, 1.2, 1, 1, 0.8, 1, '#8d6e63'], [5.2, 6, 1, 0.6, 2, 0.6, RED], [10.2, 6, 1, 0.6, 2, 0.6, RED]];
}
function snowyPine() {
  return [[6, 0, 6, 4, 5, 4, '#5d4037'],
    [1, 5, 1, 14, 6, 14, '#1b5e20'], [1, 10.6, 1, 14, 0.6, 14, '#f4f8fb'], [3, 11, 3, 10, 6, 10, '#2e7d32'], [3, 16.6, 3, 10, 0.6, 10, '#f4f8fb'],
    [4.5, 17, 4.5, 7, 6, 7, '#1b5e20'], [4.5, 22.6, 4.5, 7, 0.6, 7, '#f4f8fb'], [6, 23, 6, 4, 5, 4, '#2e7d32'], [6, 27.6, 6, 4, 0.8, 4, '#f4f8fb'], [7, 28.4, 7, 2, 1.5, 2, '#f4f8fb']];
}
function bigTree() { // árvore gigante 3x3: a árvore normal (2x2) ampliada 1,5x
  return christmasTree().map(([x, y, z, w, h, d, c, e]) => [x * 1.5, y * 1.5, z * 1.5, w * 1.5, h * 1.5, d * 1.5, c, e]);
}
function snowPatch() {
  return [[0, 0, 0, 32, 0.5, 32, '#f4f8fb'], [4, 0.5, 6, 10, 0.4, 8, '#ffffff'], [18, 0.5, 16, 9, 0.4, 10, '#ffffff'], [10, 0.5, 22, 6, 0.3, 6, '#eef4f9']];
}
function giftStack() {
  return [[2, 0, 2, 12, 6, 12, RED], [7, 0, 1.9, 2, 6.2, 12.2, GOLD], [1.9, 0, 7, 12.2, 6.2, 2, GOLD],
    [4, 6, 4, 8, 5, 8, '#1e63c6'], [7.2, 6, 3.9, 1.6, 5.2, 8.2, WHITE], [3.9, 6, 7.2, 8.2, 5.2, 1.6, WHITE],
    [6, 11, 6, 4, 3, 4, GREEN], [7.5, 11, 5.9, 1, 3.2, 4.2, RED], [7, 14, 7, 2, 1, 2, RED]];
}

// painel ripado de madeira (encostado na parede): fundo escuro + 4 ripas em relevo por bloco
function slatPanel(hUnits, wood = ['#93603f', '#8a5a3b', '#9a6845', '#855638']) {
  const b = [[0, 0, 0, 16, hUnits, 0.6, '#2f241d']];
  for (let k = 0; k < 4; k++) b.push([0.5 + k * 4, 0, 0.6, 3, hUnits, 1.1, wood[k]]);
  return b;
}
function fairyLights() {
  // pisca-pisca de parede: fio com lâmpadas coloridas
  const b = [[0, 7, 0, 16, 0.6, 0.6, '#1b5e20']];
  const cols = ['#e53935', '#fdd835', '#1e88e5', '#43a047', '#ec407a'];
  for (let i = 0; i < 5; i++) b.push([1 + i * 3, 5.5, 0.2, 1.4, 1.6, 1.2, cols[i], 1]);
  return b;
}

// ---- móveis com variações de cor
function sofaBoxes(c1, c2, c3, w = 32) {
  return [[0, 0, 1, w, 5, 15, c1], [3, 5, 4, w - 6, 3, 12, c2], [0, 5, 0, w, 11, 4, c1], [0, 5, 0, 3, 7, 16, c3], [w - 3, 5, 0, 3, 7, 16, c3], ...legs4(w, 16, 1, '#2b2b2b', 2, 1)];
}
function officeChair(c, base = '#222') {
  return [[2, 0, 7, 12, 1, 2, base], [7, 0, 2, 2, 1, 12, base], [7, 1, 7, 2, 6, 2, '#3a3a3a'], [2, 7, 2, 12, 2, 12, c], [3, 9, 1, 10, 13, 2, c], [1, 9, 5, 1, 4, 8, base], [14, 9, 5, 1, 4, 8, base], [1, 12, 5, 2, 1, 8, '#333'], [13, 12, 5, 2, 1, 8, '#333']];
}
function deskBoxes(top, side, drawer) {
  return [[0, 11, 0, 32, 2, 16, top], [0, 0, 0, 2, 11, 16, side], [30, 0, 0, 2, 11, 16, side], [19, 4, 1, 11, 7, 14, drawer], [23, 8, 15, 3, 1, 1, '#555'], [23, 5, 15, 3, 1, 1, '#555'], [2, 6, 0, 28, 5, 1, side]];
}
function rug(c1, c2, c3) { return [[0, 0, 0, 32, 0.6, 32, c1], [3, 0.6, 3, 26, 0.2, 26, c2], [6, 0.8, 6, 20, 0.1, 20, c3]]; }
function beanbag(c, c2) { return [[1, 0, 1, 14, 5, 14, c], [2, 5, 3, 12, 3, 11, c2], [1.5, 5, 1, 13, 10, 5, c], [1, 5, 4, 3, 5, 10, c], [12, 5, 4, 3, 5, 10, c]]; }
function bookshelf() {
  const b = [[0, 0, 3, 1.5, 32, 13, WOOD_D], [30.5, 0, 3, 1.5, 32, 13, WOOD_D], [0, 0, 3, 32, 32, 1, WOOD]];
  for (const y of [0, 10.5, 21, 30.5]) b.push([1.5, y, 4, 29, 1.5, 12, WOOD]);
  const cols = ['#c62828', '#1e63c6', '#2e7d32', '#f9a825', '#6a1b9a', '#00838f', '#5d4037', '#e64a19', '#455a64'];
  let k = 0;
  for (const y of [1.5, 12, 22.5]) {
    let x = 2.5;
    while (x < 28) {
      const w = 1.4 + ((k * 7) % 3) * 0.5, h = 6 + ((k * 5) % 4) * 0.8;
      if ((k % 9) === 4) { x += 2; k++; continue; } // espaço vazio
      b.push([x, y, 6, w, h, 9, cols[k % cols.length]]);
      x += w + 0.2; k++;
    }
  }
  return b;
}
function filingCabinet() {
  const b = [[2, 0, 3, 12, 15, 11, '#9aa0a6']];
  for (const y of [1, 5.5, 10]) b.push([2.5, y, 14, 11, 4, 0.3, '#b0b6bc'], [6, y + 2.5, 14.3, 4, 0.6, 0.6, '#555']);
  return b;
}
function wallClock() {
  const b = [[3, 3, 0, 10, 10, 1, '#fafafa'], [3, 2.5, 0, 10, 0.6, 1.4, BLACK], [3, 12.9, 0, 10, 0.6, 1.4, BLACK], [2.5, 3, 0, 0.6, 10, 1.4, BLACK], [12.9, 3, 0, 0.6, 10, 1.4, BLACK],
    [7.6, 8, 1, 0.8, 4, 0.3, BLACK], [8, 7.6, 1, 3, 0.8, 0.3, BLACK], [7.5, 7.5, 1.2, 1, 1, 0.3, RED]];
  for (const [x, y] of [[7.7, 11.5], [7.7, 3.7], [3.7, 7.7], [11.5, 7.7]]) b.push([x, y, 1, 0.6, 0.8, 0.2, '#555']);
  return b;
}
function whiteboard() {
  return [[0, 0, 0, 32, 22, 0.8, '#cfd2d6'], [1, 1, 0.8, 30, 20, 0.3, '#ffffff'],
    [3, 15, 1.1, 12, 0.6, 0.1, '#1e63c6'], [3, 13, 1.1, 9, 0.6, 0.1, '#1e63c6'], [3, 11, 1.1, 14, 0.6, 0.1, '#1e63c6'],
    [19, 9, 1.1, 8, 0.6, 0.1, RED], [19, 15, 1.1, 0.6, 6, 0.1, RED], [26.4, 9, 1.1, 0.6, 6.6, 0.1, RED], [19, 15, 1.1, 8, 0.6, 0.1, RED],
    [4, 5, 1.1, 10, 0.6, 0.1, '#2e7d32'], [4, 3, 1.1, 6, 0.6, 0.1, '#2e7d32'],
    [6, -1, 0, 20, 1, 2.5, '#9aa0a6'], [8, 0, 1, 3, 0.6, 0.6, RED], [12, 0, 1, 3, 0.6, 0.6, '#1e63c6'], [16, 0, 1, 3, 0.6, 0.6, BLACK]];
}
function corkBoard() {
  const b = [[0, 0, 0, 32, 16, 0.8, '#6d4c41'], [1, 1, 0.8, 30, 14, 0.4, '#c8a165']];
  const notes = [[3, 8, '#fff59d'], [9, 9.5, '#b3e5fc'], [15, 7.5, '#f8bbd0'], [22, 9, '#c8e6c9'], [5, 2.5, '#ffffff'], [17, 2, '#fff59d'], [24, 2.5, '#ffe0b2']];
  for (const [x, y, c] of notes) b.push([x, y, 1.2, 5, 4.5, 0.2, c], [x + 2.2, y + 3.8, 1.4, 0.6, 0.6, 0.4, RED]);
  return b;
}
function coffeeMachine() {
  return [[3, 0, 4, 10, 1, 9, '#2b2b2b'], [3, 1, 4, 10, 9, 3, '#2b2b2b'], [3, 7, 7, 10, 3, 6, '#2b2b2b'], [4, 10, 4, 8, 1, 9, '#3a3a3a'],
    [6.5, 1, 9, 3, 3, 3, '#f5f5f5'], [7, 6, 10, 2, 1, 1, '#9aa0a6'], [10, 8, 13, 1, 1, 0.3, '#43a047', 1], [4, 8, 13, 4, 1.4, 0.2, '#81d4fa', 1]];
}
function printer() {
  return [[1, 0, 2, 14, 6, 12, '#e0e0e0'], [2, 6, 3, 12, 1.5, 10, '#bdbdbd'], [3, 7.5, 4, 10, 0.3, 7, WHITE], [3, 2, 14, 10, 1.5, 0.3, '#424242'], [11, 4, 14, 2, 1, 0.3, '#43a047', 1]];
}
function miniFridge() {
  return [[2, 0, 2, 12, 19, 12, '#eceff1'], [2.2, 0.5, 14, 11.6, 18, 0.3, '#f5f7f8'], [11, 6, 14.3, 1, 7, 0.8, '#9aa0a6'], [3, 17, 14.3, 4, 1, 0.2, '#1e63c6']];
}
function microwave() {
  return [[1, 0, 3, 14, 7, 10, '#3a3a3a'], [2, 1, 13, 9, 5, 0.3, '#111'], [2.5, 1.5, 13.3, 8, 4, 0.1, '#263238'], [11, 1, 13, 4, 5, 0.3, '#555'], [12, 4, 13.3, 2, 1, 0.1, '#43a047', 1]];
}
function extinguisher() {
  return [[6, 0, 6, 4, 11, 4, RED], [6.5, 0, 5.5, 3, 11, 5, RED], [7, 11, 7, 2, 1.5, 2, '#333'], [6, 12.5, 7.5, 4, 1, 1, '#333'], [9, 9, 9.5, 1, 3, 1, BLACK], [6.2, 5, 9.9, 3.6, 3, 0.2, WHITE]];
}
function coatRack() {
  return [[5, 0, 5, 6, 1, 6, '#3e2723'], [7.3, 1, 7.3, 1.4, 28, 1.4, '#5d4037'], [5, 26, 7.5, 2.5, 0.8, 1, '#5d4037'], [8.5, 26, 7.5, 2.5, 0.8, 1, '#5d4037'], [7.5, 24, 5, 1, 0.8, 2.5, '#5d4037'],
    [3.5, 15, 6.5, 4, 11, 3, '#1565c0'], [9, 17, 8, 3, 9, 2, '#6d4c41']];
}
function flowerVase(c) {
  return [[6, 0, 6, 4, 5, 4, '#90caf9'], [7.5, 5, 7.5, 1, 4, 1, '#2e7d32'], [5.5, 6, 7.5, 1, 3, 1, '#2e7d32'], [9.5, 6, 7.5, 1, 3, 1, '#2e7d32'],
    [6.5, 9, 6.5, 3, 2, 3, c], [4.5, 9, 6.5, 2, 2, 2, c], [9.5, 9, 7.5, 2, 2, 2, '#fff176'], [7, 11, 7, 2, 1, 2, '#ffeb3b']];
}
function cactus() {
  return [[5, 0, 5, 6, 4, 6, '#d84315'], [5.5, 4, 5.5, 5, 0.5, 5, '#5d4037'], [6.5, 4, 6.5, 3, 13, 3, '#558b2f'], [3.5, 8, 7, 3, 2, 2, '#558b2f'], [3.5, 8, 7, 2, 6, 2, '#689f38'],
    [9.5, 10, 7, 3, 2, 2, '#558b2f'], [10.5, 10, 7, 2, 5, 2, '#689f38'], [7, 17, 7, 2, 1, 2, '#f48fb1']];
}
function monstera() {
  return [[4, 0, 4, 8, 7, 8, '#eeeeee'], [4.5, 7, 4.5, 7, 0.5, 7, '#4a3020'], [7.3, 7, 7.3, 1.4, 10, 1.4, '#33691e'],
    [1, 13, 5, 6, 1, 6, '#2e7d32'], [9, 15, 3, 6, 1, 7, '#388e3c'], [4, 19, 8, 7, 1, 6, '#2e7d32'], [7, 22, 2, 6, 1, 5, '#43a047'], [2, 17, 9, 5, 1, 5, '#1b5e20'], [6, 25, 6, 5, 1, 5, '#388e3c']];
}
function succulent() {
  return [[5, 0, 5, 6, 3, 6, '#f5f5f5'], [6, 3, 6, 4, 1, 4, '#81c784'], [5, 3.5, 7, 2, 1, 2, '#66bb6a'], [9, 3.5, 7, 2, 1, 2, '#66bb6a'], [7, 3.5, 5, 2, 1, 2, '#66bb6a'], [7, 3.5, 9, 2, 1, 2, '#66bb6a'], [7, 4.5, 7, 2, 1, 2, '#a5d6a7']];
}
function indoorTree() {
  return [[4, 0, 4, 8, 6, 8, '#795548'], [4.5, 6, 4.5, 7, 0.5, 7, '#3e2723'], [7.3, 6, 7.3, 1.4, 14, 1.4, '#5d4037'],
    [2, 18, 2, 12, 8, 12, '#2e7d32'], [4, 26, 4, 8, 4, 8, '#388e3c'], [1, 20, 5, 3, 4, 6, '#43a047'], [12, 19, 5, 3, 5, 6, '#1b5e20']];
}
function deskLamp() {
  return [[5, 0, 5, 6, 1, 6, BLACK], [7.5, 1, 7.5, 1, 7, 1, '#424242'], [7.5, 7.5, 7.5, 5, 1, 1, '#424242'], [10, 6, 6, 5, 3, 4, BLACK], [10.5, 5.8, 6.5, 4, 0.3, 3, '#fff6c8', 1]];
}
function headset() {
  return [[6, 0, 5, 4, 0.8, 6, '#333'], [5, 0.8, 5.5, 2, 3, 3, '#212121'], [9, 0.8, 5.5, 2, 3, 3, '#212121'], [5.5, 3.8, 6.5, 5, 1, 1, '#424242'], [5.5, 1, 8.5, 1, 0.6, 3, '#757575']];
}
function bookStack() {
  return [[3, 0, 4, 10, 1.5, 7, '#1e63c6'], [3.5, 1.5, 4.5, 9, 1.5, 6.5, RED], [3, 3, 4, 9.5, 1.2, 7, '#2e7d32'], [4, 4.2, 4.5, 8, 1.3, 6, '#f9a825'], [6, 5.5, 6, 3, 0.3, 2, WHITE]];
}
function waterBottle(c) {
  return [[7, 0, 7, 2.4, 5.5, 2.4, c], [7.2, 5.5, 7.2, 2, 1, 2, '#e0e0e0'], [7.5, 6.5, 7.5, 1.4, 0.6, 1.4, BLACK], [7, 2, 9.4, 2.4, 1.5, 0.1, WHITE]];
}
function recycleBins() {
  const b = [];
  [['#1565c0', 0.5], ['#f9a825', 5.75], ['#c62828', 11]].forEach(([c, x]) => b.push([x, 0, 4, 4.5, 9, 8, c], [x - 0.2, 9, 3.8, 4.9, 0.6, 8.4, '#424242'], [x + 1.25, 5, 12, 2, 2, 0.2, WHITE]));
  return b;
}
function roundTable(top, foot) {
  return [[4, 11, 0, 24, 2, 32, top], [0, 11, 4, 32, 2, 24, top], [2, 11, 2, 28, 2, 28, top], [14, 1, 14, 4, 10, 4, foot], [10, 0, 10, 12, 1, 12, foot]];
}

// ---- sala gamer: itens com neon (a 8ª posição da caixa liga o brilho)
function gamerChair() {
  const base = '#16161a', seat = '#18181d', dark = '#101014', pink = '#ff2bd6';
  return [[2, 0, 7, 12, 1, 2, base], [7, 0, 2, 2, 1, 12, base], [7, 1, 7, 2, 6, 2, '#2a2a30'],
    [2, 7, 2, 12, 2, 12, seat], [2, 9, 2, 2, 3, 11, dark], [12, 9, 2, 2, 3, 11, dark],
    [2.2, 12, 3, 1.6, 0.5, 9, pink, 1], [12.2, 12, 3, 1.6, 0.5, 9, pink, 1],
    [3, 9, 1, 10, 13, 2, seat], [7, 9, 3, 2, 12, 0.5, pink, 1],
    [4, 22, 1, 8, 4, 2.4, dark], [5, 23, 3.4, 6, 2, 0.4, pink, 1],
    [1, 10, 5, 1, 4, 8, base], [14, 10, 5, 1, 4, 8, base]];
}
function gamerPC() {
  return [[4, 0, 1, 8, 15, 14, '#141418'], [4.3, 1, 15, 7.4, 13, 0.5, '#0b1620'],
    [5, 2, 15.4, 6, 2, 0.3, '#14e8ff', 1], [5, 6, 15.4, 6, 2, 0.3, '#ff2bd6', 1], [5, 10, 15.4, 6, 2, 0.3, '#9a4dff', 1],
    [4.2, 1, 15.4, 0.5, 13, 0.3, '#2dff6a', 1], [11.3, 1, 15.4, 0.5, 13, 0.3, '#2dff6a', 1]];
}
function arcadeCabinet() {
  const body = '#17172b';
  return [[1, 0, 2, 14, 11, 12, body], [1, 11, 6, 14, 3, 9, '#262648'],
    [3, 14, 10, 2, 1, 2, '#ff2a3d', 1], [7, 14, 10, 2, 1, 2, '#ffe23a', 1], [11, 14, 10, 2, 1, 2, '#14e8ff', 1],
    [1, 14, 2, 14, 14, 8, body], [2, 15, 10, 12, 11, 0.4, '#0a0a12'], [3, 16, 10.4, 10, 9, 0.3, '#1fb6ff', 1],
    [6, 19, 10.7, 4, 3, 0.3, '#ff2bd6', 1], [4, 17, 10.7, 2, 1, 0.3, '#ffffff', 1], [10, 17, 10.7, 2, 1, 0.3, '#ffffff', 1],
    [1, 28, 2, 14, 3, 10, body], [2, 28.5, 12, 12, 2, 0.4, '#ff2bd6', 1],
    [0.4, 2, 4, 0.6, 26, 8, '#ff2bd6', 1], [15, 2, 4, 0.6, 26, 8, '#14e8ff', 1]];
}
function gameConsole() {
  return [[2, 0, 3, 12, 1.6, 10, '#101014'], [2, 0.5, 13, 12, 0.5, 0.3, '#14e8ff', 1], [3, 1.1, 13, 1, 0.4, 0.3, '#2dff6a', 1], [4, 1, 13, 6, 0.3, 0.3, '#000000']];
}
function gamepad() {
  return [[4, 0, 5, 8, 1, 5, '#1a1a22'], [3, 0, 5, 2, 1.2, 6, '#1a1a22'], [11, 0, 5, 2, 1.2, 6, '#1a1a22'],
    [5.2, 1, 6.5, 1.6, 0.6, 1.6, '#0b0b10'], [9.2, 1, 6.5, 1.6, 0.6, 1.6, '#0b0b10'],
    [7.2, 1, 8, 0.8, 0.5, 0.8, '#2dff6a', 1], [8.2, 1, 8.6, 0.8, 0.5, 0.8, '#ff2a3d', 1], [6.2, 1, 8.6, 0.8, 0.5, 0.8, '#14e8ff', 1]];
}
function ledTower() {
  return [[5, 0, 5, 6, 1, 6, '#18181c'], [6, 1, 6, 4, 10, 4, '#14e8ff', 1], [6, 11, 6, 4, 10, 4, '#9a4dff', 1], [6, 21, 6, 4, 10, 4, '#ff2bd6', 1], [5, 31, 5, 6, 1, 6, '#18181c']];
}
// letras de 3x5 "pixels" para placas de neon: cada pixel aceso vira uma caixa que brilha
const FONT3x5 = {
  G: ['XXX', 'X..', 'X.X', 'X.X', 'XXX'], A: ['XXX', 'X.X', 'XXX', 'X.X', 'X.X'], M: ['X.X', 'XXX', 'XXX', 'X.X', 'X.X'],
  E: ['XXX', 'X..', 'XXX', 'X..', 'XXX'], R: ['XXX', 'X.X', 'XXX', 'XX.', 'X.X'], O: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
  N: ['XX.', 'X.X', 'X.X', 'X.X', 'X.X'], ' ': ['...', '...', '...', '...', '...'],
};
function neonSign(text, color, px) {
  const W = 64, total = text.length * 3 + (text.length - 1);
  const x0 = (W - total * px) / 2, y0 = (16 - 5 * px) / 2;
  const b = [[0, 0, 0, W, 16, 0.8, '#0b0b12']]; // placa escura atrás das letras
  [...text].forEach((ch, i) => FONT3x5[ch].forEach((row, r) => [...row].forEach((c, k) => {
    if (c === 'X') b.push([x0 + (i * 4 + k) * px, y0 + (4 - r) * px, 0.8, px, px, 0.7, color, 1]);
  })));
  return b;
}

// ---- setup minimalista: PC de topo e caixa de som de torre (sem RGB; só um LED branco discreto)
function pcTorre() {
  const dark = '#121316', glass = '#0c1014', white = '#e6eef6';
  return [[3, 0, 1, 10, 15, 14, dark], [3.4, 1, 15, 9.2, 13, 0.5, glass],
    [5.5, 2, 15.4, 5, 5, 0.3, white, 1], [6.8, 3.3, 15.7, 2.4, 2.4, 0.3, dark],
    [5.5, 8.5, 15.4, 5, 5, 0.3, white, 1], [6.8, 9.8, 15.7, 2.4, 2.4, 0.3, dark],
    [3.2, 1, 15.4, 0.4, 13, 0.3, '#ffffff', 1], [4, 15, 3, 8, 0.3, 10, '#1d1f24'], [3, 0, 14, 10, 1, 1, '#1d1f24']];
}
function caixaSom() {
  const wood = '#6b4a32', fabric = '#3a3d42', hole = '#1b1c1f';
  return [[4.5, 0, 3.5, 7, 1, 9, '#26282c'], [5, 1, 4, 6, 21, 8, wood], [5.4, 2, 12, 5.2, 19, 0.4, fabric],
    [7, 17, 12.4, 2, 2, 0.3, hole], [6, 8, 12.4, 4, 4, 0.3, hole], [7.2, 9.2, 12.7, 1.6, 1.6, 0.3, '#2a2c30'],
    [7.6, 3, 12.4, 0.8, 0.5, 0.3, '#ffffff', 1]];
}

export const DECOR = {
  // ---------- móveis
  mesa: { name: 'Mesa de madeira', icon: '🪵', cat: 'deco', size: [2, 0.81, 1], boxes: [[0, 11, 0, 32, 2, 16, WOOD], ...legs4(32, 16, 11, WOOD_D)] },
  mesa_escritorio: {
    name: 'Mesa de escritório', icon: '🗄️', cat: 'deco', size: [2, 0.81, 1],
    boxes: [[0, 11, 0, 32, 2, 16, '#ececec'], [0, 0, 0, 2, 11, 16, '#cfd2d6'], [30, 0, 0, 2, 11, 16, '#cfd2d6'], [19, 4, 1, 11, 7, 14, '#dfe2e6'], [23, 8, 15, 3, 1, 1, '#555'], [23, 5, 15, 3, 1, 1, '#555'], [2, 6, 0, 28, 5, 1, '#cfd2d6']],
  },
  cadeira: {
    name: 'Cadeira', icon: '🪑', cat: 'deco', size: [1, 1.19, 1], sit: 10 / 16,
    boxes: [...legs4(16, 16, 8, WOOD_D, 2, 2), [2, 8, 2, 12, 2, 12, WOOD], [2, 10, 2, 2, 9, 2, WOOD_D], [12, 10, 2, 2, 9, 2, WOOD_D], [2, 14, 2, 12, 5, 2, WOOD]],
  },
  cadeira_escritorio: {
    name: 'Cadeira de escritório', icon: '💺', cat: 'deco', size: [1, 1.38, 1], sit: 9 / 16,
    boxes: [[2, 0, 7, 12, 1, 2, '#222'], [7, 0, 2, 2, 1, 12, '#222'], [7, 1, 7, 2, 6, 2, '#3a3a3a'], [2, 7, 2, 12, 2, 12, '#2b3a55'], [3, 9, 1, 10, 13, 2, '#2b3a55'], [1, 9, 5, 1, 4, 8, '#222'], [14, 9, 5, 1, 4, 8, '#222'], [1, 12, 5, 2, 1, 8, '#333'], [13, 12, 5, 2, 1, 8, '#333']],
  },
  sofa: {
    name: 'Sofá', icon: '🛋️', cat: 'deco', size: [2, 1, 1], sit: 8 / 16,
    boxes: [[0, 0, 1, 32, 5, 15, '#4a6fa5'], [3, 5, 4, 26, 3, 12, '#5b80b6'], [0, 5, 0, 32, 11, 4, '#4a6fa5'], [0, 5, 0, 3, 7, 16, '#3f6292'], [29, 5, 0, 3, 7, 16, '#3f6292'], ...legs4(32, 16, 1, '#2b2b2b', 2, 1)],
  },
  pufe: { name: 'Pufe', icon: '🟠', cat: 'deco', size: [1, 0.5, 1], sit: 8 / 16, boxes: [[3, 0, 3, 10, 7, 10, '#e67e22'], [3.5, 7, 3.5, 9, 1, 9, '#f0954a']] },
  monitor: {
    name: 'Monitor', icon: '🖥️', cat: 'deco', size: [1, 0.81, 1],
    boxes: [[4, 0, 5, 8, 1, 6, '#222'], [7, 1, 6, 2, 4, 2, '#2a2a2a'], [0, 4, 7, 16, 9, 2, '#1b1b1f'], [1, 5, 9, 14, 7, 0.4, '#3d7bd9', 1], [2, 9, 9.3, 7, 1, 0.3, '#9cc3ff', 1], [2, 7, 9.3, 10, 1, 0.3, '#9cc3ff', 1]],
  },
  monitor_duplo: {
    name: 'Monitor duplo', icon: '🖥️', cat: 'deco', size: [2, 0.81, 1],
    boxes: [[12, 0, 5, 8, 1, 6, '#222'], [15, 1, 6, 2, 4, 2, '#2a2a2a'], [1, 4, 7, 15, 9, 2, '#1b1b1f'], [16, 4, 7, 15, 9, 2, '#1b1b1f'], [2, 5, 9, 13, 7, 0.4, '#3d7bd9', 1], [17, 5, 9, 13, 7, 0.4, '#2fb3a0', 1]],
  },
  teclado: { name: 'Teclado e mouse', icon: '⌨️', cat: 'deco', size: [1, 0.08, 1], boxes: [[0.5, 0, 6, 11, 0.8, 5, '#2a2a2a'], [1.5, 0.8, 7, 9, 0.3, 3, '#5a5a5a'], [13, 0, 7, 2, 0.8, 3, '#2a2a2a']] },
  notebook: { name: 'Notebook', icon: '💻', cat: 'deco', size: [1, 0.56, 1], boxes: [[2, 0, 5, 12, 0.6, 9, '#9aa0a6'], [2, 0.6, 4, 12, 8.4, 0.6, '#9aa0a6'], [3, 1.5, 4.6, 10, 6.5, 0.2, '#5aa0ff', 1], [3, 0.6, 7, 10, 0.2, 5, '#6b7178']] },
  caneca: { name: 'Caneca de café', icon: '☕', cat: 'deco', size: [1, 0.25, 1], boxes: [[6, 0, 6, 4, 4, 4, '#f5f5f5'], [10, 1, 7.5, 1, 2, 1, '#f5f5f5'], [6.5, 3.6, 6.5, 3, 0.4, 3, '#5d3a1a']] },
  painel_ripado: { name: 'Painel ripado (3 de altura)', icon: '🪵', cat: 'deco', size: [1, 3, 0.125], wall: true, boxes: slatPanel(48) },
  painel_ripado_alto: { name: 'Painel ripado (chão ao teto)', icon: '🪵', cat: 'deco', size: [1, 5, 0.125], wall: true, boxes: slatPanel(80) },
  lata_energetico: { name: 'Lata de energético', icon: '🥫', cat: 'deco', size: [1, 0.24, 1], boxes: energyCan('#141414', '#7CFF2E', '#b9bec4') },
  lata_energetico_branca: { name: 'Lata de energético (zero)', icon: '🥫', cat: 'deco', size: [1, 0.24, 1], boxes: energyCan('#f2f4f5', '#2FA8FF', '#b9bec4') },
  planta: {
    name: 'Planta', icon: '🪴', cat: 'deco', size: [1, 1.13, 1],
    boxes: [[4, 0, 4, 8, 5, 8, '#b5651d'], [5, 5, 5, 6, 0.5, 6, '#4a3020'], [6, 5, 6, 4, 8, 4, '#3d9142'], [3, 9, 6, 4, 4, 4, '#4caf50'], [9, 8, 5, 4, 5, 4, '#357a38'], [6, 12, 7, 4, 6, 3, '#4caf50'], [7, 10, 2, 3, 3, 3, '#43a047']],
  },
  luminaria: { name: 'Luminária de chão', icon: '💡', cat: 'deco', size: [1, 1.88, 1], boxes: [[5, 0, 5, 6, 1, 6, '#333'], [7.5, 1, 7.5, 1, 23, 1, '#444'], [4, 24, 4, 8, 6, 8, '#f3e2b8'], [5.5, 23.5, 5.5, 5, 0.5, 5, '#fff6c8', 1]] },
  tapete: { name: 'Tapete', icon: '🟥', cat: 'deco', size: [2, 0.05, 2], boxes: [[0, 0, 0, 32, 0.6, 32, '#8e3b46'], [3, 0.6, 3, 26, 0.2, 26, '#b5585f'], [6, 0.8, 6, 20, 0.1, 20, '#8e3b46']] },
  lixeira: { name: 'Lixeira', icon: '🗑️', cat: 'deco', size: [1, 0.6, 1], boxes: [[4, 0, 4, 8, 9, 8, '#6b7280'], [4.5, 9, 4.5, 7, 0.5, 7, '#4b5563']] },
  bebedouro: { name: 'Bebedouro', icon: '🚰', cat: 'deco', size: [1, 1.5, 1], boxes: [[3, 0, 3, 10, 16, 10, '#e5e7eb'], [4, 16, 4, 8, 8, 8, '#7fc8f8'], [5, 24, 5, 6, 0.5, 6, '#2d6fa3'], [6, 10, 13, 4, 2, 0.5, '#555']] },
  quadro: { name: 'Quadro com imagem', icon: '🖼️', cat: 'deco', size: [2, 1, 0.125], wall: true, picture: true, boxes: [] },
  porta: { name: 'Porta automática (2 de largura)', icon: '🚪', cat: 'deco', size: [2, 3, 1], door: true, boxes: [] },
  kanban: { name: 'Quadro Kanban do time', icon: '📌', cat: 'deco', size: [6, 3, 0.125], wall: true, kanban: 'time', boxes: [] },
  kanban_meu: { name: 'Minhas tarefas (Kanban)', icon: '✅', cat: 'deco', size: [3, 2, 0.125], wall: true, kanban: 'meu', boxes: [] },
  // sala gamer
  cadeira_gamer: { name: 'Cadeira gamer', icon: '🎮', cat: 'deco', size: [1, 1.65, 1], sit: 9 / 16, boxes: gamerChair() },
  gabinete_gamer: { name: 'PC gamer (gabinete RGB)', icon: '🖥️', cat: 'deco', size: [1, 0.95, 1], boxes: gamerPC() },
  arcade: { name: 'Fliperama (arcade)', icon: '🕹️', cat: 'deco', size: [1, 1.95, 1], boxes: arcadeCabinet() },
  torre_led: { name: 'Coluna de LED RGB', icon: '🌈', cat: 'deco', size: [1, 2, 1], boxes: ledTower() },
  neon_gamer: { name: 'Placa de neon: GAMER', icon: '💗', cat: 'deco', size: [4, 1, 0.125], wall: true, boxes: neonSign('GAMER', '#ff2bd6', 3) },
  neon_game_on: { name: 'Placa de neon: GAME ON', icon: '💙', cat: 'deco', size: [4, 1, 0.125], wall: true, boxes: neonSign('GAME ON', '#14e8ff', 2) },
  console_game: { name: 'Videogame (console)', icon: '🎮', cat: 'objetos', size: [1, 0.12, 1], boxes: gameConsole() },
  controle_game: { name: 'Controle de videogame', icon: '🎮', cat: 'objetos', size: [1, 0.08, 1], boxes: gamepad() },
  // setup minimalista
  pc_torre: { name: 'PC torre (top de linha)', icon: '🖥️', cat: 'deco', size: [1, 0.95, 1], boxes: pcTorre() },
  caixa_som: { name: 'Caixa de som (torre)', icon: '🔊', cat: 'deco', size: [1, 1.4, 1], boxes: caixaSom() },
  tv: { name: 'Tela (TV) para compartilhar', icon: '📺', cat: 'deco', size: [4, 2, 0.125], wall: true, tv: true, boxes: [] },
  lousa: { name: 'Quadro branco interativo (desenhar)', icon: '✏️', cat: 'deco', size: [3, 2, 0.125], wall: true, lousa: true, boxes: [] },
  alertas: { name: 'Painel de alertas (chamados)', icon: '🚨', cat: 'deco', size: [3, 2, 0.125], wall: true, kanban: 'alertas', boxes: [] },
  // ---------- variações de móveis
  sofa_cinza: { name: 'Sofá cinza', icon: '🛋️', cat: 'deco', size: [2, 1, 1], sit: 8 / 16, boxes: sofaBoxes('#6b7280', '#858c97', '#5a616c') },
  sofa_verde: { name: 'Sofá verde', icon: '🛋️', cat: 'deco', size: [2, 1, 1], sit: 8 / 16, boxes: sofaBoxes('#2f6b4f', '#3d8562', '#275a42') },
  sofa_couro: { name: 'Sofá de couro', icon: '🛋️', cat: 'deco', size: [2, 1, 1], sit: 8 / 16, boxes: sofaBoxes('#6d3f22', '#83502e', '#5a331b') },
  sofa_grande: { name: 'Sofá de 3 lugares', icon: '🛋️', cat: 'deco', size: [3, 1, 1], sit: 8 / 16, boxes: sofaBoxes('#4a6fa5', '#5b80b6', '#3f6292', 48) },
  poltrona: { name: 'Poltrona', icon: '🛋️', cat: 'deco', size: [1, 1, 1], sit: 8 / 16, boxes: sofaBoxes('#b23a48', '#c95463', '#9a2f3c', 16) },
  poltrona_mostarda: { name: 'Poltrona mostarda', icon: '🛋️', cat: 'deco', size: [1, 1, 1], sit: 8 / 16, boxes: sofaBoxes('#c99a2e', '#ddb042', '#ad8326', 16) },
  pufe_azul: { name: 'Pufe azul', icon: '🔵', cat: 'deco', size: [1, 0.5, 1], sit: 8 / 16, boxes: [[3, 0, 3, 10, 7, 10, '#1e88e5'], [3.5, 7, 3.5, 9, 1, 9, '#42a5f5']] },
  pufe_verde: { name: 'Pufe verde', icon: '🟢', cat: 'deco', size: [1, 0.5, 1], sit: 8 / 16, boxes: [[3, 0, 3, 10, 7, 10, '#43a047'], [3.5, 7, 3.5, 9, 1, 9, '#66bb6a']] },
  pufe_roxo: { name: 'Pufe roxo', icon: '🟣', cat: 'deco', size: [1, 0.5, 1], sit: 8 / 16, boxes: [[3, 0, 3, 10, 7, 10, '#8e24aa'], [3.5, 7, 3.5, 9, 1, 9, '#ab47bc']] },
  puff_saco: { name: 'Puff de saco (beanbag)', icon: '🫘', cat: 'deco', size: [1, 0.94, 1], sit: 7 / 16, boxes: beanbag('#e64a19', '#ff7043') },
  puff_saco_cinza: { name: 'Puff de saco cinza', icon: '🫘', cat: 'deco', size: [1, 0.94, 1], sit: 7 / 16, boxes: beanbag('#546e7a', '#78909c') },
  cadeira_escritorio_preta: { name: 'Cadeira de escritório preta', icon: '💺', cat: 'deco', size: [1, 1.38, 1], sit: 9 / 16, boxes: officeChair('#262626') },
  cadeira_escritorio_vermelha: { name: 'Cadeira de escritório vermelha', icon: '💺', cat: 'deco', size: [1, 1.38, 1], sit: 9 / 16, boxes: officeChair('#a12b2b') },
  cadeira_escritorio_cinza: { name: 'Cadeira de escritório cinza', icon: '💺', cat: 'deco', size: [1, 1.38, 1], sit: 9 / 16, boxes: officeChair('#8a9099', '#555') },
  mesa_escritorio_madeira: { name: 'Mesa de escritório (madeira)', icon: '🗄️', cat: 'deco', size: [2, 0.81, 1], boxes: deskBoxes('#b07a45', '#8a5d33', '#9c6b3c') },
  mesa_escritorio_preta: { name: 'Mesa de escritório (preta)', icon: '🗄️', cat: 'deco', size: [2, 0.81, 1], boxes: deskBoxes('#2d2d30', '#1f1f22', '#3a3a3e') },
  mesa_centro: { name: 'Mesa de centro', icon: '🪵', cat: 'deco', size: [2, 0.4, 1], boxes: [[1, 5, 1, 30, 1.5, 14, WOOD], [2, 1.5, 2, 28, 0.8, 12, WOOD_D], ...legs4(32, 16, 5, WOOD_D, 1.5, 2)] },
  mesa_redonda: { name: 'Mesa redonda de reunião', icon: '⭕', cat: 'deco', size: [2, 0.81, 2], boxes: roundTable('#ececec', '#9aa0a6') },
  mesa_redonda_madeira: { name: 'Mesa redonda (madeira)', icon: '⭕', cat: 'deco', size: [2, 0.81, 2], boxes: roundTable(WOOD, WOOD_D) },
  tapete_azul: { name: 'Tapete azul', icon: '🟦', cat: 'deco', size: [2, 0.05, 2], boxes: rug('#2c4f7c', '#4a72a8', '#2c4f7c') },
  tapete_cinza: { name: 'Tapete cinza', icon: '⬜', cat: 'deco', size: [2, 0.05, 2], boxes: rug('#6b7280', '#9aa0a6', '#6b7280') },
  tapete_verde: { name: 'Tapete verde', icon: '🟩', cat: 'deco', size: [2, 0.05, 2], boxes: rug('#2f6b4f', '#4e9a72', '#2f6b4f') },
  estante: { name: 'Estante com livros', icon: '📚', cat: 'deco', size: [2, 2, 1], boxes: bookshelf() },
  gaveteiro: { name: 'Arquivo / gaveteiro', icon: '🗄️', cat: 'deco', size: [1, 0.94, 1], boxes: filingCabinet() },
  quadro_branco: { name: 'Quadro branco', icon: '⬜', cat: 'deco', size: [2, 1.44, 0.125], wall: true, boxes: whiteboard().map(([x, y, ...r]) => [x, y + 1, ...r]) }, // +1: a bandeja de canetas fica embaixo
  mural: { name: 'Mural de recados (cortiça)', icon: '📌', cat: 'deco', size: [2, 1, 0.125], wall: true, boxes: corkBoard() },
  relogio: { name: 'Relógio de parede', icon: '🕒', cat: 'deco', size: [1, 1, 0.125], wall: true, boxes: wallClock() },
  cabideiro: { name: 'Cabideiro', icon: '🧥', cat: 'deco', size: [1, 1.81, 1], boxes: coatRack() },
  // ---------- objetos e plantas
  cafeteira: { name: 'Cafeteira', icon: '☕', cat: 'objetos', size: [1, 0.69, 1], boxes: coffeeMachine() },
  impressora: { name: 'Impressora', icon: '🖨️', cat: 'objetos', size: [1, 0.5, 1], boxes: printer() },
  frigobar: { name: 'Frigobar', icon: '🧊', cat: 'objetos', size: [1, 1.19, 1], boxes: miniFridge() },
  microondas: { name: 'Micro-ondas', icon: '📦', cat: 'objetos', size: [1, 0.44, 1], boxes: microwave() },
  extintor: { name: 'Extintor', icon: '🧯', cat: 'objetos', size: [1, 0.84, 1], boxes: extinguisher() },
  lixeiras_reciclagem: { name: 'Lixeiras de reciclagem', icon: '♻️', cat: 'objetos', size: [1, 0.6, 1], boxes: recycleBins() },
  luminaria_mesa: { name: 'Luminária de mesa', icon: '💡', cat: 'objetos', size: [1, 0.56, 1], boxes: deskLamp() },
  headset: { name: 'Headset', icon: '🎧', cat: 'objetos', size: [1, 0.3, 1], boxes: headset() },
  livros: { name: 'Pilha de livros', icon: '📚', cat: 'objetos', size: [1, 0.36, 1], boxes: bookStack() },
  garrafa: { name: 'Garrafa de água', icon: '🧴', cat: 'objetos', size: [1, 0.44, 1], boxes: waterBottle('#1e88e5') },
  garrafa_rosa: { name: 'Garrafa de água rosa', icon: '🧴', cat: 'objetos', size: [1, 0.44, 1], boxes: waterBottle('#ec407a') },
  caneca_azul: { name: 'Caneca azul', icon: '☕', cat: 'objetos', size: [1, 0.25, 1], boxes: [[6, 0, 6, 4, 4, 4, '#1e63c6'], [10, 1, 7.5, 1, 2, 1, '#1e63c6'], [6.5, 3.6, 6.5, 3, 0.4, 3, '#5d3a1a']] },
  caneca_laranja: { name: 'Caneca laranja', icon: '☕', cat: 'objetos', size: [1, 0.25, 1], boxes: [[6, 0, 6, 4, 4, 4, '#f37021'], [10, 1, 7.5, 1, 2, 1, '#f37021'], [6.5, 3.6, 6.5, 3, 0.4, 3, '#5d3a1a']] },
  vaso_flores: { name: 'Vaso de flores', icon: '💐', cat: 'objetos', size: [1, 0.75, 1], boxes: flowerVase('#e91e63') },
  vaso_flores_amarelas: { name: 'Vaso de flores amarelas', icon: '🌼', cat: 'objetos', size: [1, 0.75, 1], boxes: flowerVase('#fbc02d') },
  cacto: { name: 'Cacto', icon: '🌵', cat: 'objetos', size: [1, 1.13, 1], boxes: cactus() },
  costela_adao: { name: 'Costela-de-adão', icon: '🌿', cat: 'objetos', size: [1, 1.63, 1], boxes: monstera() },
  suculenta: { name: 'Suculenta (de mesa)', icon: '🪴', cat: 'objetos', size: [1, 0.34, 1], boxes: succulent() },
  arvore_interna: { name: 'Árvore de interior', icon: '🌳', cat: 'objetos', size: [1, 1.88, 1], boxes: indoorTree() },
  // ---------- Natal
  arvore_natal: { name: 'Árvore de Natal', icon: '🎄', cat: 'natal', size: [2, 2.85, 2], boxes: christmasTree() },
  presente: { name: 'Presente vermelho', icon: '🎁', cat: 'natal', size: [1, 0.63, 1], boxes: gift('#c62828', GOLD) },
  presente_azul: { name: 'Presente azul', icon: '🎁', cat: 'natal', size: [1, 0.63, 1], boxes: gift('#1e63c6', '#ffffff') },
  presente_verde: { name: 'Presente verde', icon: '🎁', cat: 'natal', size: [1, 0.63, 1], boxes: gift('#2e7d32', RED) },
  boneco_neve: {
    name: 'Boneco de neve', icon: '⛄', cat: 'natal', size: [1, 1.94, 1],
    boxes: [[2, 0, 2, 12, 11, 12, SNOW], [3.5, 11, 3.5, 9, 8, 9, SNOW], [5, 19, 5, 6, 6, 6, SNOW], [4, 25, 4, 8, 1, 8, '#222'], [5.5, 26, 5.5, 5, 5, 5, '#222'], [5.4, 26, 5.4, 5.2, 1, 5.2, RED],
      [7.5, 21, 11, 1, 1, 3, '#e67e22'], [6, 23, 11, 1, 1, 0.5, '#111'], [9, 23, 11, 1, 1, 0.5, '#111'], [7.5, 14, 12.5, 1, 1, 0.5, '#111'], [7.5, 16.5, 12.5, 1, 1, 0.5, '#111'], [4.5, 18, 4.5, 7, 1.5, 7, RED], [9, 15, 12, 2, 4, 1, RED]],
  },
  guirlanda: {
    name: 'Guirlanda', icon: '💚', cat: 'natal', size: [1, 0.88, 0.125], wall: true,
    boxes: [[2, 2, 0, 12, 3, 2, GREEN], [2, 11, 0, 12, 3, 2, GREEN], [2, 5, 0, 3, 6, 2, GREEN], [11, 5, 0, 3, 6, 2, GREEN], [3, 12, 2, 1, 1, 1, RED, 1], [10, 3, 2, 1, 1, 1, RED, 1], [12, 8, 2, 1, 1, 1, GOLD, 1], [3, 6, 2, 1, 1, 1, GOLD, 1], [6, 1, 1.5, 4, 3, 1, RED], [5, 0, 1.6, 2, 2, 0.8, RED], [9, 0, 1.6, 2, 2, 0.8, RED]],
  },
  meia: { name: 'Meia de Natal', icon: '🧦', cat: 'natal', size: [1, 1, 0.125], wall: true, boxes: [[6, 4, 0, 5, 9, 2, RED], [3, 2, 0, 8, 4, 2, RED], [5, 12, 0, 7, 3, 2.3, '#fafafa'], [8, 5, 2, 1, 1, 0.3, GOLD]] },
  pisca: { name: 'Pisca-pisca', icon: '✨', cat: 'natal', size: [1, 0.5, 0.125], wall: true, boxes: fairyLights() },
  bengala: { name: 'Bengala doce', icon: '🍬', cat: 'natal', size: [1, 1.06, 1], boxes: candyCane() },
  papai_noel: { name: 'Papai Noel', icon: '🎅', cat: 'natal', size: [1, 2, 1], boxes: santa() },
  rena: { name: 'Rena', icon: '🦌', cat: 'natal', size: [1, 1.81, 2], boxes: reindeer() },
  treno: { name: 'Trenó com presentes', icon: '🛷', cat: 'natal', size: [1, 1.06, 2], boxes: sleigh() },
  arvore_grande: { name: 'Árvore de Natal gigante', icon: '🎄', cat: 'natal', size: [3, 4.3, 3], boxes: bigTree() },
  pinheiro_neve: { name: 'Pinheiro com neve', icon: '🌲', cat: 'natal', size: [1, 1.88, 1], boxes: snowyPine() },
  presentes_pilha: { name: 'Pilha de presentes', icon: '🎁', cat: 'natal', size: [1, 0.94, 1], boxes: giftStack() },
  festao: { name: 'Festão com luzes (parede)', icon: '🎊', cat: 'natal', size: [1, 0.35, 0.125], wall: true, boxes: festoon() },
  sinos: { name: 'Sinos de Natal', icon: '🔔', cat: 'natal', size: [1, 0.66, 0.125], wall: true, boxes: bells() },
  bolas_penduradas: { name: 'Bolas penduradas (logo abaixo do teto)', icon: '🔴', cat: 'natal', size: [1, 1, 1], boxes: baubles() },
  vela: { name: 'Velas', icon: '🕯️', cat: 'natal', size: [1, 0.34, 1], boxes: candles() },
  biscoito: { name: 'Biscoito de gengibre', icon: '🍪', cat: 'natal', size: [1, 0.49, 1], boxes: gingerbread() },
  neve: { name: 'Neve no chão', icon: '❄️', cat: 'natal', size: [2, 0.06, 2], boxes: snowPatch() },
  estrela: { name: 'Estrela', icon: '⭐', cat: 'natal', size: [1, 1, 0.125], wall: true, boxes: [[6, 2, 0, 4, 12, 1.5, GOLD, 1], [2, 8, 0, 12, 3, 1.5, GOLD, 1], [4, 4, 0, 3, 4, 1.5, GOLD, 1], [9, 4, 0, 3, 4, 1.5, GOLD, 1]] },
};
export const DECOR_IDS = Object.keys(DECOR).map(k => 'd:' + k);

// junta várias caixas [largura, altura, profundidade, x, y, z, cor?] numa geometria só (1 desenho em vez de vários).
// Com cor (THREE.Color), grava cores por vértice (para materiais com vertexColors).
function mergeBoxes(parts) {
  const pos = [], nor = [], uv = [], idx = [], col = [];
  const colored = parts.some(p => p[6]);
  for (const [w, h, d, x, y, z, c] of parts) {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z);
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array);
    if (colored) for (let i = 0; i < g.attributes.position.count; i++) col.push(c ? c.r : 1, c ? c.g : 1, c ? c.b : 1);
    for (const i of g.index.array) idx.push(base + i);
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (colored) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

export function decorMeta(id) {
  const k = id.startsWith('d:') ? id.slice(2) : null;
  const d = k && DECOR[k];
  return d ? { id, name: d.name, size: d.size.slice(), builtin: true, icon: d.icon, cat: d.cat, wall: !!d.wall, sit: d.sit || 0, picture: !!d.picture, door: !!d.door, kanban: d.kanban || null, tv: !!d.tv, lousa: !!d.lousa } : null;
}

// ---- Tela (TV) fina na parede: moldura cinza-escura, tela preta; o vídeo compartilhado aparece por cima (screens.js)
export const TV_DEPTH = 0.08, TV_BORDER = 0.06;
const tvFrameMat = new THREE.MeshLambertMaterial({ color: 0x2b2b30 });
const tvGlassMat = new THREE.MeshBasicMaterial({ color: 0x050507 });
export function buildTv(w, h) {
  const group = new THREE.Group();
  const z = -0.5 + TV_DEPTH / 2;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, TV_DEPTH), tvFrameMat);
  frame.position.set(0, h / 2, z); group.add(frame);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * TV_BORDER, h - 2 * TV_BORDER), tvGlassMat);
  glass.position.set(0, h / 2, -0.5 + TV_DEPTH + 0.004); group.add(glass);
  // LED de "ligada" no canto de baixo
  const led = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.02), new THREE.MeshBasicMaterial({ color: 0x3ba55c }));
  led.position.set(w / 2 - 0.12, 0.03, -0.5 + TV_DEPTH + 0.004); group.add(led);
  return group;
}

// ---- quadro Kanban na parede: moldura + canvas desenhado com as tarefas
export function buildKanbanBoard(w, h, frameColor = 0x2b2b30) {
  const group = new THREE.Group();
  const depth = 0.08, z = -0.5 + depth / 2;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), new THREE.MeshLambertMaterial({ color: frameColor }));
  frame.position.set(0, h / 2, z); group.add(frame);
  const ppb = Math.min(200, Math.floor(4096 / Math.max(w, h))); // pixels por bloco
  const canvas = document.createElement('canvas'); canvas.width = Math.round((w - 0.12) * ppb); canvas.height = Math.round((h - 0.12) * ppb);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.12, h - 0.12), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.set(0, h / 2, -0.5 + depth + 0.005); group.add(screen);
  group.userData.kanban = { canvas, tex };
  return group;
}

// ---- porta automática: folhas que deslizam para dentro da parede; cadeado quando a sala está trancada
let lockTex = null;
function padlockTexture() {
  if (lockTex) return lockTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.lineWidth = 7; x.strokeStyle = '#7a1414';
  x.beginPath(); x.arc(32, 26, 12, Math.PI, 0); x.lineTo(44, 34); x.moveTo(20, 26); x.lineTo(20, 34); x.stroke();
  x.fillStyle = '#e53935'; x.strokeStyle = '#7a1414'; x.lineWidth = 3;
  x.beginPath(); x.roundRect(10, 30, 44, 30, 7); x.fill(); x.stroke();
  x.fillStyle = '#7a1414'; x.fillRect(29, 38, 6, 12);
  lockTex = new THREE.CanvasTexture(c); lockTex.colorSpace = THREE.SRGBColorSpace;
  return lockTex;
}
const DOOR_WOOD = new THREE.Color(0x8a5a33), DOOR_METAL = new THREE.Color(0x9aa0a6);
const doorSolid = new THREE.MeshLambertMaterial({ vertexColors: true });
const doorGlass = new THREE.MeshLambertMaterial({ color: 0xa9d6ea, transparent: true, opacity: 0.55 });
export function buildDoor(w, h) {
  const group = new THREE.Group();
  const leaves = [];
  const n = w >= 2 ? 2 : 1, lw = w / n, T = 0.12;
  for (let k = 0; k < n; k++) {
    const leaf = new THREE.Group();
    const dir = n === 1 ? -1 : (k === 0 ? -1 : 1); // para que lado desliza
    const base = -w / 2 + lw / 2 + k * lw;
    leaf.position.x = base;
    const hh = h - 0.02, gy = hh * 0.45 + (hh * 0.55 - 0.1) / 2, gh = hh * 0.55 - 0.1;
    // madeira + puxador numa geometria só (cores por vértice) e o vidro: 2 desenhos por folha
    leaf.add(new THREE.Mesh(mergeBoxes([
      [lw - 0.02, hh * 0.45, T, 0, hh * 0.225, 0, DOOR_WOOD], [lw - 0.02, 0.1, T, 0, hh - 0.05, 0, DOOR_WOOD],
      [0.08, gh, T, -lw / 2 + 0.05, gy, 0, DOOR_WOOD], [0.08, gh, T, lw / 2 - 0.05, gy, 0, DOOR_WOOD],
      [0.06, 0.3, T + 0.06, -dir * (lw / 2 - 0.12), hh * 0.45, 0, DOOR_METAL],
    ]), doorSolid));
    leaf.add(new THREE.Mesh(mergeBoxes([[lw - 0.16, gh, 0.04, 0, gy, 0]]), doorGlass));
    group.add(leaf);
    leaves.push({ leaf, base, dir, lw });
  }
  const mat = new THREE.SpriteMaterial({ map: padlockTexture(), transparent: true });
  const locks = [-1, 1].map(s => {
    const sp = new THREE.Sprite(mat); sp.scale.set(0.55, 0.55, 1); sp.position.set(0, Math.min(h - 0.4, 1.5), s * 0.2); sp.visible = false;
    sp.raycast = () => {}; // o cadeado não é clicável (e sprites sem câmera quebram o raycast)
    group.add(sp); return sp;
  });
  group.userData.door = { leaves, locks, open: 0 };
  return group;
}

// monta o grupo 3D (frente para +Z, base em y=0, centrado na pegada)
const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
export function buildDecor(id) {
  const d = DECOR[id.slice(2)];
  const fw = Math.max(1, Math.round(d.size[0])), fd = Math.max(1, Math.round(d.size[2]));
  const group = new THREE.Group();
  for (const glow of [false, true]) {
    const list = d.boxes.filter(b => !!b[7] === glow);
    if (!list.length) continue;
    const pos = [], nor = [], col = [], idx = [];
    for (const [x, y, z, w, h, dd, c] of list) {
      const g = new THREE.BoxGeometry(w / 16, h / 16, dd / 16);
      g.translate((x + w / 2) / 16 - fw / 2, (y + h / 2) / 16, (z + dd / 2) / 16 - fd / 2);
      const color = new THREE.Color(c);
      const base = pos.length / 3;
      const p = g.attributes.position.array, n = g.attributes.normal.array;
      for (let i = 0; i < p.length; i += 3) {
        pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]);
        const v = 0.94 + ((Math.abs(Math.floor(p[i] * 16) * 7 + Math.floor(p[i + 1] * 16) * 13 + Math.floor(p[i + 2] * 16) * 3) % 5) * 0.03); // leve variação
        col.push(color.r * v, color.g * v, color.b * v);
      }
      for (const i of g.index.array) idx.push(base + i);
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    group.add(new THREE.Mesh(geo, glow ? glowMat : solidMat));
  }
  return group;
}

// quadro: moldura do tamanho pedido + imagem (link ou arquivo enviado)
const loader = new THREE.TextureLoader();
loader.setCrossOrigin('anonymous');
const texCache = new Map();
// ---- GIF animado: decodifica os quadros (ImageDecoder do navegador) e troca a textura no tempo certo
const gifs = []; // animações ativas (uma por link; quadros com o mesmo GIF compartilham)
const MAX_GIF_FRAMES = 300, MAX_GIF_SIDE = 512;
export function tickGifs(now) {
  for (const g of gifs) {
    if (now < g.next) continue;
    g.i = (g.i + 1) % g.frames.length;
    g.ctx.clearRect(0, 0, g.cv.width, g.cv.height);
    g.ctx.drawImage(g.frames[g.i].bmp, 0, 0, g.cv.width, g.cv.height);
    g.tex.needsUpdate = true;
    g.next = now + g.frames[g.i].dur;
  }
}
async function fetchBytes(url) {
  const get = async u => { const r = await fetch(u, { mode: 'cors' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); };
  if (url.startsWith('/')) return get(url);
  try { return await get(url); } catch { return get('/api/img?u=' + encodeURIComponent(url)); } // site sem CORS: o servidor busca
}
const isGifBytes = b => { const u = new Uint8Array(b, 0, 4); return u[0] === 0x47 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x38; };
async function loadGif(buf) {
  if (!('ImageDecoder' in window)) throw new Error('navegador sem ImageDecoder');
  const dec = new ImageDecoder({ data: buf, type: 'image/gif' });
  await dec.tracks.ready;
  try { await dec.completed; } catch {}
  const track = dec.tracks.selectedTrack;
  const count = Math.max(1, Math.min(track.frameCount, MAX_GIF_FRAMES));
  const frames = [];
  let w = 0, h = 0;
  for (let i = 0; i < count; i++) {
    const { image } = await dec.decode({ frameIndex: i });
    if (!w) { const s = Math.min(1, MAX_GIF_SIDE / Math.max(image.displayWidth, image.displayHeight)); w = Math.max(1, Math.round(image.displayWidth * s)); h = Math.max(1, Math.round(image.displayHeight * s)); }
    const bmp = await createImageBitmap(image, { resizeWidth: w, resizeHeight: h });
    frames.push({ bmp, dur: Math.max(20, (image.duration || 100000) / 1000) }); // duração vem em microssegundos
    image.close();
  }
  dec.close();
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); ctx.drawImage(frames[0].bmp, 0, 0);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  if (frames.length > 1) gifs.push({ cv, ctx, tex, frames, i: 0, next: performance.now() + frames[0].dur });
  return tex;
}
export function loadPicture(url) {
  if (!texCache.has(url)) {
    const local = url.startsWith('/images/');
    const tryLoad = u => loader.loadAsync(u).then(t => { t.colorSpace = THREE.SRGBColorSpace; return t; });
    const staticTex = () => (local ? tryLoad(url) : tryLoad(url).catch(() => tryLoad('/api/img?u=' + encodeURIComponent(url))));
    const looksGif = /\.gif($|[?#])/i.test(url) || /giphy\.com|tenor\.com/i.test(url);
    texCache.set(url, looksGif
      ? fetchBytes(url).then(b => (isGifBytes(b) ? loadGif(b) : Promise.reject(new Error('não é GIF')))).catch(staticTex)
      : staticTex());
  }
  return texCache.get(url);
}
export function buildPicture(w, h, url) {
  const group = new THREE.Group();
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x4a3222 });
  const t = 0.07, depth = 0.06, z = -0.5 + depth / 2; // encostado na parede (fundo da célula)
  group.add(new THREE.Mesh(mergeBoxes([
    [w, t, depth, 0, t / 2, z], [w, t, depth, 0, h - t / 2, z],
    [t, h - 2 * t, depth, -w / 2 + t / 2, h / 2, z], [t, h - 2 * t, depth, w / 2 - t / 2, h / 2, z],
  ]), frameMat));
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * t, h - 2 * t), new THREE.MeshLambertMaterial({ color: 0x1c1c22 }));
  back.position.set(0, h / 2, -0.5 + 0.01); group.add(back);
  // imagem com transparência: o fundo transparente do PNG mostra a parede atrás
  const img = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, alphaTest: 0.02 }));
  img.position.set(0, h / 2, -0.5 + 0.035); img.visible = false; group.add(img);
  if (url) loadPicture(url).then(tex => {
    const iw = w - 2 * t - 0.04, ih = h - 2 * t - 0.04;
    const a = tex.image.width / tex.image.height;
    let pw = iw, ph = iw / a; if (ph > ih) { ph = ih; pw = ih * a; }
    img.scale.set(pw, ph, 1); img.material.map = tex; img.material.needsUpdate = true; img.visible = true;
    back.visible = false; // sem o fundo escuro
  }).catch(() => {
    // imagem indisponível: mostra um aviso
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const x = c.getContext('2d'); x.fillStyle = '#2a2a33'; x.fillRect(0, 0, 256, 128); x.fillStyle = '#ccc'; x.font = '20px system-ui'; x.textAlign = 'center';
    x.fillText('Imagem indisponível', 128, 60); x.font = '14px system-ui'; x.fillText('tente enviar o arquivo', 128, 88);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    img.material.map = tex; img.material.needsUpdate = true; img.scale.set(Math.min(w - 0.2, 2), Math.min(h - 0.2, 1), 1); img.visible = true;
  });
  return group;
}
