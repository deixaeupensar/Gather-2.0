// Espalha quadros com uma imagem (ex.: o logo da empresa) pelas salas e corredores do escritório
// criado pelo gerar-escritorio.js. Pode rodar de novo: troca os quadros antigos pelos novos.
//
// Uso (com o servidor PARADO):   node tools/colocar-quadros.js [imagem.png]
// Padrão: assets/logo-hapvida.png
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const net = require('net');

const ROOT = path.join(__dirname, '..');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const PORT = Number(process.env.PORT) || 3000;
const IMG = path.resolve(process.argv[2] || path.join(ROOT, 'assets', 'logo-hapvida.png'));
const X0 = 92, Z0 = 92, S = 72, Y0 = 23; // mesmo referencial do gerar-escritorio.js
const TAG = 'quadro-logo';

const portInUse = port => new Promise(res => {
  const s = net.connect(port, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false));
  s.setTimeout(800, () => { s.destroy(); res(false); });
});

function imageExt(buf) {
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

async function main() {
  if (await portInUse(PORT)) { console.error(`O servidor parece estar rodando na porta ${PORT}. Pare ele (Ctrl+C) e rode de novo.`); process.exit(1); }
  if (!fs.existsSync(IMG)) { console.error('Imagem não encontrada:', IMG); process.exit(1); }
  const buf = fs.readFileSync(IMG);
  const ext = imageExt(buf);
  if (!ext) { console.error('Use PNG, JPG, GIF ou WEBP.'); process.exit(1); }
  // copia a imagem para data/images com nome derivado do conteúdo
  const name = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16) + '.' + ext;
  fs.mkdirSync(path.join(DATA, 'images'), { recursive: true });
  fs.writeFileSync(path.join(DATA, 'images', name), buf);
  const url = '/images/' + name;

  const objFile = path.join(DATA, 'objects.json');
  let objects = []; try { objects = JSON.parse(fs.readFileSync(objFile, 'utf8')); } catch {}
  fs.copyFileSync(objFile, objFile + '.antes-dos-quadros');
  objects = objects.filter(o => o.tag !== TAG);

  const oid = () => crypto.randomBytes(8).toString('hex');
  const rotFor = (dx, dz) => ((Math.round(Math.atan2(dx, dz) / (Math.PI / 2)) % 4) + 4) % 4;
  let count = 0;
  // quadro de w×h blocos encostado numa parede. cells: células (x,z) ao longo da parede; front: direção para onde a imagem olha
  function frame(cells, front, y, w, h) {
    const xs = cells.map(c => c[0]), zs = cells.map(c => c[1]);
    const off = Math.floor((w - 1) / 2); // o servidor centraliza a pegada na célula âncora
    const alongX = new Set(xs).size > 1;
    const x = alongX ? Math.min(...xs) + off : xs[0], z = alongX ? zs[0] : Math.min(...zs) + off;
    objects.push({ id: oid(), model: 'd:quadro', x, y, z, rot: rotFor(front[0], front[1]), w, h, url, tag: TAG });
    count++;
  }
  // referencial das salas (igual ao gerador): i ao longo da parede da porta, j do fundo até a porta
  function room(ax, bx, az, bz, door) {
    ax += X0; bx += X0; az += Z0; bz += Z0;
    return {
      S: { map: (i, j) => [ax + i, az + j], side: [1, 0], fwd: [0, 1] },
      N: { map: (i, j) => [bx - i, bz - j], side: [-1, 0], fwd: [0, -1] },
      E: { map: (i, j) => [ax + j, bz - i], side: [0, -1], fwd: [1, 0] },
      W: { map: (i, j) => [bx - j, az + i], side: [0, 1], fwd: [-1, 0] },
    }[door];
  }
  // salas de escritório: um quadro 2×2 na parede lateral (i = 0), no meio da sala
  const offices = [];
  for (const [a, b] of [[1, 11], [13, 23], [25, 35], [37, 47], [49, 59], [61, 71]]) offices.push(room(a, b, 1, 10, 'S'));
  for (const [a, b] of [[17, 28], [30, 41], [43, 55]]) { offices.push(room(1, 10, a, b, 'E')); offices.push(room(62, 71, a, b, 'W')); }
  offices.push(room(13, 23, 62, 71, 'N'), room(49, 59, 62, 71, 'N'), room(1, 11, 62, 71, 'N'), room(61, 71, 62, 71, 'N'));
  for (const f of offices) frame([f.map(0, 4), f.map(0, 5)], f.side, Y0 + 1, 2, 2);
  // salas de reunião: dois quadros na parede do fundo, ao lado do painel de Tela
  for (const f of [room(18, 33, 18, 33, 'S'), room(39, 54, 18, 33, 'S'), room(18, 33, 39, 54, 'N'), room(39, 54, 39, 54, 'N')]) {
    frame([f.map(1, 0), f.map(2, 0)], f.fwd, Y0 + 1, 2, 2);
    frame([f.map(13, 0), f.map(14, 0)], f.fwd, Y0 + 1, 2, 2);
  }
  // recepção: quadro grande na parede norte; fachada: dois ao lado da entrada
  frame([[X0 + 40, Z0 + 62], [X0 + 41, Z0 + 62], [X0 + 42, Z0 + 62]], [0, 1], Y0 + 1, 3, 3);
  frame([[X0 + 29, Z0 + S + 1], [X0 + 30, Z0 + S + 1]], [0, 1], Y0 + 1, 2, 2);
  frame([[X0 + 42, Z0 + S + 1], [X0 + 43, Z0 + S + 1]], [0, 1], Y0 + 1, 2, 2);
  // corredores: entre as portas das paredes das salas
  for (const lx of [14, 26, 45, 57]) {
    frame([[X0 + lx, Z0 + 12], [X0 + lx + 1, Z0 + 12]], [0, 1], Y0 + 1, 2, 2);   // corredor de cima, parede norte
    frame([[X0 + lx, Z0 + 60], [X0 + lx + 1, Z0 + 60]], [0, -1], Y0 + 1, 2, 2);  // corredor de baixo, parede sul
  }
  for (const lz of [26, 39]) {
    frame([[X0 + 12, Z0 + lz], [X0 + 12, Z0 + lz + 1]], [1, 0], Y0 + 1, 2, 2);   // corredor da esquerda
    frame([[X0 + 60, Z0 + lz], [X0 + 60, Z0 + lz + 1]], [-1, 0], Y0 + 1, 2, 2);  // corredor da direita
  }

  fs.writeFileSync(objFile, JSON.stringify(objects));
  console.log(`${count} quadros colocados com ${path.basename(IMG)} (${url}).`);
  console.log('Backup dos objetos: objects.json.antes-dos-quadros. Agora inicie o servidor: node server.js');
}
main().catch(e => { console.error(e); process.exit(1); });
