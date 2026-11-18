// Voxel Hub — servidor: arquivos estáticos + WebSocket (mundo, jogadores, chat, sinalização WebRTC)
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const os = require('os');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const { WebSocketServer } = require('./lib/ws-lite');
const { Kanban } = require('./lib/kanban');
const { ServiceNow } = require('./lib/servicenow');

const PORT = Number(process.env.PORT) || 3000;
const USE_HTTP = process.env.HTTP === '1'; // use HTTP puro (ex.: atrás de um proxy com HTTPS)
const W = 256, H = 64, D = 256;
const MAX_BLOCK_ID = 63;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const WORLD_FILE = path.join(DATA_DIR, 'world.bin');
const PUBLIC_DIR = path.join(__dirname, 'public');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three', 'build');

let ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
if (process.env.ICE_SERVERS) {
  try { ICE_SERVERS = JSON.parse(process.env.ICE_SERVERS); } catch { console.warn('ICE_SERVERS inválido, usando padrão'); }
}

// ---------------------------------------------------------------- mundo
const idx = (x, y, z) => x + W * (z + D * y);

function hash(x, z, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const smooth = t => t * t * (3 - 2 * t);
function vnoise(x, z, seed) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const a = hash(xi, zi, seed), b = hash(xi + 1, zi, seed), c = hash(xi, zi + 1, seed), d = hash(xi + 1, zi + 1, seed);
  const u = smooth(xf), v = smooth(zf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z) {
  let s = 0, amp = 1, f = 1 / 48, n = 0;
  for (let o = 0; o < 4; o++) { s += vnoise(x * f, z * f, o + 1) * amp; n += amp; amp *= 0.5; f *= 2; }
  return s / n;
}

// ids de bloco usados na geração (precisam bater com public/js/blocks.js)
const B = { grass: 1, dirt: 2, stone: 3, log: 5, leaves: 6, sand: 7, smooth: 11 };
const CENTER_H = 22;

function generateWorld() {
  const w = new Uint8Array(W * H * D);
  const heights = new Int16Array(W * D);
  const cx = W / 2, cz = D / 2;
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    let h = Math.floor(12 + fbm(x, z) * 20);
    const r = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
    const t = Math.min(1, Math.max(0, (r - 12) / 8));
    h = Math.round(CENTER_H * (1 - t) + h * t);
    h = Math.max(2, Math.min(H - 12, h));
    heights[x + z * W] = h;
    const beach = h <= 16;
    for (let y = 0; y <= h; y++) {
      let b;
      if (y === 0) b = B.stone;
      else if (y === h) b = r <= 7 ? B.smooth : beach ? B.sand : B.grass;
      else if (y > h - 4) b = beach ? B.sand : B.dirt;
      else b = B.stone;
      w[idx(x, y, z)] = b;
    }
  }
  // árvores
  for (let gz = 4; gz < D - 4; gz += 7) for (let gx = 4; gx < W - 4; gx += 7) {
    if (hash(gx, gz, 77) > 0.4) continue;
    const x = gx + Math.floor(hash(gx, gz, 78) * 4) - 2;
    const z = gz + Math.floor(hash(gx, gz, 79) * 4) - 2;
    const h = heights[x + z * W];
    if (h <= 16 || Math.hypot(x - cx, z - cz) < 20) continue;
    const trunk = 4 + Math.floor(hash(x, z, 80) * 3);
    for (let y = 1; y <= trunk; y++) w[idx(x, h + y, z)] = B.log;
    const top = h + trunk;
    for (let dy = -2; dy <= 1; dy++) {
      const rad = dy >= 0 ? 1 : 2;
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.abs(dx) === rad && Math.abs(dz) === rad && hash(x + dx, z + dz, 81 + dy) > 0.5) continue;
        const X = x + dx, Y = top + dy, Z = z + dz;
        if (X < 0 || Z < 0 || X >= W || Z >= D || Y >= H) continue;
        const i = idx(X, Y, Z);
        if (!w[i]) w[i] = B.leaves;
      }
    }
    if (top + 2 < H) w[idx(x, top + 2, z)] = B.leaves;
  }
  return w;
}

fs.mkdirSync(DATA_DIR, { recursive: true });
// primeira vez (data/ sem mundo): começa com o escritório pronto que está em mundo-inicial/
// (gerado por tools/exportar-mundo.js; vai junto no repositório)
const SEED_DIR = path.join(__dirname, 'mundo-inicial');
if (!fs.existsSync(WORLD_FILE) && fs.existsSync(path.join(SEED_DIR, 'world.bin'))) {
  fs.cpSync(SEED_DIR, DATA_DIR, { recursive: true });
  console.log('Primeira vez: escritório inicial copiado de mundo-inicial/');
}
let world;
if (fs.existsSync(WORLD_FILE) && fs.statSync(WORLD_FILE).size === W * H * D) {
  world = new Uint8Array(fs.readFileSync(WORLD_FILE));
  console.log('Mundo carregado de', WORLD_FILE);
} else {
  world = generateWorld();
  fs.writeFileSync(WORLD_FILE, world);
  console.log('Mundo novo gerado');
}
// ---------------------------------------------------------------- modelos 3D e objetos colocados
const MODELS_DIR = path.join(DATA_DIR, 'models');
const MODELS_FILE = path.join(DATA_DIR, 'models.json');
const OBJECTS_FILE = path.join(DATA_DIR, 'objects.json');
const MAX_MODEL_BYTES = 30 * 1024 * 1024;
const MAX_OBJECTS = 5000;
fs.mkdirSync(MODELS_DIR, { recursive: true });
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
let models = readJSON(MODELS_FILE, []).filter(m => fs.existsSync(path.join(MODELS_DIR, m.id + '.glb')));
let objects = [];
let objectsDirty = false;
function saveModels() { fs.writeFileSync(MODELS_FILE, JSON.stringify(models, null, 1)); }
function saveObjects() {
  if (!objectsDirty) return;
  objectsDirty = false;
  fs.writeFileSync(OBJECTS_FILE + '.tmp', JSON.stringify(objects));
  fs.renameSync(OBJECTS_FILE + '.tmp', OBJECTS_FILE);
}
const newId = () => require('crypto').randomBytes(8).toString('hex');
// decorações embutidas (precisam bater com public/js/decor.js)
const BUILTIN = new Set(['mesa', 'mesa_escritorio', 'cadeira', 'cadeira_escritorio', 'sofa', 'pufe', 'monitor', 'monitor_duplo', 'teclado', 'notebook', 'caneca', 'planta', 'luminaria', 'tapete', 'lixeira', 'bebedouro', 'quadro',
  'arvore_natal', 'presente', 'presente_azul', 'presente_verde', 'boneco_neve', 'guirlanda', 'meia', 'pisca', 'bengala', 'estrela', 'porta', 'kanban', 'kanban_meu', 'tv', 'lata_energetico', 'lata_energetico_branca', 'painel_ripado', 'painel_ripado_alto',
  'papai_noel', 'rena', 'treno', 'arvore_grande', 'pinheiro_neve', 'presentes_pilha', 'festao', 'sinos', 'bolas_penduradas', 'vela', 'biscoito', 'neve',
  'sofa_cinza', 'sofa_verde', 'sofa_couro', 'sofa_grande', 'poltrona', 'poltrona_mostarda', 'pufe_azul', 'pufe_verde', 'pufe_roxo', 'puff_saco', 'puff_saco_cinza',
  'cadeira_escritorio_preta', 'cadeira_escritorio_vermelha', 'cadeira_escritorio_cinza', 'mesa_escritorio_madeira', 'mesa_escritorio_preta', 'mesa_centro', 'mesa_redonda', 'mesa_redonda_madeira',
  'tapete_azul', 'tapete_cinza', 'tapete_verde', 'estante', 'gaveteiro', 'quadro_branco', 'mural', 'relogio', 'cabideiro',
  'cafeteira', 'impressora', 'frigobar', 'microondas', 'extintor', 'lixeiras_reciclagem', 'luminaria_mesa', 'headset', 'livros', 'garrafa', 'garrafa_rosa', 'caneca_azul', 'caneca_laranja',
  'vaso_flores', 'vaso_flores_amarelas', 'cacto', 'costela_adao', 'suculenta', 'arvore_interna', 'lousa', 'alertas',
  // sala gamer
  'cadeira_gamer', 'gabinete_gamer', 'arcade', 'torre_led', 'neon_gamer', 'neon_game_on', 'console_game', 'controle_game'].map(k => 'd:' + k));
const modelExists = id => BUILTIN.has(id) || models.some(m => m.id === id);
objects = readJSON(OBJECTS_FILE, []).filter(o => modelExists(o.model));
const kanban = new Kanban(DATA_DIR);
const sn = new ServiceNow(DATA_DIR, (key, version) => broadcast({ t: 'sn', key, version }));
console.log(sn.enabled ? `ServiceNow: conectado a ${sn.cfg.instance} (${sn.cfg.groups.map(g => g.label).join(', ')})` : 'ServiceNow: não configurado (data/servicenow.json)');
// salas (zonas que isolam a voz)
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');
let rooms = readJSON(ROOMS_FILE, []);
const saveRooms = () => fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 1));
// Donos fixos de sala (variável ROOM_OWNERS): reaplicados a cada subida do servidor. Serve para o dono não se perder quando o disco
// é apagado (plano grátis do Render volta ao mundo-inicial, que não guarda donos) e mantém o e-mail fora do repositório.
// Formato: {"Sala 01": {"email": "voce@empresa.com", "nome": "Seu Nome"}}  (a chave pode ser o nome ou o id da sala; "email" é o do login no jogo).
// Só preenche sala SEM dono: quem já tomou posse por dentro do jogo continua dono.
try {
  const cfg = JSON.parse(process.env.ROOM_OWNERS || "{}"), fold = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  let applied = 0;
  for (const [key, val] of Object.entries(cfg)) {
    const r = rooms.find(rr => rr.id === key || fold(rr.name) === fold(key));
    const email = String(typeof val === "string" ? val : (val && val.email) || "").trim().toLowerCase();
    if (!r || r.owner || !email) continue;
    r.owner = email; r.ownerName = String((val && val.nome) || email.split("@")[0]).slice(0, 24); applied++;
  }
  if (applied) { saveRooms(); console.log(`Donos de sala aplicados (ROOM_OWNERS): ${applied}`); }
} catch { console.warn("ROOM_OWNERS inválido (esperado JSON como {\"Sala 01\": {\"email\": \"...\", \"nome\": \"...\"}}), ignorado"); }
// ponto (pés do jogador + 1) dentro da caixa da sala
const inRoom = (r, p) => { const x = Math.floor(p[0]), y = Math.floor(p[1] + 1), z = Math.floor(p[2]); return x >= r.min[0] && x <= r.max[0] && y >= r.min[1] && y <= r.max[1] && z >= r.min[2] && z <= r.max[2]; };
// dono da sala: identificado pelo e-mail do login (ou pelo nome, se não tiver e-mail).
// Dentro de uma sala com dono (e nas paredes, chão e teto dela) só o dono edita blocos e objetos.
// ADMIN_EMAILS=a@x.com,b@x.com: quem pode liberar/editar qualquer sala (ex.: dono saiu da empresa).
const ADMINS = new Set((process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
const ownerKey = c => c.email || 'nome:' + String(c.name || '').toLowerCase();
const isAdmin = c => !!c.email && ADMINS.has(c.email);
const isOwner = (c, r) => !!r.owner && (r.owner === ownerKey(c) || isAdmin(c));
function ownedRoomBlocking(c, x, y, z) {
  if (isAdmin(c)) return null;
  const k = ownerKey(c);
  for (const r of rooms) {
    if (!r.owner || r.owner === k) continue;
    if (x >= r.min[0] - 1 && x <= r.max[0] + 1 && y >= r.min[1] - 1 && y <= r.max[1] + 1 && z >= r.min[2] - 1 && z <= r.max[2] + 1) return r;
  }
  return null;
}
const ownedMsg = r => `${r.name} é de ${r.ownerName || 'outra pessoa'}: só o dono edita lá dentro`;
// chat de cada sala (fica salvo: links, avisos…). Só quem está dentro (ou o dono) lê e escreve.
const ROOMCHAT_FILE = path.join(DATA_DIR, 'room-chat.json');
const roomChat = readJSON(ROOMCHAT_FILE, {});
let roomChatTimer = null;
const saveRoomChat = () => { clearTimeout(roomChatTimer); roomChatTimer = setTimeout(() => { fs.writeFileSync(ROOMCHAT_FILE + '.tmp', JSON.stringify(roomChat)); fs.renameSync(ROOMCHAT_FILE + '.tmp', ROOMCHAT_FILE); }, 500); };
const canRoomChat = (c, r) => inRoom(r, c.p) || isOwner(c, r);
// reservas das salas (agenda do Voxel Hub): { id, room, title, start, end (ms), by, byName }
const RESERVAS_FILE = path.join(DATA_DIR, 'reservas.json');
let reservas = readJSON(RESERVAS_FILE, []).filter(x => x.end > Date.now() - 86400000);
let reservasTimer = null;
const saveReservas = () => { clearTimeout(reservasTimer); reservasTimer = setTimeout(() => { reservas = reservas.filter(x => x.end > Date.now() - 86400000); fs.writeFileSync(RESERVAS_FILE, JSON.stringify(reservas, null, 1)); }, 300); };
// quadros brancos interativos: { idDoObjeto: [ { id, c, w, p: [[u,v]...] } ] }
const LOUSAS_FILE = path.join(DATA_DIR, 'lousas.json');
const lousas = readJSON(LOUSAS_FILE, {});
let lousasTimer = null;
const saveLousas = () => { clearTimeout(lousasTimer); lousasTimer = setTimeout(() => { fs.writeFileSync(LOUSAS_FILE + '.tmp', JSON.stringify(lousas)); fs.renameSync(LOUSAS_FILE + '.tmp', LOUSAS_FILE); }, 1000); };
// skins (PNG 64x64 ou 64x32)
const SKINS_DIR = path.join(DATA_DIR, 'skins');
fs.mkdirSync(SKINS_DIR, { recursive: true });
const okSkin = u => typeof u === 'string' && /^\/skins\/[0-9a-f]{16}\.png$/.test(u);
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const IMGCACHE_DIR = path.join(DATA_DIR, 'imgcache');
fs.mkdirSync(IMAGES_DIR, { recursive: true }); fs.mkdirSync(IMGCACHE_DIR, { recursive: true });
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const okPictureUrl = u => typeof u === 'string' && u.length <= 1000 && (/^https?:\/\/[^\s]+$/i.test(u) || /^\/images\/[0-9a-f]{16}\.(png|jpg|gif|webp)$/.test(u));
function imageType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}
const IMG_MIME = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = []; let total = 0;
    req.on('data', c => { total += c.length; if (total > max) { reject(new Error('grande demais')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
// busca a imagem de um link pelo servidor (para sites que bloqueiam o navegador), sem acessar a rede interna
const net = require('net');
function privateIP(ip) {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l.startsWith('::ffff:')) return privateIP(l.slice(7));
    return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80');
  }
  const p = ip.split('.').map(Number);
  return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || p[0] >= 224;
}
async function safeFetch(url, hops = 0) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error('protocolo não permitido');
  const addrs = await require('dns').promises.lookup(u.hostname, { all: true });
  if (!addrs.length || addrs.some(a => privateIP(a.address))) throw new Error('endereço não permitido');
  const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'VoxelHub/1.0 (image fetch)', Accept: 'image/*' } });
  const loc = r.headers.get('location');
  if (r.status >= 300 && r.status < 400 && loc) { if (hops >= 3) throw new Error('redirecionamentos demais'); return safeFetch(new URL(loc, u).href, hops + 1); }
  return r;
}
async function proxyImage(res, url) {
  try {
    if (!okPictureUrl(url) || !/^https?:/i.test(url)) throw new Error('link inválido');
    const key = require('crypto').createHash('sha1').update(url).digest('hex');
    const cached = path.join(IMGCACHE_DIR, key);
    let buf = fs.existsSync(cached) ? fs.readFileSync(cached) : null;
    if (!buf) {
      const r = await safeFetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const ab = await r.arrayBuffer();
      if (ab.byteLength > MAX_IMAGE_BYTES) throw new Error('grande demais');
      buf = Buffer.from(ab);
      if (!imageType(buf)) throw new Error('não é uma imagem');
      fs.writeFileSync(cached, buf);
    }
    res.writeHead(200, { 'Content-Type': IMG_MIME[imageType(buf)], 'Cache-Control': 'max-age=86400' });
    res.end(buf);
  } catch (e) { res.writeHead(502); res.end('não foi possível buscar a imagem: ' + e.message); }
}

// blocos protegidos (estrutura do prédio): só a Marreta de obra quebra
const PROTECT_FILE = path.join(DATA_DIR, 'protect.bin');
let protect = fs.existsSync(PROTECT_FILE) && fs.statSync(PROTECT_FILE).size === W * H * D ? new Uint8Array(fs.readFileSync(PROTECT_FILE)) : new Uint8Array(W * H * D);
let protectDirty = false, protectCompressed = null;
const getProtectCompressed = () => (protectCompressed ||= zlib.deflateSync(protect, { level: 6 }));
function saveProtect() { if (!protectDirty) return; protectDirty = false; fs.writeFileSync(PROTECT_FILE + '.tmp', protect); fs.renameSync(PROTECT_FILE + '.tmp', PROTECT_FILE); }

let dirty = false;
let compressed = null; // cache do mundo comprimido
function getCompressed() {
  if (!compressed) compressed = zlib.deflateSync(world, { level: 6 });
  return compressed;
}
function saveWorld(sync) {
  if (!dirty) return;
  dirty = false;
  const tmp = WORLD_FILE + '.tmp';
  if (sync) { fs.writeFileSync(tmp, world); fs.renameSync(tmp, WORLD_FILE); return; }
  fs.writeFile(tmp, world, err => {
    if (err) { console.error('Erro ao salvar:', err); dirty = true; return; }
    fs.rename(tmp, WORLD_FILE, e => e && console.error('Erro ao salvar:', e));
  });
}
setInterval(() => { saveWorld(false); try { saveObjects(); saveProtect(); } catch (e) { console.error(e); } }, 15000);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(sig, () => { saveWorld(true); saveObjects(); saveProtect(); console.log('\nMundo salvo. Até mais!'); process.exit(0); });

// ---------------------------------------------------------------- HTTP
const MIME = { '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };
function serveFile(res, root, rel) {
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Não encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}
function uploadModel(req, res, q) {
  const name = String(q.get('name') || 'Modelo').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40) || 'Modelo';
  const size = ['w', 'h', 'd'].map(k => Math.round(Number(q.get(k)) * 100) / 100);
  if (!size.every(v => Number.isFinite(v) && v > 0 && v <= 64)) { res.writeHead(400); return res.end('tamanho inválido'); }
  const chunks = []; let total = 0, aborted = false;
  req.on('data', c => {
    total += c.length;
    if (total > MAX_MODEL_BYTES) { aborted = true; res.writeHead(413); res.end('arquivo grande demais (máx. 30 MB)'); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    if (aborted) return;
    const buf = Buffer.concat(chunks);
    if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'glTF') { res.writeHead(400); return res.end('formato inválido'); }
    const model = { id: newId(), name, size, by: String(q.get('by') || '').slice(0, 24) };
    fs.writeFileSync(path.join(MODELS_DIR, model.id + '.glb'), buf);
    models.push(model); saveModels();
    broadcast({ t: 'model_add', model });
    console.log(`+ modelo "${name}" (${(buf.length / 1024).toFixed(0)} KB)`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(model));
  });
}
function handler(req, res) {
  const u = new URL(req.url, 'http://x');
  const url = decodeURIComponent(u.pathname);
  if (req.method === 'POST' && url === '/api/models') return uploadModel(req, res, u.searchParams);
  if (url.startsWith('/api/sn/')) {
    const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
    if (url === '/api/sn/config' && req.method === 'GET') return json(200, sn.publicConfig());
    if (url === '/api/sn/board' && req.method === 'GET') {
      const b = sn.board(u.searchParams.get('key') || '');
      if (!b) return json(404, { error: 'grupo não configurado' });
      const v = Number(u.searchParams.get('v'));
      return json(200, v && v === b.version ? { version: v, same: true } : b);
    }
    if (url === '/api/sn/journal' && req.method === 'GET') {
      sn.journal(u.searchParams.get('key') || '', u.searchParams.get('id') || '').then(list => json(200, { list }), e => json(400, { error: e.message }));
      return;
    }
    if (url === '/api/sn/update' && req.method === 'POST') {
      readBody(req, 64 * 1024).then(async buf => {
        let m; try { m = JSON.parse(buf.toString('utf8')); } catch { return json(400, { error: 'JSON inválido' }); }
        try {
          const b = await sn.update(String(m.key || ''), String(m.id || ''), { status: m.status, assignee: m.assignee, note: m.note, comment: m.comment }, { name: String(m.by || '').slice(0, 40), email: String(m.email || '').slice(0, 80) });
          const { sig, ...out } = b; json(200, out);
        } catch (e) { json(400, { error: e.message }); }
      }).catch(() => json(413, { error: 'grande demais' }));
      return;
    }
    if (url === '/api/sn/refresh' && req.method === 'POST') { sn.refreshAll().finally(() => json(200, { ok: true })); return; }
    return json(404, { error: 'rota desconhecida' });
  }
  if (url === '/api/kanban') {
    const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
    if (req.method === 'GET') {
      const v = Number(u.searchParams.get('v'));
      if (v && v === kanban.board.version) return json(200, { version: v, same: true });
      return json(200, kanban.board);
    }
    if (req.method === 'POST') {
      readBody(req, 256 * 1024).then(buf => {
        let m; try { m = JSON.parse(buf.toString('utf8')); } catch { return json(400, { error: 'JSON inválido' }); }
        const r = kanban.apply(m, m.by);
        if (r.error) return json(400, r);
        broadcast({ t: 'kanban', version: kanban.board.version }); // avisa o jogo para redesenhar os quadros
        json(200, kanban.board);
      }).catch(() => json(413, { error: 'grande demais' }));
      return;
    }
  }
  if (req.method === 'POST' && url === '/api/images') {
    readBody(req, MAX_IMAGE_BYTES).then(buf => {
      const type = imageType(buf);
      if (!type) { res.writeHead(400); return res.end('formato não suportado (use PNG, JPG, GIF ou WEBP)'); }
      const name = newId() + '.' + type;
      fs.writeFileSync(path.join(IMAGES_DIR, name), buf);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: '/images/' + name }));
    }).catch(() => { res.writeHead(413); res.end('imagem grande demais (máx. 10 MB)'); });
    return;
  }
  if (req.method === 'POST' && url === '/api/skins') {
    readBody(req, 256 * 1024).then(buf => {
      if (imageType(buf) !== 'png') { res.writeHead(400); return res.end('a skin precisa ser um PNG'); }
      const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
      if (w !== 64 || (h !== 64 && h !== 32)) { res.writeHead(400); return res.end(`a skin precisa ter 64x64 ou 64x32 pixels (essa tem ${w}x${h})`); }
      const name = newId() + '.png';
      fs.writeFileSync(path.join(SKINS_DIR, name), buf);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: '/skins/' + name }));
    }).catch(() => { res.writeHead(413); res.end('arquivo grande demais'); });
    return;
  }
  // skin de um jogador pelo nome (serviços públicos que leem o perfil oficial)
  if (url === '/api/mcskin') {
    const name = String(u.searchParams.get('name') || '');
    if (!/^[A-Za-z0-9_]{2,16}$/.test(name)) { res.writeHead(400); return res.end('nome inválido'); }
    (async () => {
      let lastErr = 'sem resposta';
      for (const src of [`https://mc-heads.net/skin/${name}`, `https://minotar.net/skin/${name}`]) {
        try {
          const r = await safeFetch(src);
          if (r.headers.get('x-direct-response') || !(r.headers.get('content-type') || '').includes('image')) { lastErr = 'bloqueado pela rede (filtro da empresa)'; continue; }
          if (!r.ok) { lastErr = 'HTTP ' + r.status; continue; }
          const buf = Buffer.from(await r.arrayBuffer());
          if (imageType(buf) !== 'png') { lastErr = 'resposta não é PNG'; continue; }
          const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
          if (w !== 64 || (h !== 64 && h !== 32)) { lastErr = `tamanho ${w}x${h}`; continue; }
          const file = newId() + '.png';
          fs.writeFileSync(path.join(SKINS_DIR, file), buf);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ url: '/skins/' + file }));
        } catch (e) { lastErr = e.message; }
      }
      res.writeHead(502); res.end('não foi possível buscar a skin: ' + lastErr);
    })();
    return;
  }
  const sk = url.match(/^\/skins\/([0-9a-f]{16}\.png)$/);
  if (sk) return serveFile(res, SKINS_DIR, sk[1]);
  if (url === '/api/img') return proxyImage(res, u.searchParams.get('u') || '');
  const im = url.match(/^\/images\/([0-9a-f]{16}\.(png|jpg|gif|webp))$/);
  if (im) return serveFile(res, IMAGES_DIR, im[1]);
  const mm = url.match(/^\/models\/([0-9a-f]{16})\.glb$/);
  if (mm) return serveFile(res, MODELS_DIR, mm[1] + '.glb');
  if (url.startsWith('/vendor/three-addons/')) {
    const rel = url.slice('/vendor/three-addons/'.length);
    const local = path.join(__dirname, 'node_modules', 'three', 'examples', 'jsm');
    if (fs.existsSync(local)) return serveFile(res, local, rel);
    res.writeHead(302, { Location: 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/' + rel.replace(/[^\w.\-\/]/g, '') });
    return res.end();
  }
  if (url.startsWith('/vendor/three/')) {
    const rel = url.slice('/vendor/three/'.length);
    if (fs.existsSync(path.join(THREE_DIR, 'three.module.js'))) return serveFile(res, THREE_DIR, rel);
    // sem npm install: usa a CDN
    res.writeHead(302, { Location: 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/' + rel.replace(/[^\w.\-\/]/g, '') });
    return res.end();
  }
  serveFile(res, PUBLIC_DIR, url === '/' ? 'index.html' : url.slice(1));
}

function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) out.push(n.address);
  return out;
}

async function getCert() {
  if (process.env.CERT_FILE && process.env.KEY_FILE) return { cert: fs.readFileSync(process.env.CERT_FILE), key: fs.readFileSync(process.env.KEY_FILE) };
  const dir = path.join(DATA_DIR, 'certs');
  const certF = path.join(dir, 'cert.pem'), keyF = path.join(dir, 'key.pem');
  const pfxF = path.join(dir, 'cert.pfx'), PFX_PASS = 'voxelhub';
  if (fs.existsSync(certF) && fs.existsSync(keyF)) return { cert: fs.readFileSync(certF), key: fs.readFileSync(keyF) };
  if (fs.existsSync(pfxF)) return { pfx: fs.readFileSync(pfxF), passphrase: PFX_PASS };
  fs.mkdirSync(dir, { recursive: true });
  let selfsigned = null;
  try { selfsigned = require('selfsigned'); } catch {}
  if (!selfsigned) {
    const san = ['DNS=localhost', 'DNS=' + os.hostname(), 'IPAddress=127.0.0.1', ...lanIPs().map(ip => 'IPAddress=' + ip)].join('&');
    try {
      // 1) openssl, se existir
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '825', '-subj', '/CN=voxel-hub', '-keyout', keyF, '-out', certF, '-addext', 'subjectAltName=' + san.replace(/&/g, ',').replace(/IPAddress=/g, 'IP:').replace(/DNS=/g, 'DNS:')], { stdio: 'ignore' });
      console.log('Certificado autoassinado criado (openssl) em', dir);
      return { cert: fs.readFileSync(certF), key: fs.readFileSync(keyF) };
    } catch {}
    if (process.platform === 'win32') {
      // 2) PowerShell do Windows
      const ps = `$c = New-SelfSignedCertificate -Subject 'CN=voxel-hub' -CertStoreLocation Cert:\\CurrentUser\\My -NotAfter (Get-Date).AddYears(2) -KeyExportPolicy Exportable -KeyAlgorithm RSA -KeyLength 2048 -TextExtension @('2.5.29.17={text}${san}');` +
        `$p = ConvertTo-SecureString -String '${PFX_PASS}' -Force -AsPlainText;` +
        `Export-PfxCertificate -Cert $c -FilePath '${pfxF.replace(/'/g, "''")}' -Password $p -CryptoAlgorithmOption AES256_SHA256 | Out-Null;` +
        `Remove-Item $c.PSPath`;
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'inherit' });
      console.log('Certificado autoassinado criado (Windows) em', dir);
      return { pfx: fs.readFileSync(pfxF), passphrase: PFX_PASS };
    }
    throw new Error('Não consegui criar um certificado HTTPS. Instale o openssl, rode "npm install", ou use HTTP=1 atrás de um proxy HTTPS.');
  }
  const altNames = [{ type: 2, value: 'localhost' }, { type: 2, value: os.hostname() }, { type: 7, ip: '127.0.0.1' }, ...lanIPs().map(ip => ({ type: 7, ip }))];
  let pems = selfsigned.generate([{ name: 'commonName', value: 'voxel-hub' }], { days: 825, keySize: 2048, algorithm: 'sha256', extensions: [{ name: 'basicConstraints', cA: false }, { name: 'subjectAltName', altNames }] });
  if (pems && typeof pems.then === 'function') pems = await pems;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(certF, pems.cert); fs.writeFileSync(keyF, pems.private);
  console.log('Certificado autoassinado criado em', dir);
  return { cert: pems.cert, key: pems.private };
}

// ---------------------------------------------------------------- jogadores
let nextId = 1;
const clients = new Map();
const spawn = [W / 2 + 0.5, CENTER_H + 1, D / 2 + 0.5];

const pub = c => ({ id: c.id, name: c.name, color: c.color, p: c.p, r: c.r, mic: c.mic, screen: c.screen, anchor: c.anchor || null, s: !!c.s, skin: c.skin || null, status: c.status || 'disp' });
const STATUS = new Set(['disp', 'ausente', 'ocupado', 'reuniao']);
function sendTo(c, msg) { if (c.ws.readyState === 1) c.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); }
function broadcast(msg, except) {
  const s = JSON.stringify(msg);
  for (const c of clients.values()) if (c.joined && c !== except) sendTo(c, s);
}
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isInt = v => Number.isInteger(v);

function onMessage(c, m) {
  if (!m || typeof m.t !== 'string') return;
  if (m.t === 'join') {
    if (c.joined) return;
    c.name = String(m.name || 'Jogador').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24) || 'Jogador';
    c.color = /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#3498db';
    c.email = /^[^\s@]{1,64}@[^\s@]{1,80}\.[^\s@]{2,20}$/.test(String(m.email || '')) ? String(m.email).trim().toLowerCase() : '';
    if (c.email && kanban.ensurePerson(c.name, c.email)) setTimeout(() => broadcast({ t: 'kanban', version: kanban.board.version }), 0);
    c.skin = okSkin(m.skin) && fs.existsSync(path.join(SKINS_DIR, m.skin.slice(7))) ? m.skin : null;
    c.status = STATUS.has(m.status) ? m.status : 'disp';
    c.pvp = m.pvp !== false;
    c.joined = true;
    sendTo(c, { t: 'welcome', id: c.id, size: [W, H, D], spawn, ice: ICE_SERVERS, models, objects, rooms, reservas, players: [...clients.values()].filter(o => o.joined && o !== c).map(pub) });
    c.ws.send(getCompressed(), { binary: true });
    c.ws.send(getProtectCompressed(), { binary: true }); // 2º binário: máscara de blocos protegidos
    broadcast({ t: 'join', player: pub(c) }, c);
    console.log(`+ ${c.name} entrou (${clients.size} conectados)`);
    return;
  }
  if (!c.joined) return;
  switch (m.t) {
    case 'pos':
      if (!Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(isNum) || !Array.isArray(m.r) || m.r.length !== 2 || !m.r.every(isNum)) return;
      c.p = m.p.map(v => Math.round(v * 100) / 100); c.r = m.r.map(v => Math.round(v * 1000) / 1000); c.s = !!m.s;
      broadcast({ t: 'pos', id: c.id, p: c.p, r: c.r, s: c.s }, c);
      break;
    case 'set': {
      const { x, y, z, b } = m;
      if (![x, y, z, b].every(isInt) || x < 0 || z < 0 || x >= W || z >= D || y < 1 || y >= H || b < 0 || b > MAX_BLOCK_ID) return;
      const now = Date.now();
      c.tokens = Math.min(40, c.tokens + (now - c.lastTok) / 1000 * 25); c.lastTok = now;
      if (c.tokens < 1) { sendTo(c, { t: 'set', x, y, z, b: world[idx(x, y, z)] }); return; }
      const i = idx(x, y, z);
      const owned = ownedRoomBlocking(c, x, y, z);
      if (owned) { sendTo(c, { t: 'set', x, y, z, b: world[i] }); sendTo(c, { t: 'denied', reason: ownedMsg(owned) }); return; }
      let unprot = false;
      if (protect[i]) {
        if (m.tool !== 'marreta') { sendTo(c, { t: 'set', x, y, z, b: world[i] }); sendTo(c, { t: 'denied', reason: 'Estrutura do prédio protegida: use a Marreta de obra (inventário → Ferramentas)' }); return; }
        protect[i] = 0; protectDirty = true; protectCompressed = null; unprot = true;
      }
      c.tokens -= 1;
      world[i] = b; dirty = true; compressed = null;
      broadcast({ t: 'set', x, y, z, b, unprot }, c);
      break;
    }
    case 'chat': {
      const text = String(m.text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 300);
      if (!text) return;
      const now = Date.now();
      if (now - c.lastChat < 300) return;
      c.lastChat = now;
      broadcast({ t: 'chat', id: c.id, name: c.name, color: c.color, text });
      break;
    }
    case 'signal': {
      const to = clients.get(m.to);
      if (to && to.joined && m.data && typeof m.data === 'object') sendTo(to, { t: 'signal', from: c.id, data: m.data });
      break;
    }
    case 'media': {
      c.mic = !!m.mic; c.screen = !!m.screen;
      const a = m.anchor;
      // âncora numa Tela (TV) de parede: { o: id do objeto }
      if (c.screen && a && typeof a.o === 'string' && objects.some(o => o.id === a.o && o.model === 'd:tv')) {
        c.anchor = { o: a.o };
        broadcast({ t: 'media', id: c.id, mic: c.mic, screen: c.screen, anchor: c.anchor }, c);
        break;
      }
      const okAnchor = c.screen && a && [a.x, a.y, a.z].every(isInt) && a.x >= 0 && a.y >= 0 && a.z >= 0 && a.x < W && a.y < H && a.z < D &&
        Array.isArray(a.n) && a.n.length === 3 && a.n.every(v => v === -1 || v === 0 || v === 1) && a.n.filter(v => v).length === 1;
      c.anchor = okAnchor ? { x: a.x, y: a.y, z: a.z, n: a.n.slice() } : null;
      broadcast({ t: 'media', id: c.id, mic: c.mic, screen: c.screen, anchor: c.anchor }, c);
      break;
    }
    case 'laser': {
      const p = m.p;
      if (p !== null && !(Array.isArray(p) && p.length === 3 && p.every(isNum))) return;
      broadcast({ t: 'laser', id: c.id, p: p && p.map(v => Math.round(v * 100) / 100) }, c);
      break;
    }
    case 'obj_add': {
      const { model, rot } = m;
      // posição livre (fora da grade): x/z é o centro do objeto, em 1/64 de bloco
      const free = m.free === true;
      const x = free && isNum(m.x) ? Math.round(m.x * 64) / 64 : m.x, z = free && isNum(m.z) ? Math.round(m.z * 64) / 64 : m.z;
      const y = isNum(m.y) ? Math.round(m.y * 100) / 100 : NaN;
      if (!modelExists(model) || !isInt(rot) || !(free ? [x, z].every(isNum) : [x, z].every(isInt)) || !isNum(y) || rot < 0 || rot > 3 || x < 0 || z < 0 || x >= W || z >= D || y < 0 || y >= H) return;
      { const owned = ownedRoomBlocking(c, Math.floor(x), Math.floor(y), Math.floor(z)); if (owned) { sendTo(c, { t: 'denied', reason: ownedMsg(owned) }); return; } }
      if (objects.length >= MAX_OBJECTS) { sendTo(c, { t: 'chat', id: 0, name: 'Servidor', color: '#e74c3c', text: 'Limite de objetos atingido.' }); return; }
      const obj = { id: newId(), model, x, y, z, rot };
      if (free) {
        // só decorações de chão/mesa e modelos importados (itens de parede, portas, quadros e telas seguem a grade)
        if (/^d:(quadro|porta|kanban|kanban_meu|tv|lousa|alertas)$/.test(model)) return;
        obj.free = true;
      }
      if (model === 'd:quadro') {
        if (!okPictureUrl(m.url) || !isInt(m.w) || !isInt(m.h) || m.w < 1 || m.w > 8 || m.h < 1 || m.h > 8) return;
        Object.assign(obj, { url: m.url, w: m.w, h: m.h });
      }
      if (model === 'd:kanban' || model === 'd:kanban_meu' || model === 'd:alertas') {
        const w = isInt(m.w) ? Math.max(2, Math.min(16, m.w)) : (model === 'd:kanban' ? 6 : 3), h = isInt(m.h) ? Math.max(1, Math.min(6, m.h)) : 2;
        Object.assign(obj, { w, h });
        if (/^(time|sn:[a-z0-9_-]{1,30})$/.test(m.source || '')) obj.source = m.source;
      }
      if (model === 'd:lousa') {
        const w = isInt(m.w) ? Math.max(1, Math.min(10, m.w)) : 3, h = isInt(m.h) ? Math.max(1, Math.min(5, m.h)) : 2;
        Object.assign(obj, { w, h });
      }
      if (model === 'd:tv') {
        const w = isInt(m.w) ? Math.max(1, Math.min(16, m.w)) : 4, h = isInt(m.h) ? Math.max(1, Math.min(5, m.h)) : 2;
        Object.assign(obj, { w, h });
      }
      if (model === 'd:porta') {
        const w = isInt(m.w) ? Math.max(1, Math.min(5, m.w)) : 2, h = isInt(m.h) ? Math.max(2, Math.min(4, m.h)) : 3;
        Object.assign(obj, { w, h });
      }
      objects.push(obj); objectsDirty = true;
      broadcast({ t: 'obj_add', obj });
      break;
    }
    case 'pvp': c.pvp = !!m.on; break;
    case 'hit': {
      const v = clients.get(m.id);
      if (!v || !v.joined || v === c || !c.pvp || !v.pvp) return;
      const now = Date.now();
      if (now - (c.lastHit || 0) < 350) return;
      const dx = v.p[0] - c.p[0], dy = v.p[1] - c.p[1], dz = v.p[2] - c.p[2];
      if (dx * dx + dy * dy + dz * dz > 6 * 6) return; // longe demais
      c.lastHit = now;
      let d = Array.isArray(m.dir) && m.dir.length === 2 && m.dir.every(isNum) ? m.dir : [dx, dz];
      const l = Math.hypot(d[0], d[1]) || 1; d = [d[0] / l, d[1] / l];
      sendTo(v, { t: 'hit', from: c.id, name: c.name, dir: d });
      broadcast({ t: 'hitfx', id: v.id, by: c.id }, v);
      break;
    }
    case 'ko': {
      const by = clients.get(m.by);
      broadcast({ t: 'ko', id: c.id, name: c.name, by: by ? by.name : '?' });
      break;
    }
    case 'status':
      if (!STATUS.has(m.s)) return;
      c.status = m.s;
      broadcast({ t: 'status', id: c.id, s: c.status }, c);
      break;
    // chamar alguém: toca um aviso para a pessoa. Quem está "Não disponível" ou "Em reunião" não recebe nada.
    case 'call': {
      const to = clients.get(m.to);
      if (!to || !to.joined || to === c) return;
      if (to.status === 'ocupado' || to.status === 'reuniao') {
        sendTo(c, { t: 'call_res', to: to.id, ok: false, reason: `${to.name} está ${to.status === 'reuniao' ? 'em reunião' : 'não disponível'}: a chamada não foi enviada para não incomodar` });
        return;
      }
      const now = Date.now(); c.lastCalls = c.lastCalls || {};
      if (now - (c.lastCalls[to.id] || 0) < 15000) { sendTo(c, { t: 'call_res', to: to.id, ok: false, reason: `Aguarde alguns segundos para chamar ${to.name} de novo` }); return; }
      c.lastCalls[to.id] = now;
      const r = rooms.find(rr => inRoom(rr, c.p));
      sendTo(to, { t: 'call', from: c.id, name: c.name, color: c.color, room: r ? r.name : null, msg: String(m.msg || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120) });
      sendTo(c, { t: 'call_res', to: to.id, ok: true, reason: `${to.name} foi chamado(a)` });
      break;
    }
    // ---- reservas das salas (agenda só do Voxel Hub)
    case 'res_add': {
      const r = rooms.find(rr => rr.id === m.room);
      const title = String(m.title || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) || 'Reunião';
      const start = Math.round(Number(m.start) / 60000) * 60000, end = Math.round(Number(m.end) / 60000) * 60000, now = Date.now();
      const fail = reason => sendTo(c, { t: 'denied', reason });
      if (!r) return fail('Sala não encontrada');
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return fail('Horário inválido: o fim precisa ser depois do início');
      if (end - start > 10 * 3600000) return fail('Uma reserva pode ter no máximo 10 horas');
      if (end < now) return fail('Esse horário já passou');
      if (start > now + 90 * 86400000) return fail('Dá para reservar até 90 dias à frente');
      if (reservas.length >= 5000) return fail('Agenda cheia');
      const clash = reservas.find(x => x.room === r.id && x.start < end && x.end > start);
      if (clash) return fail(`Já reservada nesse horário: "${clash.title}" (${clash.byName})`);
      const res = { id: newId(), room: r.id, title, start, end, by: ownerKey(c), byName: c.name };
      reservas.push(res); saveReservas();
      broadcast({ t: 'res_add', res });
      break;
    }
    case 'res_del': {
      const i = reservas.findIndex(x => x.id === m.id);
      if (i < 0) return;
      const x = reservas[i], r = rooms.find(rr => rr.id === x.room);
      if (x.by !== ownerKey(c) && !isAdmin(c) && !(r && isOwner(c, r))) { sendTo(c, { t: 'denied', reason: `Só ${x.byName} (ou o dono da sala) pode cancelar essa reserva` }); return; }
      reservas.splice(i, 1); saveReservas();
      broadcast({ t: 'res_del', id: x.id, by: c.name });
      break;
    }
    // ---- quadro branco interativo: traços ao vivo (u,v de 0 a 1 na superfície do quadro)
    case 'wb_get': {
      const o = objects.find(oo => oo.id === m.id && oo.model === 'd:lousa');
      if (o) sendTo(c, { t: 'wb_all', id: o.id, strokes: lousas[o.id] || [] });
      break;
    }
    case 'wb_seg': {
      const o = objects.find(oo => oo.id === m.id && oo.model === 'd:lousa');
      if (!o || typeof m.sid !== 'string' || m.sid.length > 40 || !Array.isArray(m.pts) || !m.pts.length || m.pts.length > 300) return;
      const pts = [];
      for (const p of m.pts) { if (!Array.isArray(p) || p.length !== 2 || !p.every(isNum)) return; pts.push([Math.round(Math.max(0, Math.min(1, p[0])) * 10000) / 10000, Math.round(Math.max(0, Math.min(1, p[1])) * 10000) / 10000]); }
      const col = m.c === 'erase' || /^#[0-9a-f]{6}$/i.test(m.c) ? m.c : '#111111';
      const w = isNum(m.w) ? Math.max(1, Math.min(80, Math.round(m.w))) : 4;
      const list = lousas[o.id] || (lousas[o.id] = []);
      let s = list.find(x => x.id === m.sid);
      if (!s) { if (list.length >= 4000) list.splice(0, 500); s = { id: m.sid, c: col, w, p: [] }; list.push(s); }
      if (s.p.length + pts.length > 5000) return;
      s.p.push(...pts); saveLousas();
      broadcast({ t: 'wb_seg', id: o.id, sid: s.id, c: s.c, w: s.w, pts }, c);
      break;
    }
    case 'wb_clear': {
      const o = objects.find(oo => oo.id === m.id && oo.model === 'd:lousa');
      if (!o) return;
      lousas[o.id] = []; saveLousas();
      broadcast({ t: 'wb_clear', id: o.id, by: c.name });
      break;
    }
    case 'wb_undo': {
      // desfaz o último traço desta pessoa (sid começa com o id do cliente)
      const list = lousas[m.id];
      if (!list) return;
      for (let i = list.length - 1; i >= 0; i--) if (list[i].id.startsWith(c.id + ':')) { const [s] = list.splice(i, 1); saveLousas(); broadcast({ t: 'wb_del', id: m.id, sid: s.id }); break; }
      break;
    }
    case 'skin':
      c.skin = okSkin(m.url) ? m.url : null;
      broadcast({ t: 'skin', id: c.id, url: c.skin }, c);
      break;
    case 'room_add': {
      const name = String(m.name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40) || 'Sala';
      const okv = v => Array.isArray(v) && v.length === 3 && v.every(isInt);
      if (!okv(m.min) || !okv(m.max) || rooms.length >= 500) return;
      const min = m.min.map((v, i) => Math.max(0, Math.min(v, m.max[i]))), max = m.max.map((v, i) => Math.min([W, H, D][i] - 1, Math.max(v, m.min[i])));
      const room = { id: newId(), name, min, max };
      rooms.push(room); saveRooms();
      broadcast({ t: 'room_add', room });
      break;
    }
    case 'room_lock': {
      const r = rooms.find(rr => rr.id === m.id);
      if (!r || !inRoom(r, c.p)) return; // só quem está dentro tranca/destranca
      r.locked = !!m.locked; r.lockedBy = r.locked ? c.name : undefined; saveRooms();
      broadcast({ t: 'room_upd', room: r });
      break;
    }
    case 'room_del': {
      const i = rooms.findIndex(r => r.id === m.id);
      if (i < 0) return;
      if (rooms[i].owner && !isOwner(c, rooms[i])) { sendTo(c, { t: 'denied', reason: `${rooms[i].name} é de ${rooms[i].ownerName}: só o dono apaga` }); return; }
      rooms.splice(i, 1); saveRooms();
      if (roomChat[m.id]) { delete roomChat[m.id]; saveRoomChat(); }
      if (reservas.some(x => x.room === m.id)) { reservas = reservas.filter(x => x.room !== m.id); saveReservas(); }
      broadcast({ t: 'room_del', id: m.id });
      break;
    }
    // tomar posse (sala sem dono, estando dentro) / liberar (dono ou admin) / renomear (dono)
    case 'room_claim': {
      const r = rooms.find(rr => rr.id === m.id);
      if (!r) return;
      if (r.owner) { sendTo(c, { t: 'denied', reason: `${r.name} já é de ${r.ownerName}` }); return; }
      if (!inRoom(r, c.p)) { sendTo(c, { t: 'denied', reason: 'Entre na sala para tomar posse dela' }); return; }
      r.owner = ownerKey(c); r.ownerName = c.name; saveRooms();
      broadcast({ t: 'room_upd', room: r, by: c.name, ev: 'claim' });
      console.log(`  ${c.name} tomou posse de ${r.name}`);
      break;
    }
    case 'room_release': {
      const r = rooms.find(rr => rr.id === m.id);
      if (!r || !r.owner || !isOwner(c, r)) return;
      delete r.owner; delete r.ownerName; saveRooms();
      broadcast({ t: 'room_upd', room: r, by: c.name, ev: 'release' });
      break;
    }
    case 'room_rename': {
      const r = rooms.find(rr => rr.id === m.id);
      const name = String(m.name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);
      if (!r || !name || !isOwner(c, r)) return;
      r.name = name; saveRooms();
      broadcast({ t: 'room_upd', room: r });
      break;
    }
    case 'rchat_get': {
      const r = rooms.find(rr => rr.id === m.id);
      if (!r || !canRoomChat(c, r)) return;
      sendTo(c, { t: 'rchat_hist', id: r.id, list: roomChat[r.id] || [] });
      break;
    }
    case 'rchat': {
      const r = rooms.find(rr => rr.id === m.id);
      const text = String(m.text || '').replace(/[\u0000-\u0009\u000b-\u001f]/g, '').trim().slice(0, 1000);
      if (!r || !text || !canRoomChat(c, r)) return;
      const now = Date.now();
      if (now - c.lastChat < 300) return;
      c.lastChat = now;
      const msg = { at: now, name: c.name, color: c.color, text };
      const list = roomChat[r.id] || (roomChat[r.id] = []);
      list.push(msg); if (list.length > 300) list.splice(0, list.length - 300);
      saveRoomChat();
      const s = JSON.stringify({ t: 'rchat', id: r.id, room: r.name, msg });
      for (const o of clients.values()) if (o.joined && canRoomChat(o, r)) sendTo(o, s);
      break;
    }
    case 'obj_update': {
      const obj = objects.find(o => o.id === m.id);
      if (!obj) return;
      { const owned = ownedRoomBlocking(c, Math.floor(obj.x), Math.floor(obj.y), Math.floor(obj.z)); if (owned) { sendTo(c, { t: 'denied', reason: ownedMsg(owned) }); return; } }
      if (obj.model === 'd:quadro') {
        if (!okPictureUrl(m.url)) return;
        obj.url = m.url;
      } else if (obj.model === 'd:lousa') {
        if (!isInt(m.w) || !isInt(m.h) || m.w < 1 || m.w > 10 || m.h < 1 || m.h > 5) return;
        obj.w = m.w; obj.h = m.h;
      } else if (obj.model === 'd:kanban' || obj.model === 'd:kanban_meu' || obj.model === 'd:alertas') {
        // novo tamanho e/ou fonte do quadro Kanban (time interno ou um grupo do ServiceNow)
        if (m.w !== undefined || m.h !== undefined) {
          if (!isInt(m.w) || !isInt(m.h) || m.w < 2 || m.w > 16 || m.h < 1 || m.h > 6) return;
          obj.w = m.w; obj.h = m.h;
        }
        if (m.source !== undefined) { if (!/^(time|sn:[a-z0-9_-]{1,30})$/.test(m.source)) return; obj.source = m.source; }
        // colunas que aparecem no quadro (null = todas)
        if (m.cols !== undefined) {
          if (m.cols === null) delete obj.cols;
          else if (Array.isArray(m.cols) && m.cols.length >= 1 && m.cols.length <= 60 && m.cols.every(s => typeof s === 'string' && s.length <= 80)) obj.cols = m.cols.slice();
          else return;
        }
      } else if (obj.model === 'd:tv') {
        if (!isInt(m.w) || !isInt(m.h) || m.w < 1 || m.w > 16 || m.h < 1 || m.h > 5) return;
        obj.w = m.w; obj.h = m.h;
      } else return;
      objectsDirty = true;
      broadcast({ t: 'obj_update', obj });
      break;
    }
    case 'obj_del': {
      const i = objects.findIndex(o => o.id === m.id);
      if (i < 0) return;
      { const o = objects[i], owned = ownedRoomBlocking(c, Math.floor(o.x), Math.floor(o.y), Math.floor(o.z)); if (owned) { sendTo(c, { t: 'denied', reason: ownedMsg(owned) }); return; } }
      objects.splice(i, 1); objectsDirty = true;
      if (lousas[m.id]) { delete lousas[m.id]; saveLousas(); }
      broadcast({ t: 'obj_del', id: m.id });
      break;
    }
    case 'model_del': {
      const i = models.findIndex(md => md.id === m.id);
      if (i < 0) return;
      const [md] = models.splice(i, 1); saveModels();
      fs.unlink(path.join(MODELS_DIR, md.id + '.glb'), () => {});
      objects = objects.filter(o => o.model !== md.id); objectsDirty = true;
      broadcast({ t: 'model_del', id: md.id });
      console.log(`- modelo "${md.name}" apagado por ${c.name}`);
      break;
    }
  }
}

async function main() {
  const server = USE_HTTP ? http.createServer(handler) : https.createServer(await getCert(), handler);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256 * 1024 });
  wss.on('connection', ws => {
    const c = { id: nextId++, ws, joined: false, name: '', color: '#3498db', p: spawn.slice(), r: [0, 0], mic: false, screen: false, tokens: 40, lastTok: Date.now(), lastChat: 0, alive: true };
    clients.set(c.id, c);
    ws.on('pong', () => { c.alive = true; });
    ws.on('message', (raw, isBinary) => {
      if (isBinary) return;
      let m; try { m = JSON.parse(raw.toString()); } catch { return; }
      try { onMessage(c, m); } catch (e) { console.error(e); }
    });
    ws.on('close', () => {
      clients.delete(c.id);
      if (c.joined) { broadcast({ t: 'leave', id: c.id }); console.log(`- ${c.name} saiu (${clients.size} conectados)`); }
    });
  });
  setInterval(() => {
    for (const c of clients.values()) { if (!c.alive) { c.ws.terminate(); continue; } c.alive = false; c.ws.ping(); }
  }, 30000);
  // sala trancada e vazia destranca sozinha
  setInterval(() => {
    let changed = false;
    for (const r of rooms) {
      if (!r.locked) continue;
      if ([...clients.values()].some(c => c.joined && inRoom(r, c.p))) continue;
      r.locked = false; r.lockedBy = undefined; changed = true;
      broadcast({ t: 'room_upd', room: r });
    }
    if (changed) saveRooms();
  }, 3000);
  // ao iniciar, nenhuma sala fica trancada
  if (rooms.some(r => r.locked)) { rooms.forEach(r => { r.locked = false; delete r.lockedBy; }); saveRooms(); }

  server.listen(PORT, () => {
    const proto = USE_HTTP ? 'http' : 'https';
    console.log(`\nVoxel Hub rodando!`);
    console.log(`  Neste PC:   ${proto}://localhost:${PORT}`);
    for (const ip of lanIPs()) console.log(`  Na rede:    ${proto}://${ip}:${PORT}`);
    if (!USE_HTTP) console.log('  (certificado autoassinado: no navegador clique em "Avançado" > "Continuar")');
    console.log('Ctrl+C para salvar e sair.\n');
  });
}
main();
