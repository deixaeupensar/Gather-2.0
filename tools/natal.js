// Decoração de Natal extra pelo escritório e pela área de fora.
// Uso (com o servidor PARADO):   node tools/natal.js            → coloca / refaz
//                                node tools/natal.js --remover  → tira tudo o que este script colocou
// Cada posição é conferida: o objeto precisa caber no ar e, se for de parede, ter parede atrás.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const net = require('net');

const ROOT = path.join(__dirname, '..');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const PORT = Number(process.env.PORT) || 3000;
const W = 256, H = 64, D = 256, idx = (x, y, z) => x + W * (z + D * y);
const X0 = 92, Z0 = 92, S = 72, Y0 = 23, DESK = Y0 + 0.81;
const TAG = 'natal-predio';
// [largura, altura, profundidade, de parede?] das decorações usadas aqui
const SIZE = {
  papai_noel: [1, 2, 1], rena: [1, 1.81, 2], treno: [1, 1.06, 2], arvore_grande: [3, 4.3, 3], pinheiro_neve: [1, 1.88, 1],
  presentes_pilha: [1, 0.94, 1], festao: [1, 0.35, 1, true], sinos: [1, 0.66, 1, true], bolas_penduradas: [1, 1, 1],
  vela: [1, 0.34, 1], biscoito: [1, 0.49, 1], neve: [2, 0.06, 2],
};
const rotFor = (dx, dz) => ((Math.round(Math.atan2(dx, dz) / (Math.PI / 2)) % 4) + 4) % 4;
const portInUse = port => new Promise(res => {
  const s = net.connect(port, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false));
  s.setTimeout(800, () => { s.destroy(); res(false); });
});

(async () => {
  if (await portInUse(PORT)) { console.error(`O servidor parece estar rodando na porta ${PORT}. Pare ele (Ctrl+C) e rode de novo.`); process.exit(1); }
  const world = new Uint8Array(fs.readFileSync(path.join(DATA, 'world.bin')));
  const of = path.join(DATA, 'objects.json');
  let objects = JSON.parse(fs.readFileSync(of, 'utf8'));
  fs.copyFileSync(of, of + '.antes-do-natal');
  objects = objects.filter(o => o.tag !== TAG);
  const get = (x, y, z) => (x < 0 || z < 0 || x >= W || z >= D || y < 0 || y >= H ? 0 : world[idx(x, y, z)]);
  if (process.argv.includes('--remover')) { fs.writeFileSync(of, JSON.stringify(objects)); console.log('Decoração extra de Natal removida.'); return; }

  // células já ocupadas por objetos no chão (para não empilhar coisas no mesmo lugar)
  const taken = new Set();
  const footprint = (model, x, z, rot) => {
    const [w, , d] = SIZE[model] || [1, 1, 1];
    const fw0 = Math.max(1, Math.round(w)), fd0 = Math.max(1, Math.round(d));
    const [fw, fd] = rot % 2 ? [fd0, fw0] : [fw0, fd0];
    const x0 = x - Math.floor((fw - 1) / 2), z0 = z - Math.floor((fd - 1) / 2);
    const cells = []; for (let i = x0; i < x0 + fw; i++) for (let k = z0; k < z0 + fd; k++) cells.push([i, k]);
    return cells;
  };
  let ok = 0, skipped = 0;
  function put(model, x, y, z, rot = 0) {
    const [, h, , wall] = SIZE[model];
    const cells = footprint(model, x, z, rot);
    for (const [cx, cz] of cells) for (let yy = Math.floor(y + 0.001); yy < Math.ceil(y + h - 0.01); yy++) if (get(cx, yy, cz)) { skipped++; return; }
    if (wall) {
      const th = rot * Math.PI / 2, fx = Math.round(Math.sin(th)), fz = Math.round(Math.cos(th));
      if (!get(x - fx, Math.floor(y), z - fz)) { skipped++; return; }
    } else if (y === Y0) {
      const key = cells.map(c => c.join(',')).join(';');
      if (cells.some(c => taken.has(c.join(',')))) { skipped++; return; }
      cells.forEach(c => taken.add(c.join(',')));
    }
    objects.push({ id: crypto.randomBytes(8).toString('hex'), model: 'd:' + model, x, y, z, rot, tag: TAG });
    ok++;
  }
  for (const o of objects) if (Math.abs(o.y - Y0) < 0.01) for (const c of footprint(o.model.replace('d:', ''), o.x, o.z, o.rot)) taken.add(c.join(','));

  // ---------- corredores: festão contínuo no alto das paredes + bolas penduradas no teto de vidro
  // (os pisca-piscas antigos dos corredores saem para dar lugar ao festão)
  objects = objects.filter(o => !(o.model === 'd:pisca' && (o.z === Z0 + 12 || o.z === Z0 + 60)));
  for (let lx = 1; lx <= 71; lx++) { put('festao', X0 + lx, Y0 + 3, Z0 + 12, 0); put('festao', X0 + lx, Y0 + 3, Z0 + 60, 2); }
  for (let lz = 16; lz <= 56; lz++) { put('festao', X0 + 12, Y0 + 3, Z0 + lz, 1); put('festao', X0 + 60, Y0 + 3, Z0 + lz, 3); }
  for (let lx = 4; lx <= 68; lx += 5) { put('bolas_penduradas', X0 + lx, Y0 + 4, Z0 + 13); put('bolas_penduradas', X0 + lx, Y0 + 4, Z0 + 59); }
  for (let lz = 20; lz <= 52; lz += 5) { put('bolas_penduradas', X0 + 14, Y0 + 4, Z0 + lz); put('bolas_penduradas', X0 + 58, Y0 + 4, Z0 + lz); }
  for (let k = 20; k <= 52; k += 6) { put('bolas_penduradas', X0 + 36, Y0 + 4, Z0 + k); put('bolas_penduradas', X0 + k, Y0 + 4, Z0 + 36); }

  // ---------- salas de trabalho: bolas no centro, sinos na parede lateral, pilha de presentes
  const offices = [];
  for (const [a, b] of [[1, 11], [13, 23], [25, 35], [37, 47], [49, 59], [61, 71]]) offices.push([a, b, 1, 10, 'S']);
  for (const [a, b] of [[17, 28], [30, 41], [43, 55]]) { offices.push([1, 10, a, b, 'E']); offices.push([62, 71, a, b, 'W']); }
  offices.push([13, 23, 62, 71, 'N'], [49, 59, 62, 71, 'N']);
  const frame = (ax, bx, az, bz, door) => {
    ax += X0; bx += X0; az += Z0; bz += Z0;
    return {
      S: { w: bx - ax + 1, d: bz - az + 1, map: (i, j) => [ax + i, az + j], side: [1, 0] },
      N: { w: bx - ax + 1, d: bz - az + 1, map: (i, j) => [bx - i, bz - j], side: [-1, 0] },
      E: { w: bz - az + 1, d: bx - ax + 1, map: (i, j) => [ax + j, bz - i], side: [0, -1] },
      W: { w: bz - az + 1, d: bx - ax + 1, map: (i, j) => [bx - j, az + i], side: [0, 1] },
    }[door];
  };
  for (const r of offices) {
    const f = frame(...r), c = Math.floor(f.w / 2);
    put('bolas_penduradas', ...xz(f.map(c, Math.floor(f.d / 2)), Y0 + 4));
    const [sx, sz] = f.map(f.w - 1, 5); put('sinos', sx, Y0 + 2, sz, rotFor(-f.side[0], -f.side[1]));
    put('presentes_pilha', ...xz(f.map(1, f.d - 2), Y0));
  }
  function xz([x, z], y) { return [x, y, z]; }

  // ---------- salas de reunião: velas na mesa e bolas penduradas
  for (const [a, b, c, d, door] of [[18, 33, 18, 33, 'S'], [39, 54, 18, 33, 'S'], [18, 33, 39, 54, 'N'], [39, 54, 39, 54, 'N']]) {
    const f = frame(a, b, c, d, door);
    put('vela', ...xz(f.map(8, 5), DESK)); put('vela', ...xz(f.map(7, 6), DESK));
    put('bolas_penduradas', ...xz(f.map(4, 12), Y0 + 4)); put('bolas_penduradas', ...xz(f.map(11, 3), Y0 + 4));
  }

  // ---------- copa e sala de descanso
  { const f = frame(1, 11, 62, 71, 'N'); put('biscoito', ...xz(f.map(2, 4), DESK)); put('biscoito', ...xz(f.map(7, 4), DESK)); put('bolas_penduradas', ...xz(f.map(5, 5), Y0 + 4)); }
  { const f = frame(61, 71, 62, 71, 'N'); put('presentes_pilha', ...xz(f.map(5, 7), Y0)); put('papai_noel', ...xz(f.map(8, 3), Y0)); put('bolas_penduradas', ...xz(f.map(5, 5), Y0 + 4)); }

  // ---------- recepção: árvore gigante, Papai Noel recebendo quem entra, presentes
  put('arvore_grande', X0 + 27, Y0, Z0 + 69, 0);
  put('papai_noel', X0 + 31, Y0, Z0 + 68, 0);
  put('presentes_pilha', X0 + 30, Y0, Z0 + 70, 0); put('presentes_pilha', X0 + 25, Y0, Z0 + 66, 0);
  put('biscoito', X0 + 29, DESK, Z0 + 65, 0);
  for (const lx of [27, 32, 41, 45]) put('bolas_penduradas', X0 + lx, Y0 + 4, Z0 + 66);

  // ---------- lado de fora: trenó com renas na entrada, pinheiros com neve em volta, neve no chão
  put('treno', X0 + 47, Y0, Z0 + S + 3, 0);
  put('rena', X0 + 46, Y0, Z0 + S + 6, 0); put('rena', X0 + 48, Y0, Z0 + S + 6, 0);
  put('rena', X0 + 46, Y0, Z0 + S + 9, 0); put('rena', X0 + 48, Y0, Z0 + S + 9, 0);
  for (let l = -1; l <= S + 1; l += 6) {
    put('pinheiro_neve', X0 + l, Y0, Z0 - 4); put('pinheiro_neve', X0 - 4, Y0, Z0 + l); put('pinheiro_neve', X0 + S + 4, Y0, Z0 + l);
    if (l < 22 || l > 52) put('pinheiro_neve', X0 + l, Y0, Z0 + S + 4);
  }
  let s = 99; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 60; k++) {
    const side = k % 4, t = Math.floor(rnd() * (S + 14)) - 7, off = 2 + Math.floor(rnd() * 8);
    const [lx, lz] = side === 0 ? [t, -off] : side === 1 ? [t, S + off] : side === 2 ? [-off, t] : [S + off, t];
    if (side === 1 && lx > 22 && lx < 52) continue; // não cobre o caminho da entrada
    put('neve', X0 + lx, Y0, Z0 + lz, 0);
  }

  fs.writeFileSync(of, JSON.stringify(objects));
  console.log(`${ok} decorações de Natal colocadas (${skipped} posições puladas por não caberem).`);
  console.log('Backup: objects.json.antes-do-natal. Agora inicie o servidor: node server.js');
})().catch(e => { console.error(e); process.exit(1); });
