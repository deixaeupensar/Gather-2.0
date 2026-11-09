// Atualiza o prédio que já existe no mundo, sem mexer nas decorações:
// concreto liso, estrutura protegida (só a Marreta de obra quebra) e portas automáticas.
// Uso (com o servidor PARADO):   node tools/atualizar-predio.js
'use strict';
const fs = require('fs');
const path = require('path');
const net = require('net');
const { finishBuilding, W, H, D } = require('./predio');

const ROOT = path.join(__dirname, '..');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const PORT = Number(process.env.PORT) || 3000;
const portInUse = port => new Promise(res => {
  const s = net.connect(port, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false));
  s.setTimeout(800, () => { s.destroy(); res(false); });
});

(async () => {
  if (await portInUse(PORT)) { console.error(`O servidor parece estar rodando na porta ${PORT}. Pare ele (Ctrl+C) e rode de novo.`); process.exit(1); }
  const wf = path.join(DATA, 'world.bin'), of = path.join(DATA, 'objects.json'), pf = path.join(DATA, 'protect.bin');
  const world = new Uint8Array(fs.readFileSync(wf));
  const protect = fs.existsSync(pf) ? new Uint8Array(fs.readFileSync(pf)) : new Uint8Array(W * H * D);
  const objects = JSON.parse(fs.readFileSync(of, 'utf8'));
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const bdir = path.join(DATA, 'backup-' + stamp);
  fs.mkdirSync(bdir, { recursive: true });
  for (const f of [wf, of, pf]) if (fs.existsSync(f)) fs.copyFileSync(f, path.join(bdir, path.basename(f)));
  const r = finishBuilding(world, protect, objects);
  fs.writeFileSync(wf, world); fs.writeFileSync(pf, protect); fs.writeFileSync(of, JSON.stringify(r.objects));
  console.log(`Backup em ${bdir}`);
  console.log(`${r.changed} blocos trocados por concreto, ${r.prot} blocos da estrutura protegidos, ${r.doors} portas colocadas.`);
  console.log('Agora inicie o servidor: node server.js');
})().catch(e => { console.error(e); process.exit(1); });
