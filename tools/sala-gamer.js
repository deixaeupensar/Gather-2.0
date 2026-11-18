// Transforma uma sala do prédio num setup temático, com TV enorme na parede (a TV normal do jogo:
// botão direito compartilha a tela). Tira a mobília que já estava na sala. Pode rodar de novo na mesma
// sala (refaz tudo, inclusive trocando de estilo).
//
// Estilos:
//   minimalista (padrão)  paredes cinza, parede de ripado de madeira com a TV, piso de madeira, PC top com
//                         3 monitores no meio da sala (a mesa fica virada para a porta), 2 caixas de som,
//                         frigobar, plantas, abajur e uma fita de neon na borda do teto
//   neon                  sala gamer: painéis escuros com neon, fliperamas, estações de jogo, sofá e puffs
//
// Uso (com o servidor PARADO):   node tools/sala-gamer.js "Sala 07"
//   opções:  --estilo=minimalista|neon
//            --neon=ciano|rosa|laranja|branca   cor da fita de neon do teto (estilo minimalista; padrão: ciano)
//            --parede=-z|+z|-x|+x   parede da TV (padrão: a oposta à porta)
//            --nome="Sala Gamer"    renomeia a sala
//            DATA_DIR=...           pasta de dados (padrão: data/)
// Faz backup antes (data/backup-sala-gamer-...). Para desfazer, copie os arquivos do backup de volta.
// Depois, para levar para o Render: node tools/exportar-mundo.js e git push.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const net = require('net');

const ROOT = path.join(__dirname, '..');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const PORT = Number(process.env.PORT) || 3000;
const W = 256, H = 64, D = 256;
const idx = (x, y, z) => x + W * (z + D * y);
const TAG = 'sala-gamer';
// ids dos blocos (public/js/blocks.js)
const B = {
  air: 0, lgray: 31, gray: 32, black: 33, oak: 47, ceiling: 50, led: 51, slats: 53,
  pink: 54, cyan: 55, purple: 56,
};
// pegada [largura, profundidade] de cada modelo, antes de girar (public/js/decor.js)
const FOOT = {
  'd:mesa_escritorio_preta': [2, 1], 'd:mesa_escritorio_madeira': [2, 1], 'd:monitor_duplo': [2, 1],
  'd:sofa_grande': [3, 1], 'd:mesa_centro': [2, 1], 'd:tapete_cinza': [2, 2],
  'd:neon_gamer': [4, 1], 'd:neon_game_on': [4, 1],
};
const foot = (model, extra) => (model === 'd:tv' ? [extra.w, 1] : FOOT[model] || [1, 1]);

// tira acentos para comparar nomes (a classe de caracteres combinantes é montada por código para não depender de escape)
const COMBINING = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
const norm = s => String(s).normalize('NFD').replace(COMBINING, '').toLowerCase().trim();
const rotOf = (dx, dz) => ((Math.round(Math.atan2(dx, dz) / (Math.PI / 2)) % 4) + 4) % 4;
const OPPOSITE = { '-z': '+z', '+z': '-z', '-x': '+x', '+x': '-x' };

function portInUse(port) {
  return new Promise(res => {
    const s = net.connect(port, '127.0.0.1');
    s.on('connect', () => { s.destroy(); res(true); });
    s.on('error', () => res(false));
    s.setTimeout(800, () => { s.destroy(); res(false); });
  });
}

async function main() {
  const flags = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
  const roomName = process.argv.slice(2).find(a => !a.startsWith('--'));
  const style = flags.estilo || 'minimalista';
  const neonColor = flags.neon || 'ciano';
  if (!['ciano', 'rosa', 'laranja', 'branca'].includes(neonColor)) { console.error('--neon deve ser ciano, rosa, laranja ou branca'); process.exit(1); }
  if (!roomName) { console.error('Diga qual sala. Exemplo: node tools/sala-gamer.js "Sala 07"'); process.exit(1); }
  if (style !== 'minimalista' && style !== 'neon') { console.error('--estilo deve ser minimalista ou neon'); process.exit(1); }
  if (await portInUse(PORT)) { console.error(`O servidor parece estar rodando na porta ${PORT}. Pare ele (Ctrl+C) e rode de novo.`); process.exit(1); }

  const worldFile = path.join(DATA, 'world.bin');
  if (!fs.existsSync(worldFile)) { console.error(`Não achei ${worldFile}. Rode o servidor uma vez para criar o mundo.`); process.exit(1); }
  const world = new Uint8Array(fs.readFileSync(worldFile));
  if (world.length !== W * H * D) { console.error('world.bin com tamanho inesperado.'); process.exit(1); }
  const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return d; } };
  let objects = readJSON('objects.json', []);
  const rooms = readJSON('rooms.json', []);

  const room = rooms.find(r => norm(r.name) === norm(roomName));
  if (!room) { console.error(`Não achei a sala "${roomName}". Salas: ${rooms.map(r => r.name).join(', ')}`); process.exit(1); }
  const [x0, y0, z0] = room.min, [x1, y1, z1] = room.max;
  if (x1 - x0 < 6 || z1 - z0 < 6) { console.error(`A sala "${room.name}" é pequena demais (${x1 - x0 + 1}x${z1 - z0 + 1}).`); process.exit(1); }
  const FLOOR = y0 - 1, CEIL = y1 + 1;

  // ---------- backup
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const bdir = path.join(DATA, 'backup-sala-gamer-' + stamp);
  fs.mkdirSync(bdir, { recursive: true });
  for (const f of ['world.bin', 'objects.json', 'rooms.json']) if (fs.existsSync(path.join(DATA, f))) fs.copyFileSync(path.join(DATA, f), path.join(bdir, f));
  console.log('Backup salvo em', bdir);

  // ---------- portas desta sala (parede onde cada uma está e que células da sala ficam na frente dela)
  const doors = [];
  for (const o of objects) {
    if (o.model !== 'd:porta') continue;
    const w = o.w || 2, h = o.h || 3;
    if (o.rot % 2 === 0) { // ao longo de X, em z fixo
      const a = o.x, b = o.x + w - 1;
      if (o.z === z0 - 1 && b >= x0 && a <= x1) doors.push({ side: '-z', axis: 'x', row: z0, a, b, h });
      if (o.z === z1 + 1 && b >= x0 && a <= x1) doors.push({ side: '+z', axis: 'x', row: z1, a, b, h });
    } else { // ao longo de Z, em x fixo
      const a = o.z, b = o.z + w - 1;
      if (o.x === x0 - 1 && b >= z0 && a <= z1) doors.push({ side: '-x', axis: 'z', row: x0, a, b, h });
      if (o.x === x1 + 1 && b >= z0 && a <= z1) doors.push({ side: '+x', axis: 'z', row: x1, a, b, h });
    }
  }
  if (!doors.length) { console.error(`Não achei porta na sala "${room.name}".`); process.exit(1); }
  const doorSides = new Set(doors.map(d => d.side));
  // células da sala bem na frente de uma porta (na largura e na altura dela) ficam livres de painel
  const doorBlocked = (x, y, z) => doors.some(d => y < y0 + d.h && (d.axis === 'x' ? z === d.row && x >= d.a && x <= d.b : x === d.row && z >= d.a && z <= d.b));

  // ---------- parede da TV: a oposta à porta (ou a que o usuário pediu)
  let tvSide = flags.parede;
  if (!tvSide) {
    const cand = [OPPOSITE[doors[0].side], ...['-z', '+z', '-x', '+x'].filter(s => s !== doors[0].side && s !== OPPOSITE[doors[0].side])];
    tvSide = cand.find(s => !doorSides.has(s)) || cand[0];
  }
  if (!OPPOSITE[tvSide]) { console.error('--parede deve ser -z, +z, -x ou +x'); process.exit(1); }

  // ---------- mapa local: u anda ao longo da parede da TV (da esquerda p/ direita de quem olha a TV), v sai da parede para dentro
  const frame = {
    '-z': { Wd: x1 - x0 + 1, Dp: z1 - z0 + 1, at: (u, v) => [x0 + u, z0 + v], front: 0 },
    '+z': { Wd: x1 - x0 + 1, Dp: z1 - z0 + 1, at: (u, v) => [x1 - u, z1 - v], front: 2 },
    '-x': { Wd: z1 - z0 + 1, Dp: x1 - x0 + 1, at: (u, v) => [x0 + v, z1 - u], front: 1 },
    '+x': { Wd: z1 - z0 + 1, Dp: x1 - x0 + 1, at: (u, v) => [x1 - v, z0 + u], front: 3 },
  }[tvSide];
  const { Wd, Dp, at } = frame;
  const vec = (du, dv) => { const [ax, az] = at(0, 0), [bx, bz] = at(du, dv); return [bx - ax, bz - az]; };
  const FACE = { '+v': frame.front, '-v': (frame.front + 2) % 4, '+u': rotOf(...vec(1, 0)), '-u': rotOf(...vec(-1, 0)) };
  const mid = Math.floor(Wd / 2);
  console.log(`Sala "${room.name}" (${style}): ${x1 - x0 + 1}x${z1 - z0 + 1}x${y1 - y0 + 1}, porta no lado ${[...doorSides].join(' ')}, TV na parede ${tvSide} (${Wd} de largura, ${Dp} de fundo).`);

  const put = (x, y, z, b) => { if (x >= 0 && z >= 0 && x < W && z < D && y >= 0 && y < H) world[idx(x, y, z)] = b; };

  // ---------- tira a mobília antiga (menos portas) e o que uma versão anterior desta ferramenta colocou
  const before = objects.length, removed = {};
  objects = objects.filter(o => {
    if (o.model === 'd:porta') return true;
    const inside = o.x >= x0 && o.x <= x1 && o.z >= z0 && o.z <= z1 && o.y >= y0 - 0.5 && o.y <= y1 + 1.5;
    if (inside) removed[o.model] = (removed[o.model] || 0) + 1;
    return !inside;
  });
  console.log(`Removi ${before - objects.length} objetos da sala:`, Object.entries(removed).map(([m, n]) => `${m.replace('d:', '')}×${n}`).join(', ') || '(nenhum)');
  // o espaço da sala começa vazio (inclui blocos de uma versão anterior)
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) put(x, y, z, B.air);

  let blocks = 0;
  // piso e teto: cada função recebe (u, v, inner) e devolve o bloco daquela célula da pegada da sala
  const slab = (floorPick, ceilPick) => {
    for (let u = 0; u < Wd; u++) for (let v = 0; v < Dp; v++) {
      const [x, z] = at(u, v);
      const inner = u > 0 && u < Wd - 1 && v > 0 && v < Dp - 1;
      put(x, FLOOR, z, floorPick(u, v, inner)); put(x, CEIL, z, ceilPick(u, v, inner)); blocks += 2;
    }
  };
  // painéis: 1 bloco colado nas paredes (não mexe nas paredes, que são das salas vizinhas); a porta fica livre
  const lining = pick => {
    for (let u = 0; u < Wd; u++) for (let v = 0; v < Dp; v++) {
      if (u > 0 && u < Wd - 1 && v > 0 && v < Dp - 1) continue;
      const [x, z] = at(u, v);
      for (let y = y0; y <= y1; y++) { if (doorBlocked(x, y, z)) continue; put(x, y, z, pick(u, v, y)); blocks++; }
    }
  };

  // ---------- objetos
  const newObjs = [], skipped = [];
  // coloca um modelo cobrindo as células locais [u1..u2] x [v1..v2], de frente para `facing` ('+v','-v','+u','-u')
  function item(model, [u1, u2], [v1, v2], y, facing, extra = {}) {
    // só dentro da área livre (entre os painéis); em salas pequenas o que não couber é pulado
    if (u1 < 1 || u2 > Wd - 2 || v1 < 1 || v2 > Dp - 2) { skipped.push(model.replace('d:', '')); return null; }
    const rot = FACE[facing];
    const cells = [at(u1, v1), at(u2, v2)];
    const xa = Math.min(cells[0][0], cells[1][0]), xb = Math.max(cells[0][0], cells[1][0]);
    const za = Math.min(cells[0][1], cells[1][1]), zb = Math.max(cells[0][1], cells[1][1]);
    const ew = xb - xa + 1, ed = zb - za + 1;
    const [fw, fd] = foot(model, extra), exp = rot % 2 ? [fd, fw] : [fw, fd];
    if (ew !== exp[0] || ed !== exp[1]) throw new Error(`${model}: a área ${ew}x${ed} não bate com a pegada ${exp[0]}x${exp[1]} (rot ${rot})`);
    const cx = xa + Math.floor((exp[0] - 1) / 2), cz = za + Math.floor((exp[1] - 1) / 2);
    const o = { id: crypto.randomBytes(8).toString('hex'), model, x: cx, y: Math.round(y * 100) / 100, z: cz, rot, ...extra, tag: TAG };
    newObjs.push(o);
    return o;
  }
  const FL = y0, TOPD = y0 + 0.81, LAST = Dp - 2;
  // TV enorme: entre os painéis, colada no painel da parede
  let tvW = Math.min(Wd - 2, 16);
  const tvH = Math.min(4, y1 - y0);
  const bigTV = () => { const u = 1 + Math.floor((Wd - 2 - tvW) / 2); return item('d:tv', [u, u + tvW - 1], [1, 1], y0 + 1, '+v', { w: tvW, h: tvH }); };

  if (style === 'minimalista') {
    // piso de madeira clara; teto modular com painéis de luz espaçados
    slab(() => B.oak, (u, v, inner) => (inner && (u - 2) % 3 === 0 && (v - 2) % 3 === 0 ? B.led : B.ceiling));
    // paredes cinza-claro e, na parede da TV, ripado de madeira do chão ao teto
    lining((u, v) => (v === 0 ? B.slats : B.lgray));
    tvW = Math.max(3, Wd - 4); // 16:9 (7x4 numa sala de 11) e sobra ripado de madeira dos dois lados
    bigTV();
    // PC top no meio, virado para a porta: quem senta fica de frente para quem entra (e de costas para a TV)
    const dv = Math.floor(Dp / 2); // fileira da bancada
    item('d:tapete_cinza', [mid - 1, mid], [dv - 1, dv], FL, '-v');
    item('d:tapete_cinza', [mid + 1, mid + 2], [dv - 1, dv], FL, '-v');
    item('d:mesa_escritorio_madeira', [mid - 1, mid], [dv, dv], FL, '-v');
    item('d:mesa_escritorio_madeira', [mid + 1, mid + 2], [dv, dv], FL, '-v');
    for (const k of [-1, 0, 1]) item('d:monitor', [mid + k, mid + k], [dv, dv], TOPD, '-v');
    item('d:pc_torre', [mid + 2, mid + 2], [dv, dv], TOPD, '-v');
    item('d:cadeira_escritorio_cinza', [mid, mid], [dv - 1, dv - 1], FL, '+v');
    // caixas de som de torre nos dois lados da bancada, viradas para quem senta
    item('d:caixa_som', [mid - 2, mid - 2], [dv, dv], FL, '-v');
    item('d:caixa_som', [mid + 3, mid + 3], [dv, dv], FL, '-v');
    // frigobar no canto da TV, com uma lata em cima; plantas e abajur para aquecer o cinza
    item('d:frigobar', [Wd - 2, Wd - 2], [2, 2], FL, '-u');
    item('d:lata_energetico_branca', [Wd - 2, Wd - 2], [2, 2], FL + 1.19, '-u');
    item('d:planta', [1, 1], [1, 1], FL, '+v');
    item('d:planta', [1, 1], [LAST - 1, LAST - 1], FL, '+v');
    item('d:luminaria', [Wd - 2, Wd - 2], [LAST - 1, LAST - 1], FL, '+v');
    // fita de neon na borda do teto, nas quatro paredes (uma faixa por bloco de parede, colada no alto)
    const tape = 'd:fita_neon_' + neonColor;
    for (let u = 1; u <= Wd - 2; u++) { item(tape, [u, u], [1, 1], y1, '+v'); item(tape, [u, u], [LAST, LAST], y1, '-v'); }
    for (let v = 1; v <= LAST; v++) { item(tape, [1, 1], [v, v], y1, '+u'); item(tape, [Wd - 2, Wd - 2], [v, v], y1, '-u'); }
  } else {
    // piso preto com duas faixas de neon que apontam para a TV; teto preto com dois anéis de neon
    slab((u, v, inner) => (inner && u === 3 ? B.cyan : inner && u === Wd - 4 ? B.pink : B.black),
      (u, v) => { const ring = Math.min(u, Wd - 1 - u, v, Dp - 1 - v); return ring === 1 ? B.pink : ring === 3 ? B.cyan : B.black; });
    // painéis pretos com rodapé rosa, friso ciano no alto e faixa roxa no meio
    lining((u, v, y) => (y === y0 ? B.pink : y === y1 ? B.cyan : y === y0 + 2 ? B.purple : B.black));
    bigTV();
    // aparador com videogame embaixo da TV
    item('d:mesa_escritorio_preta', [mid - 2, mid - 1], [1, 1], FL, '+v');
    item('d:mesa_escritorio_preta', [mid, mid + 1], [1, 1], FL, '+v');
    item('d:headset', [mid - 2, mid - 2], [1, 1], TOPD, '+v');
    item('d:console_game', [mid - 1, mid - 1], [1, 1], TOPD, '+v');
    item('d:controle_game', [mid, mid], [1, 1], TOPD, '+v');
    item('d:lata_energetico', [mid + 1, mid + 1], [1, 1], TOPD, '+v');
    item('d:torre_led', [1, 1], [1, 1], FL, '+v');
    item('d:torre_led', [Wd - 2, Wd - 2], [1, 1], FL, '+v');
    // sala de estar de frente para a TV
    item('d:sofa_grande', [mid - 1, mid + 1], [LAST - 1, LAST - 1], FL, '-v');
    item('d:mesa_centro', [mid - 1, mid], [LAST - 3, LAST - 3], FL, '+v');
    item('d:pufe_roxo', [mid - 2, mid - 2], [LAST - 3, LAST - 3], FL, '-v');
    item('d:pufe_azul', [mid + 1, mid + 1], [LAST - 3, LAST - 3], FL, '-v');
    item('d:puff_saco', [mid - 3, mid - 3], [LAST - 1, LAST - 1], FL, '-v');
    item('d:puff_saco_cinza', [mid + 3, mid + 3], [LAST - 1, LAST - 1], FL, '-v');
    item('d:lata_energetico_branca', [mid, mid], [LAST - 3, LAST - 3], y0 + 0.4, '+v');
    // estações de jogo na parede da esquerda
    const stations = Math.max(0, Math.floor((Dp - 3) / 3));
    for (let k = 0; k < stations; k++) {
      const v = 2 + 3 * k;
      item('d:mesa_escritorio_preta', [1, 1], [v, v + 1], FL, '+u');
      item('d:monitor_duplo', [1, 1], [v, v + 1], TOPD, '+u');
      item('d:cadeira_gamer', [2, 2], [v, v], FL, '-u');
      item('d:gabinete_gamer', [1, 1], [v + 2, v + 2], FL, '+u');
    }
    // fliperamas e frigobar na parede da direita
    const arcades = Math.min(3, Math.max(0, Dp - 6));
    for (let k = 0; k < arcades; k++) item('d:arcade', [Wd - 2, Wd - 2], [2 + k, 2 + k], FL, '-u');
    const fridgeV = Math.min(2 + arcades + 1, LAST - 2);
    item('d:frigobar', [Wd - 2, Wd - 2], [fridgeV, fridgeV], FL, '-u');
    item('d:lata_energetico', [Wd - 2, Wd - 2], [fridgeV, fridgeV], FL + 1.19, '-u');
    // placas de neon por cima, nas duas paredes laterais
    if (Dp >= 7) {
      item('d:neon_gamer', [Wd - 2, Wd - 2], [2, 5], y0 + 3, '-u');
      item('d:neon_game_on', [1, 1], [2, 5], y0 + 3, '+u');
    }
  }
  objects.push(...newObjs);

  if (flags.nome && typeof flags.nome === 'string') { room.name = flags.nome; }

  fs.writeFileSync(worldFile, world);
  fs.writeFileSync(path.join(DATA, 'objects.json'), JSON.stringify(objects));
  fs.writeFileSync(path.join(DATA, 'rooms.json'), JSON.stringify(rooms, null, 1));
  console.log(`Sala pronta (${style}): ${blocks} blocos, ${newObjs.length} objetos novos (TV de ${tvW}x${tvH}).`);
  if (skipped.length) console.log('Não coube (sala pequena):', skipped.join(', '));
  console.log('Agora inicie o servidor: node server.js');
}
main().catch(e => { console.error(e); process.exit(1); });
