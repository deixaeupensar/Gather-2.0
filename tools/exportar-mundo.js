// Copia o escritório atual (data/) para mundo-inicial/, que vai para o GitHub.
// Leva só o que é do mundo: blocos, objetos, salas, imagens dos quadros, skins, modelos 3D e quadros brancos.
// NÃO leva: senha/config do ServiceNow, certificados, Kanban (tarefas e e-mails), chat das salas,
// reservas, backups. Das salas, tira o dono (e-mail) e a tranca.
// Uso: node tools/exportar-mundo.js   (pode rodar com o servidor ligado; ele salva o mundo a cada poucos segundos)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const OUT = path.join(ROOT, 'mundo-inicial');

if (!fs.existsSync(path.join(DATA, 'world.bin'))) { console.error('Não achei data/world.bin: nada para exportar.'); process.exit(1); }
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const copy = (name) => { const f = path.join(DATA, name); if (fs.existsSync(f)) { fs.copyFileSync(f, path.join(OUT, name)); return true; } return false; };
const copyDir = (name) => { const d = path.join(DATA, name); if (!fs.existsSync(d)) return 0; fs.cpSync(d, path.join(OUT, name), { recursive: true }); return fs.readdirSync(d).length; };
const readJSON = (name, def) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8')); } catch { return def; } };

copy('world.bin'); copy('protect.bin'); copy('objects.json'); copy('lousas.json'); copy('models.json');
// salas sem dono e destrancadas (o dono é identificado pelo e-mail: não vai para o repositório)
const rooms = readJSON('rooms.json', []).map(({ owner, ownerName, locked, lockedBy, ...r }) => r);
fs.writeFileSync(path.join(OUT, 'rooms.json'), JSON.stringify(rooms, null, 1));
const n = { imagens: copyDir('images'), skins: copyDir('skins'), modelos: copyDir('models') };
const objs = readJSON('objects.json', []);

console.log(`Escritório exportado para mundo-inicial/: ${objs.length} objetos, ${rooms.length} salas, ${n.imagens} imagens, ${n.skins} skins, ${n.modelos} modelos 3D.`);
console.log('Ficaram de fora: ServiceNow, certificados, Kanban, chat das salas, reservas e backups.');
