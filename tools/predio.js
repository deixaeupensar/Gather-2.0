// Acabamento do prédio (usado pelo gerar-escritorio.js e pelo atualizar-predio.js):
// troca os blocos por concreto liso, protege a estrutura e coloca portas automáticas nas passagens.
'use strict';
const crypto = require('crypto');

const W = 256, H = 64, D = 256;
const idx = (x, y, z) => x + W * (z + D * y);
const X0 = 92, Z0 = 92, S = 72, FY = 22, Y0 = 23, TOP = 27, ROOF = 28;
const K = { white: 30, lgray: 31, gray: 32, beige: 44 }; // ids dos concretos (public/js/blocks.js)
const OLD = { smooth: 11, white: 15, lgray: 16, gray: 17 };
// acabamento moderno (public/js/blocks.js)
const MOD = { plaster: 45, plaster2: 46, oak: 47, tile: 48, carpet: 49, ceiling: 50, led: 51 };
const rotFor = (dx, dz) => ((Math.round(Math.atan2(dx, dz) / (Math.PI / 2)) % 4) + 4) % 4;
// salas de trabalho: [lx0, lx1, lz0, lz1, lado da porta] (igual ao gerador)
const OFFICES = [];
for (const [a, b] of [[1, 11], [13, 23], [25, 35], [37, 47], [49, 59], [61, 71]]) OFFICES.push([a, b, 1, 10, 'S']);
for (const [a, b] of [[17, 28], [30, 41], [43, 55]]) { OFFICES.push([1, 10, a, b, 'E']); OFFICES.push([62, 71, a, b, 'W']); }
OFFICES.push([13, 23, 62, 71, 'N'], [49, 59, 62, 71, 'N'], [1, 11, 62, 71, 'N'], [61, 71, 62, 71, 'N']);
function roomFrame(ax, bx, az, bz, door) {
  ax += X0; bx += X0; az += Z0; bz += Z0;
  return {
    S: { w: bx - ax + 1, map: (i, j) => [ax + i, az + j], fwd: [0, 1] },
    N: { w: bx - ax + 1, map: (i, j) => [bx - i, bz - j], fwd: [0, -1] },
    E: { w: bz - az + 1, map: (i, j) => [ax + j, bz - i], fwd: [1, 0] },
    W: { w: bz - az + 1, map: (i, j) => [bx - j, az + i], fwd: [-1, 0] },
  }[door];
}

// portas: [lx, lz, largura, rot, altura] — rot 0: porta ao longo de X; rot 1: ao longo de Z
const DOORS = [];
for (const c of [6, 18, 30, 42, 54, 66]) DOORS.push([c, 11, 2, 0, 3]);
for (const c of [6, 18, 54, 66]) DOORS.push([c, 61, 2, 0, 3]);
DOORS.push([36, 61, 3, 0, 3]);                       // recepção → corredor (centro)
for (const c of [22, 35, 49]) { DOORS.push([11, c, 2, 1, 3]); DOORS.push([61, c, 2, 1, 3]); }
for (const [lx, lz] of [[34, 25], [38, 25], [34, 46], [38, 46]]) DOORS.push([lx, lz, 2, 1, 3]);
DOORS.push([36, S, 5, 0, 4]);                        // entrada principal (centro)

function finishBuilding(world, protect, objects) {
  let changed = 0, prot = 0;
  for (let x = X0; x <= X0 + S; x++) for (let z = Z0; z <= Z0 + S + 12; z++) {
    const inside = z <= Z0 + S;
    for (let y = FY; y <= ROOF; y++) {
      const i = idx(x, y, z), b = world[i];
      let nb = b;
      if (y === FY) { if (b === OLD.smooth) nb = K.lgray; else if (b === OLD.lgray) nb = K.beige; }
      else if (y === ROOF) { if (b === OLD.smooth) nb = K.white; }
      else if (inside) { if (b === OLD.white) nb = K.white; else if (b === OLD.lgray) nb = K.lgray; else if (b === OLD.gray) nb = K.gray; }
      // acabamento moderno: piso (madeira / porcelanato / carpete), reboco liso, teto modular com LED
      if (y === FY) { if (nb === 4 && inside) nb = MOD.oak; else if (nb === K.lgray) nb = MOD.tile; else if (nb === K.beige) nb = MOD.carpet; }
      else if (y === ROOF) { if (nb === K.white) nb = MOD.ceiling; else if (nb === 13) nb = MOD.led; }
      else if (inside) { if (nb === K.white) nb = MOD.plaster; else if (nb === K.lgray) nb = MOD.plaster2; }
      if (nb !== b) { world[i] = nb; changed++; }
      if (inside && world[i] && !protect[i]) { protect[i] = 1; prot++; }
    }
  }
  // portas (troca as antigas do prédio, se houver)
  // paredes ripadas: a parede do fundo de cada sala (atrás das mesas), do chão ao teto
  const slatCells = [];
  for (const [a, b, c, d, door] of OFFICES) {
    const f = roomFrame(a, b, c, d, door);
    for (let i = 0; i < f.w; i++) { const [x, z] = f.map(i, 0); slatCells.push([x, z, rotFor(...f.fwd)]); }
  }
  // recepção: parede norte (menos a porta do corredor, 34–38, e onde fica o logo grande, 39–43)
  for (let lx = 25; lx <= 47; lx++) if (lx < 34 || lx > 43) slatCells.push([X0 + lx, Z0 + 62, 0]);
  const slatSet = new Set(slatCells.map(([x, z]) => x + ',' + z));
  // o pisca-pisca que ficava nessas paredes sai (o ripado ocupa a parede inteira)
  const kept = objects.filter(o => o.tag !== 'porta-predio' && o.tag !== 'kanban-predio' && o.tag !== 'ripado-predio' && o.tag !== 'kanban-sn-predio' &&
    !(o.model === 'd:pisca' && slatSet.has(o.x + ',' + o.z)));
  const oid = () => crypto.randomBytes(8).toString('hex');
  for (const [x, z, rot] of slatCells) kept.push({ id: oid(), model: 'd:painel_ripado_alto', x, y: Y0, z, rot, tag: 'ripado-predio' });
  for (const [lx, lz, w, rot, h] of DOORS) {
    kept.push({ id: oid(), model: 'd:porta', x: X0 + lx, y: Y0, z: Z0 + lz, rot, w, h, tag: 'porta-predio' });
  }
  // Kanban do time ocupando a parede leste da Reunião B (12 x 3 blocos, olhando para dentro da sala)
  kept.push({ id: oid(), model: 'd:kanban', x: X0 + 54, y: Y0 + 1.6, z: Z0 + 25, rot: 3, w: 12, h: 3, tag: 'kanban-predio' });
  // Reunião D: um quadro por grupo do ServiceNow (dá para trocar o grupo com Shift + botão direito)
  kept.push({ id: oid(), model: 'd:kanban', x: X0 + 54, y: Y0 + 1.6, z: Z0 + 42, rot: 3, w: 5, h: 3, source: 'sn:aprovadores', tag: 'kanban-sn-predio' });
  kept.push({ id: oid(), model: 'd:kanban', x: X0 + 54, y: Y0 + 1.6, z: Z0 + 47, rot: 3, w: 5, h: 3, source: 'sn:devs', tag: 'kanban-sn-predio' });
  return { objects: kept, changed, prot, doors: DOORS.length };
}

module.exports = { finishBuilding, W, H, D, X0, Z0, S };
