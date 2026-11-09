// Gera um escritório pronto no centro do mundo: anel de salas, corredor em volta,
// 4 salas de reunião de vidro no meio (com painel de Tela), recepção, copa e sala de descanso,
// tudo decorado (móveis + Natal) e com as salas já demarcadas (voz isolada).
//
// Uso (com o servidor PARADO):   node tools/gerar-escritorio.js
// Faz backup de data/ antes. Para desfazer, copie os arquivos do backup de volta.
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
const B = { air: 0, grass: 1, dirt: 2, stone: 3, planks: 4, glass: 8, smooth: 11, lamp: 13, white: 15, lgray: 16, gray: 17, tela: 29 };

const X0 = 92, Z0 = 92, S = 72;          // prédio de 73x73 (cantos inclusos)
const FY = 22, Y0 = 23, TOP = 27, ROOF = 28; // chão, primeiro ar, topo da parede, teto

function portInUse(port) {
  return new Promise(res => {
    const s = net.connect(port, '127.0.0.1');
    s.on('connect', () => { s.destroy(); res(true); });
    s.on('error', () => res(false));
    s.setTimeout(800, () => { s.destroy(); res(false); });
  });
}

async function main() {
  if (await portInUse(PORT)) { console.error(`O servidor parece estar rodando na porta ${PORT}. Pare ele (Ctrl+C) e rode de novo.`); process.exit(1); }
  const worldFile = path.join(DATA, 'world.bin');
  if (!fs.existsSync(worldFile)) { console.error('Não achei data/world.bin. Rode o servidor uma vez para criar o mundo.'); process.exit(1); }
  const world = new Uint8Array(fs.readFileSync(worldFile));
  if (world.length !== W * H * D) { console.error('world.bin com tamanho inesperado.'); process.exit(1); }
  const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return d; } };
  let objects = readJSON('objects.json', []);
  let rooms = readJSON('rooms.json', []);

  // ---------- backup
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const bdir = path.join(DATA, 'backup-' + stamp);
  fs.mkdirSync(bdir, { recursive: true });
  for (const f of ['world.bin', 'objects.json', 'rooms.json']) if (fs.existsSync(path.join(DATA, f))) fs.copyFileSync(path.join(DATA, f), path.join(bdir, f));
  console.log('Backup salvo em', bdir);

  const put = (x, y, z, b) => { if (x >= 0 && z >= 0 && x < W && z < D && y >= 0 && y < H) world[idx(x, y, z)] = b; };

  // ---------- terreno plano em volta
  const M = 12;
  for (let x = X0 - M; x <= X0 + S + M; x++) for (let z = Z0 - M; z <= Z0 + S + M; z++) {
    for (let y = 1; y < FY; y++) put(x, y, z, y < FY - 3 ? B.stone : B.dirt);
    put(x, FY, z, B.grass);
    for (let y = FY + 1; y < H; y++) put(x, y, z, B.air);
  }
  // caminho até a entrada
  for (let x = X0 + 33; x <= X0 + 39; x++) for (let z = Z0 + S + 1; z <= Z0 + S + M; z++) put(x, FY, z, B.smooth);

  // ---------- planta baixa (lx, lz de 0 a 72)
  // W parede · C corredor · R sala · M sala de reunião · D porta · O passagem larga · E entrada · T painel de Tela
  const N = S + 1;
  const g = Array.from({ length: N }, () => new Array(N).fill('R'));
  const set = (x1, z1, x2, z2, t) => { for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) g[x][z] = t; };
  // corredores do anel
  set(1, 12, 71, 15, 'C'); set(1, 57, 71, 60, 'C'); set(12, 16, 16, 56, 'C'); set(56, 16, 60, 56, 'C');
  set(12, 16, 60, 16, 'C'); set(12, 56, 60, 56, 'C');
  // bloco central e reuniões
  set(17, 17, 55, 55, 'M');
  set(17, 17, 55, 17, 'W'); set(17, 55, 55, 55, 'W'); set(17, 17, 17, 55, 'W'); set(55, 17, 55, 55, 'W');
  set(34, 18, 34, 54, 'W'); set(38, 18, 38, 54, 'W'); set(18, 34, 54, 34, 'W'); set(18, 38, 54, 38, 'W');
  set(35, 18, 37, 54, 'C'); set(18, 35, 54, 37, 'C');
  set(35, 17, 37, 17, 'O'); set(35, 55, 37, 55, 'O'); set(17, 35, 17, 37, 'O'); set(55, 35, 55, 37, 'O');
  // paredes do anel de salas
  set(1, 11, 71, 11, 'W'); set(1, 61, 71, 61, 'W');
  set(11, 16, 11, 56, 'W'); set(61, 16, 61, 56, 'W');
  set(1, 16, 11, 16, 'W'); set(1, 56, 11, 56, 'W'); set(61, 16, 71, 16, 'W'); set(61, 56, 71, 56, 'W');
  for (const x of [12, 24, 36, 48, 60]) set(x, 1, x, 10, 'W');
  for (const x of [12, 24, 48, 60]) set(x, 62, x, 71, 'W');
  for (const z of [29, 42]) { set(1, z, 10, z, 'W'); set(62, z, 71, z, 'W'); }
  // parede externa
  set(0, 0, S, 0, 'W'); set(0, S, S, S, 'W'); set(0, 0, 0, S, 'W'); set(S, 0, S, S, 'W');
  // portas
  for (const c of [6, 18, 30, 42, 54, 66]) set(c, 11, c + 1, 11, 'D');
  for (const c of [6, 18, 54, 66]) set(c, 61, c + 1, 61, 'D');
  set(35, 61, 37, 61, 'D');
  for (const c of [22, 35, 49]) { set(11, c, 11, c + 1, 'D'); set(61, c, 61, c + 1, 'D'); }
  set(34, 25, 34, 26, 'D'); set(38, 25, 38, 26, 'D'); set(34, 46, 34, 47, 'D'); set(38, 46, 38, 47, 'D');
  set(34, S, 38, S, 'E');
  // painéis de Tela nas paredes do fundo das salas de reunião
  set(22, 17, 29, 17, 'T'); set(43, 17, 50, 17, 'T'); set(22, 55, 29, 55, 'T'); set(43, 55, 50, 55, 'T');

  const isOuter = (x, z) => x === 0 || z === 0 || x === S || z === S;
  const centerWall = (x, z) => (x >= 17 && x <= 55 && z >= 17 && z <= 55);
  // parede "reta" (vizinhos só de um lado a outro) recebe janela; cantos e encontros viram pilar
  const isWallT = (x, z) => { const a = g[x] && g[x][z]; return a === 'W' || a === 'T' || a === 'D'; };
  const wallJunction = (x, z) => {
    const h = isWallT(x - 1, z) && isWallT(x + 1, z) && !isWallT(x, z - 1) && !isWallT(x, z + 1);
    const v = isWallT(x, z - 1) && isWallT(x, z + 1) && !isWallT(x - 1, z) && !isWallT(x + 1, z);
    return !(h || v);
  };

  // ---------- blocos
  for (let lx = 0; lx <= S; lx++) for (let lz = 0; lz <= S; lz++) {
    const x = X0 + lx, z = Z0 + lz, t = g[lx][lz];
    const floor = t === 'R' ? B.planks : t === 'M' ? B.lgray : B.smooth;
    put(x, FY, z, floor);
    for (let y = Y0; y <= TOP; y++) put(x, y, z, B.air);
    if (t === 'W' || t === 'T') {
      for (let y = Y0; y <= TOP; y++) put(x, y, z, B.white);
      put(x, TOP, z, B.lgray);
      const corner = (lx === 0 || lx === S) && (lz === 0 || lz === S);
      if (corner) for (let y = Y0; y <= TOP; y++) put(x, y, z, B.gray);
      // janelas: parede externa e paredes de vidro das salas de reunião
      const along = lx === 0 || lx === S ? lz : lx;
      const windowRow = b => { for (let y = Y0 + 1; y <= Y0 + 3; y++) put(x, y, z, b); };
      if (isOuter(lx, lz) && !corner && !wallJunction(lx, lz) && along % 4 >= 2) windowRow(B.glass);
      // salas de reunião com paredes de vidro (estilo "aquário")
      if (t === 'W' && centerWall(lx, lz) && !wallJunction(lx, lz)) windowRow(B.glass);
      if (t === 'T') windowRow(B.tela);
    } else if (t === 'D') {
      for (let y = Y0 + 3; y <= TOP; y++) put(x, y, z, B.white);
      put(x, TOP, z, B.lgray);
    } else if (t === 'O' || t === 'E') {
      put(x, TOP, z, B.lgray);
    }
    // teto: vidro sobre corredores, luminárias nas salas
    const roof = t === 'C' || t === 'O' ? B.glass : (t === 'R' || t === 'M') && lx % 5 === 3 && lz % 5 === 3 ? B.lamp : B.smooth;
    put(x, ROOF, z, roof);
  }

  // ---------- objetos (decoração)
  const minX = X0 - M, maxX = X0 + S + M, minZ = Z0 - M, maxZ = Z0 + S + M;
  objects = objects.filter(o => !(o.x >= minX && o.x <= maxX && o.z >= minZ && o.z <= maxZ));
  rooms = rooms.filter(r => r.max[0] < minX || r.min[0] > maxX || r.max[2] < minZ || r.min[2] > maxZ);
  const oid = () => crypto.randomBytes(8).toString('hex');
  const add = (model, x, y, z, rot) => objects.push({ id: oid(), model: 'd:' + model, x, y, z, rot });
  const rotFor = (dx, dz) => ((Math.round(Math.atan2(dx, dz) / (Math.PI / 2)) % 4) + 4) % 4;
  const DESK = Y0 + 0.81; // altura do tampo das mesas

  // referencial de uma sala: i ao longo da parede da porta, j do fundo (0) até a porta
  function frame(ax, bx, az, bz, door) {
    ax += X0; bx += X0; az += Z0; bz += Z0;
    const f = {
      S: { w: bx - ax + 1, d: bz - az + 1, map: (i, j) => [ax + i, az + j], fwd: [0, 1], side: [1, 0] },
      N: { w: bx - ax + 1, d: bz - az + 1, map: (i, j) => [bx - i, bz - j], fwd: [0, -1], side: [-1, 0] },
      E: { w: bz - az + 1, d: bx - ax + 1, map: (i, j) => [ax + j, bz - i], fwd: [1, 0], side: [0, -1] },
      W: { w: bz - az + 1, d: bx - ax + 1, map: (i, j) => [bx - j, az + i], fwd: [-1, 0], side: [0, 1] },
    }[door];
    f.toDoor = rotFor(f.fwd[0], f.fwd[1]); f.toFar = rotFor(-f.fwd[0], -f.fwd[1]);
    f.toSide = rotFor(f.side[0], f.side[1]); f.toOtherSide = rotFor(-f.side[0], -f.side[1]);
    f.one = (m, i, j, rot, y = Y0) => { const [x, z] = f.map(i, j); add(m, x, y, z, rot); };
    f.two = (m, i, j, rot, y = Y0) => { const a = f.map(i, j), b = f.map(i + 1, j); add(m, Math.min(a[0], b[0]), y, Math.min(a[1], b[1]), rot); };
    f.quad = (m, i, j, rot, y = Y0) => { const a = f.map(i, j), b = f.map(i + 1, j + 1); add(m, Math.min(a[0], b[0]), y, Math.min(a[1], b[1]), rot); };
    return f;
  }

  let n = 0;
  function office(f, xmas) {
    const { w, d } = f;
    for (let i = 1; i + 1 < w - 1; i += 3) {
      f.two('mesa_escritorio', i, 1, f.toDoor);
      if ((n + i) % 2) f.two('monitor_duplo', i, 1, f.toDoor, DESK);
      else { f.one('monitor', i, 1, f.toDoor, DESK); f.one('notebook', i + 1, 1, f.toDoor, DESK); }
      f.one('cadeira_escritorio', i, 2, f.toFar);
    }
    f.one('planta', 0, 0, f.toDoor); f.one('planta', w - 1, 0, f.toDoor);
    f.one('lixeira', 0, 3, f.toDoor);
    f.one('luminaria', w - 1, 3, f.toDoor);
    const c = Math.floor(w / 2);
    f.quad('tapete', c - 1, 4, f.toDoor);
    f.one('pufe', c - 2, 5, f.toDoor); f.one('pufe', c + 1, 5, f.toDoor);
    if (xmas) {
      f.quad('arvore_natal', w - 3, d - 3, f.toDoor);
      f.one('presente', w - 4, d - 2, f.toDoor); f.one('presente_azul', w - 1, d - 4, f.toSide);
      f.one('guirlanda', c + 2, d - 1, f.toFar, Y0 + 2);
    } else {
      f.one('planta', 0, d - 2, f.toDoor);
      f.one('estrela', c + 2, d - 1, f.toFar, Y0 + 2);
    }
    f.one('pisca', c, 0, f.toDoor, Y0 + 3);
    n++;
  }
  function meeting(f, xmas) {
    for (let j = 4; j <= 7; j++) { f.two('mesa', 6, j, f.toDoor); f.two('mesa', 8, j, f.toDoor); }
    for (let j = 4; j <= 7; j++) { f.one('cadeira', 5, j, f.toSide); f.one('cadeira', 10, j, f.toOtherSide); }
    f.one('cadeira', 7, 8, f.toFar); f.one('cadeira', 8, 8, f.toFar);
    f.one('caneca', 6, 5, f.toDoor, DESK); f.one('caneca', 9, 6, f.toDoor, DESK); f.one('notebook', 7, 7, f.toFar, DESK);
    for (const [i, j] of [[0, 0], [15, 0], [0, 15], [15, 15]]) f.one('planta', i, j, f.toDoor);
    f.one('luminaria', 0, 3, f.toDoor);
    if (xmas) { f.quad('arvore_natal', 13, 12, f.toDoor); f.one('presente', 12, 14, f.toDoor); f.one('presente_verde', 15, 13, f.toSide); }
    else { f.one('bebedouro', 15, 3, f.toOtherSide); f.quad('tapete', 6, 11, f.toDoor); }
  }

  const R = []; // salas demarcadas
  const room = (name, ax, bx, az, bz) => R.push({ id: oid(), name, min: [X0 + ax, Y0, Z0 + az], max: [X0 + bx, TOP, Z0 + bz] });

  // salas de cima (porta para o sul) e de baixo (porta para o norte)
  const topRooms = [[1, 11], [13, 23], [25, 35], [37, 47], [49, 59], [61, 71]];
  topRooms.forEach(([a, b], k) => { office(frame(a, b, 1, 10, 'S'), k % 2 === 0); room(`Sala ${String(k + 1).padStart(2, '0')}`, a, b, 1, 10); });
  // laterais
  const sideRooms = [[17, 28], [30, 41], [43, 55]];
  sideRooms.forEach(([a, b], k) => {
    office(frame(1, 10, a, b, 'E'), k === 1); room(`Sala ${String(7 + k).padStart(2, '0')}`, 1, 10, a, b);
    office(frame(62, 71, a, b, 'W'), k !== 1); room(`Sala ${String(10 + k).padStart(2, '0')}`, 62, 71, a, b);
  });
  // de baixo
  office(frame(13, 23, 62, 71, 'N'), true); room('Sala 13', 13, 23, 62, 71);
  office(frame(49, 59, 62, 71, 'N'), false); room('Sala 14', 49, 59, 62, 71);

  // copa
  {
    const f = frame(1, 11, 62, 71, 'N');
    for (const i of [1, 6]) {
      f.two('mesa', i, 4, f.toDoor);
      f.one('cadeira', i, 3, f.toDoor); f.one('cadeira', i + 1, 3, f.toDoor);
      f.one('cadeira', i, 5, f.toFar); f.one('cadeira', i + 1, 5, f.toFar);
      f.one('caneca', i, 4, f.toDoor, Y0 + 0.81);
    }
    f.two('mesa', 3, 0, f.toDoor); f.one('caneca', 3, 0, f.toDoor, DESK); f.one('caneca', 4, 0, f.toDoor, DESK);
    f.one('bebedouro', 0, 0, f.toDoor); f.one('planta', 10, 0, f.toDoor); f.one('lixeira', 9, 0, f.toDoor);
    f.one('presente', 0, 8, f.toDoor); f.one('bengala', 10, 8, f.toDoor);
    room('Copa', 1, 11, 62, 71);
  }
  // sala de descanso
  {
    const f = frame(61, 71, 62, 71, 'N');
    f.two('sofa', 1, 1, f.toDoor); f.two('sofa', 6, 1, f.toDoor);
    f.quad('tapete', 3, 3, f.toDoor);
    f.one('pufe', 2, 5, f.toFar); f.one('pufe', 7, 5, f.toFar);
    f.quad('arvore_natal', 9, 6, f.toDoor); f.one('presente', 8, 7, f.toDoor); f.one('presente_azul', 10, 5, f.toDoor);
    f.one('planta', 0, 0, f.toDoor); f.one('luminaria', 0, 8, f.toDoor); f.one('boneco_neve', 10, 0, f.toDoor);
    room('Sala de Descanso', 61, 71, 62, 71);
  }
  // recepção (entrada pelo sul, porta para o corredor no norte)
  {
    const A = (m, lx, lz, rot, y = Y0) => add(m, X0 + lx, y, Z0 + lz, rot);
    A('mesa_escritorio', 28, 65, 0); A('notebook', 29, 65, 0, DESK); A('caneca', 28, 65, 0, DESK); A('cadeira_escritorio', 28, 64, 0);
    A('sofa', 41, 64, 0); A('sofa', 41, 68, 2); A('tapete', 41, 65, 0); A('pufe', 44, 66, 3);
    A('arvore_natal', 44, 69, 0); A('presente', 43, 70, 0); A('presente_azul', 46, 69, 0); A('presente_verde', 44, 68, 0);
    for (const [x, z] of [[25, 62], [47, 62], [25, 71], [47, 71]]) A('planta', x, z, 0);
    A('bebedouro', 27, 62, 0); A('lixeira', 31, 62, 0); A('luminaria', 33, 70, 0);
    room('Recepção', 25, 47, 62, 71);
    // lado de fora da entrada
    A('boneco_neve', 31, S + 2, 0); A('boneco_neve', 41, S + 2, 0);
    A('arvore_natal', 28, S + 4, 0); A('arvore_natal', 43, S + 4, 0);
    A('presente', 30, S + 5, 0); A('presente_verde', 42, S + 6, 0);
    A('guirlanda', 32, S + 1, 0, Y0 + 1); A('guirlanda', 40, S + 1, 0, Y0 + 1);
  }
  // salas de reunião
  meeting(frame(18, 33, 18, 33, 'S'), true); room('Reunião A', 18, 33, 18, 33);
  meeting(frame(39, 54, 18, 33, 'S'), false); room('Reunião B', 39, 54, 18, 33);
  meeting(frame(18, 33, 39, 54, 'N'), false); room('Reunião C', 18, 33, 39, 54);
  meeting(frame(39, 54, 39, 54, 'N'), true); room('Reunião D', 39, 54, 39, 54);
  // corredores: plantas e decoração entre as portas
  for (const lx of [12, 24, 36, 48, 60]) { add('planta', X0 + lx, Y0, Z0 + 12, 0); }
  for (const lx of [12, 24, 48, 60]) { add('planta', X0 + lx, Y0, Z0 + 60, 2); }
  for (const lz of [29, 42]) { add('planta', X0 + 12, Y0, Z0 + lz, 1); add('planta', X0 + 60, Y0, Z0 + lz, 3); }
  for (const [lx, lz] of [[34, 18], [38, 18], [34, 54], [38, 54]]) add('presente', X0 + (lx === 34 ? 35 : 37), Y0, Z0 + (lz === 18 ? 18 : 54), 0);
  // árvores nas pontas dos corredores (sem bloquear a passagem)
  for (const [lx, lz] of [[2, 13], [69, 13], [2, 58], [69, 58]]) { add('arvore_natal', X0 + lx, Y0, Z0 + lz, 0); add('presente', X0 + lx + (lx < 36 ? 2 : -1), Y0, Z0 + lz + 1, 0); }
  for (const lx of [20, 30, 42, 52]) { add('pisca', X0 + lx, Y0 + 3, Z0 + 12, 0); add('pisca', X0 + lx, Y0 + 3, Z0 + 60, 2); }

  // ---------- acabamento: concreto, estrutura protegida e portas
  const pf = path.join(DATA, 'protect.bin');
  if (fs.existsSync(pf)) fs.copyFileSync(pf, path.join(bdir, 'protect.bin'));
  const protect = fs.existsSync(pf) ? new Uint8Array(fs.readFileSync(pf)) : new Uint8Array(W * H * D);
  for (let x = X0 - M; x <= X0 + S + M; x++) for (let z = Z0 - M; z <= Z0 + S + M; z++) for (let y = 0; y < H; y++) protect[idx(x, y, z)] = 0;
  const fin = require('./predio').finishBuilding(world, protect, objects);
  objects = fin.objects;
  fs.writeFileSync(pf, protect);
  // painéis de blocos Tela → Tela (TV) fina de parede
  require('./trocar-telas').convertTelas(world, objects, [...rooms, ...R]);

  // ---------- salvar
  fs.writeFileSync(worldFile, world);
  fs.writeFileSync(path.join(DATA, 'objects.json'), JSON.stringify(objects));
  rooms.push(...R);
  fs.writeFileSync(path.join(DATA, 'rooms.json'), JSON.stringify(rooms, null, 1));
  console.log(`Escritório criado em X ${X0}–${X0 + S}, Z ${Z0}–${Z0 + S}: ${R.length} salas demarcadas, ${objects.length} objetos no mundo.`);
  console.log('Agora inicie o servidor: node server.js');
}
main().catch(e => { console.error(e); process.exit(1); });
