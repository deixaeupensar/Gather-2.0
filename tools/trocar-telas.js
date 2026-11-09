// Troca os painéis de blocos "Tela" por objetos "Tela (TV)" finos de parede (iguais ao Kanban):
// cada painel vira uma TV do mesmo tamanho, encostada na parede do lado da sala, e os blocos
// viram parede (o bloco da parede em volta).
// Uso (com o servidor PARADO):   node tools/trocar-telas.js
'use strict';
const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');

const W = 256, H = 64, D = 256, TELA = 29, GLASS = 8;
const idx = (x, y, z) => x + W * (z + D * y);
const inB = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D;
const rotFor = (dx, dz) => ((Math.round(Math.atan2(dx, dz) / (Math.PI / 2)) % 4) + 4) % 4;
const TAG = 'tela-tv';

function convertTelas(world, objects, rooms = []) {
  const seen = new Uint8Array(W * H * D);
  const report = [];
  const inRoom = (x, y, z) => rooms.some(r => x >= r.min[0] && x <= r.max[0] && y >= r.min[1] && y <= r.max[1] && z >= r.min[2] && z <= r.max[2]);
  for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i0 = idx(x, y, z);
    if (world[i0] !== TELA || seen[i0]) continue;
    // painel = blocos Tela conectados
    const cells = [], st = [[x, y, z]]; seen[i0] = 1;
    while (st.length) {
      const c = st.pop(); cells.push(c);
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const n = [c[0] + dx, c[1] + dy, c[2] + dz];
        if (!inB(...n)) continue;
        const j = idx(...n);
        if (world[j] === TELA && !seen[j]) { seen[j] = 1; st.push(n); }
      }
    }
    const mn = [0, 1, 2].map(k => Math.min(...cells.map(c => c[k]))), mx = [0, 1, 2].map(k => Math.max(...cells.map(c => c[k])));
    // bloco de parede para tapar: o de cima do painel; senão o mais comum em volta (sem vidro)
    const count = new Map();
    for (const c of cells) for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      if (!inB(c[0] + dx, c[1] + dy, c[2] + dz)) continue;
      const b = world[idx(c[0] + dx, c[1] + dy, c[2] + dz)];
      if (b && b !== TELA && b !== GLASS) count.set(b, (count.get(b) || 0) + 1);
    }
    const above = inB(mn[0], mx[1] + 1, mn[2]) ? world[idx(mn[0], mx[1] + 1, mn[2])] : 0;
    const fill = above && above !== TELA && above !== GLASS ? above : ([...count].sort((a, b) => b[1] - a[1])[0] || [GLASS])[0];
    const flatX = mn[0] === mx[0], flatZ = mn[2] === mx[2];
    const r = { at: mn, size: [mx[0] - mn[0] + 1, mx[1] - mn[1] + 1, mx[2] - mn[2] + 1], blocks: cells.length, fill };
    for (const c of cells) world[idx(...c)] = fill;
    if (!flatX && !flatZ) { r.skip = 'painel não é uma parede reta (só tapei os blocos)'; report.push(r); continue; }
    // lado da TV: onde a frente do painel está livre (de preferência dentro de uma sala)
    const along = flatZ ? 0 : 2, wdt = mx[along] - mn[along] + 1, hgt = mx[1] - mn[1] + 1;
    let best = null;
    for (const s of [1, -1]) {
      const n = flatZ ? [0, 0, s] : [s, 0, 0];
      let free = true;
      for (const c of cells) if (world[idx(c[0] + n[0], c[1], c[2] + n[2])]) { free = false; break; }
      if (!free) continue;
      const mid = [Math.floor((mn[0] + mx[0]) / 2) + n[0], mn[1], Math.floor((mn[2] + mx[2]) / 2) + n[2]];
      const score = inRoom(...mid) ? 2 : 1;
      if (!best || score > best.score) best = { s, n, score };
    }
    if (!best) { r.skip = 'os dois lados estão ocupados (só tapei os blocos)'; report.push(r); continue; }
    const off = Math.floor((wdt - 1) / 2);
    const cell = flatZ ? { x: mn[0] + off, z: mn[2] + best.s } : { x: mn[0] + best.s, z: mn[2] + off };
    objects.push({ id: crypto.randomBytes(8).toString('hex'), model: 'd:tv', x: cell.x, y: mn[1], z: cell.z, rot: rotFor(best.n[0], best.n[2]), w: Math.min(16, wdt), h: Math.min(5, hgt), tag: TAG });
    r.tv = { ...cell, y: mn[1], w: wdt, h: hgt, facing: best.n };
    report.push(r);
  }
  return report;
}

module.exports = { convertTelas };

if (require.main === module) {
  const ROOT = path.join(__dirname, '..');
  const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
  const PORT = Number(process.env.PORT) || 3000;
  const s = net.connect(PORT, '127.0.0.1');
  s.setTimeout(800, () => { s.destroy(); run(); });
  s.on('connect', () => { s.destroy(); console.error(`O servidor parece estar rodando na porta ${PORT}. Pare ele (Ctrl+C) e rode de novo.`); process.exit(1); });
  s.on('error', run);
  let ran = false;
  function run() {
    if (ran) return; ran = true;
    const wf = path.join(DATA, 'world.bin'), of = path.join(DATA, 'objects.json'), rf = path.join(DATA, 'rooms.json');
    const world = new Uint8Array(fs.readFileSync(wf));
    const objects = JSON.parse(fs.readFileSync(of, 'utf8'));
    const rooms = fs.existsSync(rf) ? JSON.parse(fs.readFileSync(rf, 'utf8')) : [];
    const report = convertTelas(world, objects, rooms);
    if (!report.length) { console.log('Nenhum bloco Tela no mundo: nada a fazer.'); return; }
    const bdir = path.join(DATA, 'backup-telas-' + new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19));
    fs.mkdirSync(bdir, { recursive: true });
    for (const f of [wf, of]) fs.copyFileSync(f, path.join(bdir, path.basename(f)));
    fs.writeFileSync(wf, world); fs.writeFileSync(of, JSON.stringify(objects));
    for (const r of report) console.log(r.tv ? `TV ${r.tv.w}×${r.tv.h} em x${r.tv.x} y${r.tv.y} z${r.tv.z} (virada para ${JSON.stringify(r.tv.facing)}) · ${r.blocks} blocos viraram parede (${r.fill})` : `Painel em ${r.at}: ${r.skip}`);
    console.log(`Backup em ${bdir}\nAgora inicie o servidor: node server.js`);
  }
}
