import * as THREE from 'three';
import { BLOCKS, BLOCK_IDS, buildAtlas, blockIcon, isSolid } from './blocks.js';
import { World } from './world.js';
import { Avatar, LaserBeam, STATUS_COLORS, STATUS_LABELS, buildHand, loadSkinTexture } from './avatars.js';
import { RTC } from './rtc.js';
import { Screens, TELA } from './screens.js';
import { Particles } from './particles.js';
import { Models, buildModelGLB, uploadModel, placement } from './models.js';
import { DECOR_IDS, tickGifs } from './decor.js';
import { soundField } from './sound.js';
import { WorldMap } from './map.js';
import { Rooms } from './rooms.js';
import { drawKanban, drawAlerts } from './kanban-draw.js';
import { makeSkin, frontPreview, randomParams, TONES, HAIR_COLORS, CLOTH_COLORS, EYE_COLORS, HAIR_STYLES, TOPS, EXTRAS } from './skinmaker.js';

const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem('vx_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('vx_' + k, JSON.stringify(v)); } catch {} },
};

// ------------------------------------------------------------ cena
const canvas = $('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); // ajustado pela "Qualidade gráfica" nas configurações
const SKY = 0x9fd3ff;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 70, 190);
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 600);
camera.rotation.order = 'YXZ';
scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(0.5, 1, 0.3); scene.add(sun);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const atlasTex = new THREE.CanvasTexture(buildAtlas());
atlasTex.magFilter = atlasTex.minFilter = THREE.NearestFilter;
atlasTex.generateMipmaps = false;
atlasTex.colorSpace = THREE.SRGBColorSpace;
const voxelMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, alphaTest: 0.5 });

const highlight = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }));
highlight.visible = false; scene.add(highlight);
const particles = new Particles(scene, buildAtlas());
const models = new Models(scene);
const screens = new Screens(scene, models);
const rooms = new Rooms(scene);
let roomCornerA = null, myRoom = null;
let myLaser = null; // criado ao entrar (usa a cor do jogador)

// nuvens simples
const clouds = new THREE.Group();
{
  // todas as nuvens numa geometria só (1 desenho)
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pos = [], idx = [];
  for (let i = 0; i < 40; i++) {
    const g = new THREE.BoxGeometry(10 + r() * 24, 2, 8 + r() * 16);
    g.translate(r() * 420 - 80, 72 + r() * 6, r() * 420 - 80);
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array);
    for (const k of g.index.array) idx.push(base + k);
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
  clouds.add(new THREE.Mesh(geo, mat));
  scene.add(clouds);
}

// ------------------------------------------------------------ estado
const HALF = 0.3, HEIGHT = 1.8, EYE = 1.62;
const me = { name: '', color: '', pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: false, fly: false };
let ws = null, myId = null, welcome = null, world = null, rtc = null, audioCtx = null;
const players = new Map(); // id -> info
const avatars = new Map(); // id -> Avatar
const pendingSets = [];
// itens da barra: { k: 'b', id } bloco · { k: 'm', id } modelo 3D · { k: 'laser' } · null vazio
const B = id => ({ k: 'b', id });
let hotbar = store.get('hotbar2', null);
if (!Array.isArray(hotbar)) {
  const old = store.get('hotbar', null);
  hotbar = Array.isArray(old) ? old.map(id => (BLOCKS[id] ? B(id) : null)) : [B(1), B(4), B(9), B(8), B(11), B(13), { k: 'm', id: 'd:tv' }, { k: 'laser' }, null];
}
// o bloco Tela virou o objeto Tela (TV) de parede
hotbar = hotbar.map(it => (it && it.k === 'b' && it.id === 29 ? { k: 'm', id: 'd:tv' } : it));
hotbar = hotbar.slice(0, 9).map(it => (it && (['laser', 'room', 'marreta', 'm'].includes(it.k) || (it.k === 'b' && BLOCKS[it.id])) ? it : null));
while (hotbar.length < 9) hotbar.push(null);
const saveHotbar = () => store.set('hotbar2', hotbar);
let slot = 0, modelRot = 0;
const item = () => hotbar[slot];
let locked = false, chatOpen = false, pickerOpen = false, viewerId = null;
let voiceMode = store.get('voiceMode', 'prox');
let sharing = false, myAnchor = null, localScreenVideo = null, screenBusy = false, mySpeaking = false;
let noiseLevel = store.get('noise', 'normal');
let screenMode = store.get('screenMode', 'text'); // 'text' (nítido) ou 'motion' (vídeo fluido)
let freePlace = store.get('freePlace', true);     // decorações fora da grade (tecla X)
const keys = new Set();

// ------------------------------------------------------------ tela de entrada
const COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#4f5bd5', '#9b59b6', '#e84393', '#ecf0f1', '#7f8c8d', '#34495e'];
me.color = store.get('color', COLORS[Math.floor(Math.random() * COLORS.length)]);
$('#name').value = store.get('name', '');
$('#email').value = store.get('email', '');
$('#email').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
for (const c of COLORS) {
  const b = document.createElement('button');
  b.style.background = c; b.title = c;
  if (c === me.color) b.classList.add('sel');
  b.onclick = () => { me.color = c; document.querySelectorAll('#colors button').forEach(x => x.classList.toggle('sel', x === b)); };
  $('#colors').appendChild(b);
}
$('#name').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
$('#joinBtn').onclick = join;
$('#name').focus();

function join() {
  me.name = $('#name').value.trim().slice(0, 24) || 'Jogador';
  me.email = $('#email').value.trim().toLowerCase().slice(0, 80);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(me.email)) { $('#joinErr').textContent = 'Informe seu e-mail corporativo (é usado no Kanban e no ServiceNow).'; $('#email').focus(); return; }
  store.set('name', me.name); store.set('color', me.color); store.set('email', me.email);
  $('#mLogoutWho').textContent = me.name;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  $('#join').classList.add('hidden');
  $('#loading').classList.remove('hidden');
  connect();
}

// ------------------------------------------------------------ rede
function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => send({ t: 'join', name: me.name, email: me.email, color: me.color, skin: store.get('skin', null), status: statusManual, pvp: settings.pvp });
  let bins = 0;
  ws.onmessage = e => {
    if (typeof e.data === 'string') return onMsg(JSON.parse(e.data));
    if (bins++ === 0) onWorld(e.data); else onProtect(e.data); // 1º binário: mundo · 2º: blocos protegidos
  };
  ws.onclose = () => { $('#disconnected').classList.remove('hidden'); if (document.pointerLockElement) document.exitPointerLock(); };
}

function onMsg(m) {
  switch (m.t) {
    case 'welcome':
      myId = m.id; welcome = m;
      rtc = new RTC({
        send, iceServers: m.ice, audioCtx, noiseLevel,
        onVideo: (id, v) => { const a = avatars.get(id); if (a) a.attachVideo(v); refreshScreen(id); },
        onSpeaking: (id, s) => { const a = avatars.get(id); if (a) a.setSpeaking(s); renderPlayers(); },
        onLocalSpeaking: s => { mySpeaking = s; renderPlayers(); $('#btnMic').classList.toggle('talk', s); },
      });
      for (const p of m.players) { addPlayer(p); rtc.call(p.id); }
      for (const md of m.models || []) models.addModel(md);
      for (const o of m.objects || []) models.addObject(o);
      rooms.set(m.rooms || []);
      reservas = m.reservas || [];
      fetchKanban();
      // remove da barra modelos que não existem mais
      hotbar = hotbar.map(it => (it && it.k === 'm' && !models.meta(it.id) ? null : it));
      myLaser = new LaserBeam(scene);
      // seu próprio avatar (aparece em terceira pessoa)
      myAvatar = new Avatar(scene, { id: 'me', name: me.name, color: me.color, status: myStatus });
      myAvatar.tag.visible = false; myAvatar.group.visible = false;
      if (store.get('skin', null)) myAvatar.setSkin(store.get('skin', null));
      rebuildHand();
      applySettings();
      break;
    case 'model_add': models.addModel(m.model); sysMsg(`Novo modelo 3D na biblioteca: ${m.model.name}`); if (pickerOpen) renderInventory(); break;
    case 'model_del':
      models.removeModel(m.id);
      hotbar = hotbar.map(it => (it && it.k === 'm' && it.id === m.id ? null : it)); saveHotbar();
      if (!loading && world) renderHotbar();
      if (pickerOpen) renderInventory();
      break;
    case 'obj_add': models.addObject(m.obj); break;
    case 'obj_del': {
      const o = models.objects.get(m.id);
      if (o) particles.burst(o.data.x, o.data.y, o.data.z, 12);
      models.removeObject(m.id);
      if (o && o.meta.tv) { if (myAnchor && myAnchor.o === m.id) stopShare(); refreshAllScreens(); }
      break;
    }
    case 'laser': { const a = avatars.get(m.id); if (a) a.setLaser(m.p); break; }
    case 'join': addPlayer(m.player); sysMsg(`${m.player.name} entrou`); break;
    case 'leave': { const p = players.get(m.id); if (p) sysMsg(`${p.name} saiu`); removePlayer(m.id); break; }
    case 'pos': { const a = avatars.get(m.id); if (a) { a.setTarget(m.p, m.r); a.sit = !!m.s; } const p = players.get(m.id); if (p) { p.p = m.p; } break; }
    case 'obj_update': models.updateObject(m.obj); if (models.objects.get(m.obj.id)?.meta.tv) refreshAllScreens(); break;
    case 'room_add': rooms.add(m.room); break;
    case 'room_del': rooms.remove(m.id); break;
    case 'room_upd': {
      const was = rooms.get(m.room.id);
      rooms.update(m.room);
      if (was && was.locked !== m.room.locked) sysMsg(`🔒 ${m.room.name} foi ${m.room.locked ? 'trancada por ' + (m.room.lockedBy || '?') : 'destrancada'}`);
      if (m.ev === 'claim') sysMsg(`👑 ${m.by} tomou posse de ${m.room.name}`);
      else if (m.ev === 'release') sysMsg(`👑 ${m.room.name} foi liberada por ${m.by}`);
      if (myRoom && myRoom.id === m.room.id) myRoom = rooms.get(m.room.id);
      updateRoomHud();
      if (rchatRoom === m.room.id) renderRchatHead();
      break;
    }
    case 'rchat_hist': if (rchatRoom === m.id) { rchatMsgs = m.list; renderRchat(); } break;
    case 'rchat': {
      if (rchatRoom === m.id) { rchatMsgs.push(m.msg); renderRchat(); }
      else {
        // fora do painel: aparece no chat normal, marcado com o nome da sala
        const el = document.createElement('div'); el.className = 'msg';
        const who = document.createElement('span'); who.className = 'who'; who.style.color = m.msg.color; who.textContent = `💬 [${m.room}] ${m.msg.name}`;
        el.append(who, linkify(m.msg.text));
        addLine(el);
        if (myRoom && myRoom.id === m.id) { rchatUnread++; updateRoomHud(); }
      }
      break;
    }
    case 'hit': onHit(m); break;
    case 'call': onCall(m); break;
    case 'call_res': toast((m.ok ? '🔔 ' : '🔕 ') + m.reason); break;
    case 'res_add': reservas = reservas.filter(x => x.id !== m.res.id); reservas.push(m.res); onReservasChanged();
      if (agendaRoom === m.res.room) toast(`📅 Reservado: ${m.res.title} · ${fmtH(m.res.start)}–${fmtH(m.res.end)}`); break;
    case 'res_del': reservas = reservas.filter(x => x.id !== m.id); onReservasChanged(); break;
    case 'wb_all': case 'wb_seg': case 'wb_clear': case 'wb_del': onWb(m); break;
    case 'kanban': fetchKanban(); break;
    case 'sn': if (snBoards.has(m.key)) fetchSnBoard(m.key); break;
    case 'hitfx': {
      const v = avatars.get(m.id); if (v) v.hurt();
      const by = m.by === myId ? myAvatar : avatars.get(m.by); if (by) by.swing();
      if (v && camera.position.distanceTo(v.pos) < 20) hitSound(m.by === myId ? 0.5 : 0.25);
      break;
    }
    case 'ko': sysMsg(`💥 ${m.name} foi nocauteado por ${m.by}`); break;
    case 'status': { const p = players.get(m.id); if (p) p.status = m.s; const a = avatars.get(m.id); if (a) a.setStatus(m.s); renderPlayers(); break; }
    case 'skin': { const a = avatars.get(m.id); const p = players.get(m.id); if (p) p.skin = m.url; if (a) a.setSkin(m.url); break; }
    case 'set':
      if (m.unprot && protectMask) protectMask[m.x + welcome.size[0] * (m.z + welcome.size[2] * m.y)] = 0;
      if (!world) { pendingSets.push(m); break; }
      applySet(m.x, m.y, m.z, m.b);
      break;
    case 'denied': toast('🛡️ ' + m.reason); break;
    case 'chat': chatMsg(m.name, m.color, m.text); break;
    case 'signal': if (rtc) rtc.onSignal(m.from, m.data); break;
    case 'media': {
      const p = players.get(m.id); if (!p) break;
      const wasSharing = p.screen;
      p.mic = m.mic; p.screen = m.screen; p.anchor = m.anchor || null;
      const a = avatars.get(m.id); if (a) a.setMedia(m.mic, m.screen);
      refreshScreen(m.id);
      if (m.screen && !wasSharing) sysMsg(`${p.name} começou a compartilhar a tela`);
      if (!m.screen && viewerId === m.id) closeViewer();
      renderPlayers();
      break;
    }
  }
}

let protectMask = null;
async function onProtect(buf) {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate'));
  protectMask = new Uint8Array(await new Response(stream).arrayBuffer());
}
const isProtected = (x, y, z) => !!(protectMask && welcome && protectMask[x + welcome.size[0] * (z + welcome.size[2] * y)]);
async function onWorld(buf) {
  const [W, H, D] = welcome.size;
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate'));
  const data = new Uint8Array(await new Response(stream).arrayBuffer());
  world = new World(W, H, D, data, scene, voxelMat);
  for (const s of pendingSets.splice(0)) world.set(s.x, s.y, s.z, s.b);
  screens.setWorld(world);
  for (const id of players.keys()) refreshScreen(id);
  const saved = store.get('pos:' + location.host, null);
  if (saved && saved.p && saved.p.every(Number.isFinite) && saved.p[0] > 0 && saved.p[0] < W && saved.p[2] > 0 && saved.p[2] < D) {
    me.pos.set(saved.p[0], saved.p[1], saved.p[2]); me.yaw = saved.yaw || 0; me.pitch = saved.pitch || 0; me.fly = !!saved.fly;
  } else me.pos.set(...welcome.spawn);
  let guard = 0;
  while (collidesAt(me.pos) && guard++ < H) me.pos.y += 1;
  world.queueAll(me.pos);
  worldMap = new WorldMap(world, buildAtlas());
  loading = true;
}
let loading = false;

// ------------------------------------------------------------ mapa
let worldMap = null, lastMap = 0, mapOpen = false;
const mapView = { cx: 128, cz: 128, span: 128 };
function drawMap(now) {
  if (!worldMap) return;
  if (now - lastMap < (mapOpen ? 33 : 120)) return;
  lastMap = now;
  const marks = [];
  if (mapFocus && now > mapFocus.until) mapFocus = null;
  for (const a of avatars.values()) marks.push({ x: a.pos.x, z: a.pos.z, color: a.color, name: a.name, focus: !!(mapFocus && mapFocus.id === a.id), t: now });
  marks.push({ x: me.pos.x, z: me.pos.z, yaw: me.yaw, me: true, name: 'Você' });
  if (mapOpen) worldMap.draw($('#bigmapCanvas'), mapView, marks, true, rooms.list);
  worldMap.draw($('#minimap'), { cx: me.pos.x, cz: me.pos.z, span: 72 }, marks, false, rooms.list);
}
// mapa grande: arrastar move, rodinha dá zoom, duplo clique centraliza em você
function centerMap() { mapView.cx = me.pos.x; mapView.cz = me.pos.z; }
function clampMap() {
  const W = world.W, D = world.D;
  mapView.span = Math.max(16, Math.min(Math.max(W, D) * 1.25, mapView.span));
  mapView.cx = Math.max(0, Math.min(W, mapView.cx));
  mapView.cz = Math.max(0, Math.min(D, mapView.cz));
}
function openMap() {
  if (!worldMap) return;
  mapOpen = true; centerMap(); clampMap();
  if (document.pointerLockElement) document.exitPointerLock();
  $('#bigmap').classList.remove('hidden');
  lastMap = 0; updateOverlays();
}
function closeMap(relock) {
  mapOpen = false; mapDrag = null;
  $('#bigmap').classList.add('hidden');
  if (relock) lock();
  updateOverlays();
}
let mapDrag = null;
{
  const cv = $('#bigmapCanvas');
  const toWorld = (e) => {
    const r = cv.getBoundingClientRect();
    return { x: mapView.cx + ((e.clientX - r.left) / r.width - 0.5) * mapView.span, z: mapView.cz + ((e.clientY - r.top) / r.height - 0.5) * mapView.span, r };
  };
  cv.addEventListener('mousedown', e => { if (e.button === 0) { mapDrag = { x: e.clientX, y: e.clientY }; cv.classList.add('grab'); e.preventDefault(); } });
  addEventListener('mousemove', e => {
    if (!mapDrag || !mapOpen) return;
    const r = cv.getBoundingClientRect();
    mapView.cx -= (e.clientX - mapDrag.x) / r.width * mapView.span;
    mapView.cz -= (e.clientY - mapDrag.y) / r.height * mapView.span;
    mapDrag = { x: e.clientX, y: e.clientY };
    clampMap(); lastMap = 0;
  });
  addEventListener('mouseup', () => { mapDrag = null; cv.classList.remove('grab'); });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const before = toWorld(e);
    mapView.span *= Math.pow(1.15, Math.sign(e.deltaY));
    clampMap();
    // mantém o ponto embaixo do mouse no mesmo lugar
    const after = toWorld(e);
    mapView.cx += before.x - after.x; mapView.cz += before.z - after.z;
    clampMap(); lastMap = 0;
  }, { passive: false });
  cv.addEventListener('dblclick', () => { centerMap(); lastMap = 0; });
  $('#mapCenter').onclick = () => { centerMap(); lastMap = 0; };
  $('#mapClose').onclick = () => closeMap(true);
}

// ------------------------------------------------------------ presença
// o que você escolhe manda; em "Disponível", vira "Em reunião" numa sala de reunião e "Ausente" após 5 min parado
let statusManual = store.get('status', 'disp'), myStatus = statusManual, lastActivity = performance.now();
const ORDER = ['disp', 'ocupado', 'ausente', 'reuniao'];
for (const ev of ['keydown', 'mousedown', 'mousemove', 'wheel']) addEventListener(ev, () => { lastActivity = performance.now(); }, { passive: true, capture: true });
function setManualStatus(s) {
  statusManual = s; store.set('status', s);
  updateStatus(true);
  toast('Status: ' + STATUS_LABELS[myStatus] + (s === 'disp' ? ' (automático: muda sozinho em reunião ou parado)' : ''));
}
function updateStatus(force) {
  let s = statusManual;
  if (s === 'disp') {
    if (myRoom && /reuni/i.test(myRoom.name)) s = 'reuniao';
    else if (performance.now() - lastActivity > 5 * 60 * 1000) s = 'ausente';
  }
  if (s !== myStatus || force) {
    const changed = s !== myStatus;
    myStatus = s;
    if (changed || force) send({ t: 'status', s });
    renderPlayers(); renderStatusInd();
  }
}
function renderStatusInd() {
  $('#indStatus .sdot').style.background = STATUS_COLORS[myStatus];
  $('#indStatus span:last-child').textContent = STATUS_LABELS[myStatus] + (statusManual === 'disp' && myStatus !== 'disp' ? ' (auto)' : '');
  $('#menuStatus').value = statusManual;
}
$('#menuStatus').onchange = e => setManualStatus(e.target.value);

// nome da sala onde você está (canto da tela) e aviso ao entrar/sair
let lastRoomId = null;
// eu sou o dono? (mesma chave que o servidor usa: e-mail do login, ou o nome se não tiver e-mail)
const myKey = () => me.email || 'nome:' + String(me.name || '').toLowerCase();
const isMine = r => !!(r && r.owner && r.owner === myKey());
// sala com dono (outra pessoa) que cobre esse bloco: a caixa da sala + 1 bloco (paredes, chão e teto)
function ownedBy(x, y, z) {
  for (const r of rooms.list) {
    if (!r.owner || isMine(r)) continue;
    if (x >= r.min[0] - 1 && x <= r.max[0] + 1 && y >= r.min[1] - 1 && y <= r.max[1] + 1 && z >= r.min[2] - 1 && z <= r.max[2] + 1) return r;
  }
  return null;
}
let lastOwnedToast = 0;
function ownedDenied(x, y, z) {
  const r = ownedBy(Math.floor(x), Math.floor(y), Math.floor(z));
  if (!r) return false;
  if (performance.now() - lastOwnedToast > 2000) { lastOwnedToast = performance.now(); toast(`👑 ${r.name} é de ${r.ownerName || 'outra pessoa'}: só o dono edita lá dentro`); }
  return true;
}
let rchatUnread = 0;
function updateRoomHud() {
  const el = $('#roomLabel');
  if (myRoom) { const ag = agendaLabel(myRoom); el.textContent = `${myRoom.locked ? '🔒' : '🚪'} ${myRoom.name}${myRoom.owner ? ' · 👑 ' + (isMine(myRoom) ? 'sua' : myRoom.ownerName) : ''}${ag ? ' · ' + ag : ''}`; el.classList.remove('hidden'); }
  else el.classList.add('hidden');
  // botões laterais (aparecem só dentro de uma sala): trancar, tomar posse, chat da sala
  $('#roomBtns').classList.toggle('hidden', !myRoom);
  if (myRoom) {
    const lb = $('#lockBtn');
    lb.classList.toggle('locked', !!myRoom.locked);
    $('#lockBtn .lbl').textContent = myRoom.locked ? `Destrancar ${myRoom.name}` : `Trancar ${myRoom.name}`;
    $('#lockBtn .ico').textContent = myRoom.locked ? '🔒' : '🔓';
    const ob = $('#ownBtn'), mine = isMine(myRoom);
    ob.classList.toggle('mine', mine); ob.classList.toggle('other', !!myRoom.owner && !mine);
    $('#ownBtn .lbl').textContent = mine ? 'Sua sala · liberar' : myRoom.owner ? `Dono: ${myRoom.ownerName}` : 'Tomar posse da sala';
    $('#ownBtn kbd').classList.toggle('hidden', !!myRoom.owner && !mine);
    $('#rchatBadge').textContent = rchatUnread ? String(rchatUnread) : '';
  }
  const id = myRoom ? myRoom.id : null;
  if (id !== lastRoomId) {
    rchatUnread = 0; $('#rchatBadge').textContent = '';
    if (myRoom) toast(`Você entrou em ${myRoom.name}${myRoom.owner ? ` (de ${isMine(myRoom) ? 'você' : myRoom.ownerName})` : ''} — só quem está aqui te ouve · J: chat da sala`);
    else if (lastRoomId) toast('Você saiu da sala');
    if (rchatRoom && rchatRoom !== id && !isMine(rooms.get(rchatRoom))) closeRchat();
    lastRoomId = id;
  }
}
function toggleOwn() {
  const r = rooms.at(me.pos);
  if (!r) { toast('Entre numa sala para tomar posse dela'); return; }
  if (isMine(r)) {
    keys.clear(); mouse.clear();
    if (confirm(`Liberar ${r.name}? Qualquer pessoa vai poder editar lá dentro de novo.`)) send({ t: 'room_release', id: r.id });
  } else if (r.owner) toast(`${r.name} é de ${r.ownerName}`);
  else {
    keys.clear(); mouse.clear();
    if (confirm(`Tomar posse de ${r.name}? Só você vai poder colocar/quebrar blocos e objetos lá dentro (paredes, chão e teto inclusive).`)) send({ t: 'room_claim', id: r.id });
  }
}
$('#ownBtn').onclick = () => toggleOwn();

// ---- chat da sala (fica salvo no servidor; links clicáveis)
let rchatRoom = null, rchatMsgs = [];
function linkify(text) {
  const frag = document.createDocumentFragment();
  const re = /\bhttps?:\/\/[^\s<>"']+/gi;
  let last = 0, m;
  while ((m = re.exec(text))) {
    let url = m[0].replace(/[.,;:!?)\]]+$/, '');
    if (m.index > last) frag.append(text.slice(last, m.index));
    const a = document.createElement('a');
    a.href = url; a.textContent = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    frag.append(a);
    last = m.index + url.length; re.lastIndex = last;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}
function openRchat() {
  const r = rooms.at(me.pos);
  if (!r) { toast('Entre numa sala para abrir o chat dela'); return; }
  rchatRoom = r.id; rchatMsgs = []; rchatUnread = 0; updateRoomHud();
  if (document.pointerLockElement) document.exitPointerLock();
  keys.clear(); mouse.clear();
  renderRchatHead(); renderRchat(true);
  $('#rchat').classList.remove('hidden');
  send({ t: 'rchat_get', id: r.id });
  setTimeout(() => $('#rchatInput').focus(), 0);
  updateOverlays();
}
function closeRchat() { rchatRoom = null; $('#rchat').classList.add('hidden'); $('#rchatInput').blur(); updateOverlays(); }
function renderRchatHead() {
  const r = rooms.get(rchatRoom);
  if (!r) { closeRchat(); return; }
  $('#rchatName').textContent = '💬 ' + r.name;
  $('#rchatOwner').textContent = r.owner ? `👑 ${isMine(r) ? 'Sua sala' : 'Dono: ' + r.ownerName}` : 'Sala sem dono (K dentro dela toma posse)';
  $('#rchatRename').classList.toggle('hidden', !isMine(r));
}
function renderRchat(loading) {
  const list = $('#rchatList');
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.textContent = '';
  if (!rchatMsgs.length) { const e = document.createElement('div'); e.className = 'rchatEmpty'; e.textContent = loading ? 'Carregando…' : 'Nenhuma mensagem ainda. Mande um link, um aviso, a pauta…'; list.append(e); return; }
  for (const msg of rchatMsgs) {
    const el = document.createElement('div'); el.className = 'rmsg';
    const who = document.createElement('span'); who.className = 'who'; who.style.color = msg.color || '#fff'; who.textContent = msg.name;
    const at = document.createElement('span'); at.className = 'at';
    const d = new Date(msg.at);
    at.textContent = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    el.append(who, at, document.createElement('br'), linkify(msg.text));
    list.append(el);
  }
  if (atBottom || loading || rchatMsgs.length) list.scrollTop = list.scrollHeight;
}
$('#rchatBtn').onclick = () => openRchat();
$('#rchatClose').onclick = () => closeRchat();
$('#rchatForm').onsubmit = e => {
  e.preventDefault();
  const t = $('#rchatInput').value.trim();
  if (!t || !rchatRoom) return;
  send({ t: 'rchat', id: rchatRoom, text: t });
  $('#rchatInput').value = '';
};
$('#rchatInput').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closeRchat(); });
$('#rchatRename').onclick = () => {
  const r = rooms.get(rchatRoom);
  if (!r) return;
  const name = prompt('Novo nome da sala:', r.name);
  if (name && name.trim()) send({ t: 'room_rename', id: r.id, name: name.trim() });
};

// ------------------------------------------------------------ som bloqueado por paredes
let lastOcc = 0;
const occlusion = new Map(); // id -> { occ: 0..1, muffle: 0..1 }
function updateOcclusion(positions) {
  occlusion.clear();
  // salas: quem está numa sala só ouve (e é ouvido por) quem está na mesma sala — vale nos dois modos de voz
  myRoom = rooms.at(me.pos);
  if (!positions.size) return;
  const cp = camera.position;
  const sameRoom = id => { const a = avatars.get(id); const r = a ? rooms.at(a.pos) : null; return (r ? r.id : null) === (myRoom ? myRoom.id : null); };
  if (voiceMode !== 'prox') {
    for (const id of positions.keys()) occlusion.set(id, sameRoom(id) ? { occ: 1, muffle: 0 } : { occ: 0, muffle: 1 });
    return;
  }
  const field = soundField(world, Math.floor(cp.x), Math.floor(cp.y), Math.floor(cp.z));
  for (const [id, p] of positions) {
    if (!sameRoom(id)) { occlusion.set(id, { occ: 0, muffle: 1 }); continue; }
    const e = cp.distanceTo(p);
    const d = field(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    if (d < 0) { occlusion.set(id, e < 1.2 ? { occ: 1, muffle: 0 } : { occ: 0, muffle: 1 }); continue; }
    const extra = d - e * 1.35 - 1.5; // quanto o som precisou "dar a volta"
    occlusion.set(id, extra <= 0 ? { occ: 1, muffle: 0 } : { occ: Math.max(0.25, 1 - extra / 14), muffle: Math.min(1, extra / 6) });
  }
}

addEventListener('beforeunload', () => store.set('pos:' + location.host, { p: [me.pos.x, me.pos.y, me.pos.z], yaw: me.yaw, pitch: me.pitch, fly: me.fly }));

function addPlayer(p) {
  if (players.has(p.id)) return;
  players.set(p.id, p);
  const a = new Avatar(scene, p);
  a.setTarget(p.p, p.r, true); a.setMedia(!!p.mic, !!p.screen); a.sit = !!p.s;
  if (p.skin) a.setSkin(p.skin);
  avatars.set(p.id, a);
  refreshScreen(p.id);
  renderPlayers();
}
// tela de um jogador: no painel de blocos Tela (se tiver âncora válida) ou flutuando sobre o avatar
function refreshScreen(id) {
  const p = players.get(id), a = avatars.get(id);
  if (!p) return;
  const peer = rtc && rtc.peers.get(id);
  screens.set(id, p.screen ? p.anchor : null, peer && peer.videoEl);
  if (a) a.float = !screens.has(id);
}
function refreshMine() { screens.set('me', sharing ? myAnchor : null, localScreenVideo); }
function refreshAllScreens() {
  screens.recomputeAll();
  for (const [id, a] of avatars) a.float = !screens.has(id);
}
function applySet(x, y, z, b) {
  const old = world.get(x, y, z);
  world.set(x, y, z, b);
  if (b === 0 && old && camera.position.distanceToSquared(new THREE.Vector3(x, y, z)) < 60 * 60) particles.burst(x, y, z, old);
  if (worldMap) worldMap.updateAt(x, z);
  if (old === TELA || b === TELA) refreshAllScreens();
}
function removePlayer(id) {
  screens.remove(id);
  const a = avatars.get(id); if (a) a.dispose();
  avatars.delete(id); players.delete(id);
  if (rtc) rtc.remove(id);
  if (viewerId === id) closeViewer();
  renderPlayers();
}

// ------------------------------------------------------------ interface
function toast(text) { const t = $('#toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2600); }
function addLine(el) {
  const log = $('#chatLog');
  log.appendChild(el);
  while (log.children.length > 40) log.firstChild.remove();
  setTimeout(() => el.classList.add('old'), 12000);
}
function chatMsg(name, color, text) {
  const el = document.createElement('div'); el.className = 'msg';
  const who = document.createElement('span'); who.className = 'who'; who.style.color = color; who.textContent = name;
  el.append(who, linkify(text));
  addLine(el);
}
function sysMsg(text) { const el = document.createElement('div'); el.className = 'msg sys'; el.textContent = text; addLine(el); }

function renderPlayers() {
  const list = $('#playerList');
  list.textContent = '';
  const row = (name, status, mic, screen, speaking) => {
    const r = document.createElement('div'); r.className = 'prow';
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = STATUS_COLORS[status] || STATUS_COLORS.disp;
    dot.title = STATUS_LABELS[status] || '';
    const nm = document.createElement('span'); nm.className = 'nm' + (speaking ? ' speak' : ''); nm.textContent = (mic ? '🎤 ' : '🔇 ') + name;
    const st = document.createElement('span'); st.className = 'st'; st.textContent = status && status !== 'disp' ? STATUS_LABELS[status] : '';
    r.append(dot, nm, st);
    if (screen) { const s = document.createElement('span'); s.textContent = '🖥️'; s.title = 'Compartilhando a tela'; r.append(s); }
    list.appendChild(r);
  };
  updateShareCount();
  $('#peopleCount').textContent = players.size || '';
  row(me.name + ' (você)', myStatus, rtc && rtc.micOn, sharing, mySpeaking);
  for (const p of players.values()) row(p.name, p.status, p.mic, p.screen, avatars.get(p.id)?.speaking);
}

function emojiIcon(emoji, size, sub) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const x = cv.getContext('2d');
  x.font = `${Math.round(size * 0.62)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(emoji, size / 2, size * 0.47);
  if (sub) { x.font = `bold ${Math.round(size * 0.24)}px system-ui`; x.fillStyle = '#fff'; x.fillText(sub, size / 2, size * 0.88, size - 2); }
  return cv;
}
function itemIcon(it, size) {
  if (!it) return emojiIcon('', size);
  if (it.k === 'b') return blockIcon(it.id, size);
  if (it.k === 'laser') return emojiIcon('🔦', size);
  if (it.k === 'room') return emojiIcon('📐', size);
  if (it.k === 'marreta') return emojiIcon('🔨', size);
  const md = models.meta(it.id);
  if (md && md.builtin) return emojiIcon(md.icon, size);
  return emojiIcon('📦', size, md ? md.name.slice(0, 6) : '?');
}
function itemName(it) {
  if (!it) return 'Mão vazia';
  if (it.k === 'b') return BLOCKS[it.id].name;
  if (it.k === 'laser') return 'Laser (segure o botão esquerdo apontando para uma tela · num quadro branco ele desenha)';
  if (it.k === 'room') return 'Demarcador de sala: botão dir. em 2 cantos cria · botão esq. dentro apaga';
  if (it.k === 'marreta') return 'Marreta de obra: quebra qualquer bloco, inclusive a estrutura do prédio';
  const md = models.meta(it.id);
  if (md && md.picture) return `${md.name} (botão direito numa parede)`;
  if (md && md.wall) return `${md.name} (botão direito numa parede)`;
  if (md && md.sit) return `${md.name} — ${md.size[0]}×${md.size[2]} (botão direito nela para sentar, R gira)`;
  if (md && md.kanban) return `${md.name} (numa parede · Shift + botão direito no quadro muda o tamanho)`;
  if (md && md.tv) return `${md.name} (numa parede · botão direito nela compartilha · Shift + botão direito muda o tamanho)`;
  if (md && md.lousa) return `${md.name} (numa parede · botão direito: desenhar com o mouse · laser desenha nele · Shift + botão direito: tamanho)`;
  if (md && md.kanban === 'alertas') return `${md.name} (numa parede · atrasados e sem responsável · Shift + botão direito escolhe o grupo)`;
  return md ? `${md.name} — ${md.size[0]}×${md.size[2]} blocos (R gira · X: ${freePlace ? 'colocação livre' : 'grade'})` : 'Modelo';
}
function slotEl(it, i, sel) {
  const s = document.createElement('div'); s.className = 'slot' + (sel ? ' sel' : '');
  const n = document.createElement('span'); n.className = 'n'; n.textContent = i + 1;
  s.append(itemIcon(it, 40), n);
  return s;
}
function renderHotbar() {
  const bar = $('#hotbar'); bar.textContent = '';
  hotbar.forEach((it, i) => bar.appendChild(slotEl(it, i, i === slot)));
  const bn = $('#blockName'); bn.textContent = itemName(item()); bn.style.opacity = 1;
  clearTimeout(renderHotbar.h); renderHotbar.h = setTimeout(() => (bn.style.opacity = 0), 1800);
}
function selectSlot(i) { slot = (i + 9) % 9; stopLaser(); renderHotbar(); }

function renderButtons() {
  const mic = rtc && rtc.micOn;
  $('#btnMic').classList.toggle('on', !!mic); $('#btnMic span').textContent = mic ? 'Mic ligado' : 'Mic desligado';
  $('#btnScreen').classList.toggle('live', sharing); $('#btnScreen span').textContent = sharing ? 'Parar de compartilhar' : 'Compartilhar tela';
  $('#btnVoice span').textContent = voiceMode === 'prox' ? 'Voz: proximidade' : 'Voz: todos ouvem';
  $('#btnFly').classList.toggle('on', me.fly); $('#btnFly span').textContent = me.fly ? 'Voo: sim' : 'Voo: não';
  $('#btnNoise span').textContent = 'Ruído: ' + { off: 'sem filtro', normal: 'normal', forte: 'forte' }[noiseLevel];
}
function sendMedia() { send({ t: 'media', mic: !!(rtc && rtc.micOn), screen: sharing, anchor: sharing ? myAnchor : null }); refreshMine(); renderButtons(); renderPlayers(); }

async function toggleMic() {
  if (!rtc) return;
  try { await rtc.setMic(!rtc.micOn); toast(rtc.micOn ? 'Microfone ligado' : 'Microfone desligado'); }
  catch (e) { toast('Não foi possível acessar o microfone: ' + (e.message || e.name)); }
  sendMedia();
}
// anchor = bloco Tela onde espelhar (ou null = flutuando sobre o avatar)
async function startShare(anchor) {
  if (!rtc || screenBusy) return;
  if (sharing) { myAnchor = anchor; sendMedia(); toast(anchor ? 'Sua tela foi movida para este painel' : 'Sua tela agora flutua sobre você'); return; }
  screenBusy = true;
  try {
    const stream = await rtc.startScreen(() => { sharing = false; myAnchor = null; sendMedia(); toast('Compartilhamento encerrado'); }, screenMode);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.srcObject = stream; v.play().catch(() => {});
    localScreenVideo = v;
    sharing = true; myAnchor = anchor; sendMedia();
    const som = rtc.hasScreenAudio ? ' (com som 🔊)' : ' (sem som — para mandar o som, marque "Compartilhar áudio" ao escolher a tela)';
    toast((anchor ? 'Sua tela está no painel para todo mundo ver' : 'Compartilhando sua tela com todos') + som);
  } catch (e) { if (e.name !== 'NotAllowedError') toast('Não foi possível compartilhar: ' + (e.message || e.name)); }
  finally { screenBusy = false; }
}
function stopShare() {
  if (!sharing) return;
  rtc.stopScreen(); sharing = false; myAnchor = null;
  if (localScreenVideo) { localScreenVideo.srcObject = null; localScreenVideo = null; }
  sendMedia(); toast('Compartilhamento encerrado');
}
function toggleScreen() { sharing ? stopShare() : startShare(null); }
// botão direito num bloco Tela
function useScreenBlock(h) {
  const owner = screens.ownerAt(h.x, h.y, h.z, h.n);
  if (owner === 'me') stopShare();
  else if (owner != null) openViewer(owner);
  else startShare({ x: h.x, y: h.y, z: h.z, n: h.n.slice() });
}
// botão direito numa Tela (TV) de parede: compartilhar nela, assistir quem está nela, ou parar a sua
function useTv(id) {
  const owner = screens.ownerAtObj(id);
  if (owner === 'me') stopShare();
  else if (owner != null) openViewer(owner);
  else startShare({ o: id });
}
models.onTv = () => refreshAllScreens();
function cycleNoise() {
  noiseLevel = { normal: 'forte', forte: 'off', off: 'normal' }[noiseLevel] || 'normal';
  store.set('noise', noiseLevel);
  if (rtc) rtc.setNoiseLevel(noiseLevel);
  renderButtons(); $('#sNoise').value = noiseLevel;
  toast({ normal: 'Redução de ruído normal', forte: 'Redução de ruído forte: só passa voz mais alta', off: 'Sem filtro de ruído extra (só o do navegador)' }[noiseLevel]);
}
function toggleVoice() { voiceMode = voiceMode === 'prox' ? 'global' : 'prox'; store.set('voiceMode', voiceMode); renderButtons(); $('#sVoice').value = voiceMode; toast(voiceMode === 'prox' ? 'Você ouve quem está perto' : 'Você ouve todo mundo, em qualquer lugar'); }
function toggleFly() { me.fly = !me.fly; me.vel.y = 0; renderButtons(); toast(me.fly ? 'Voo ligado' : 'Voo desligado'); }

// ------------------------------------------------------------ menu do Esc e configurações
const settings = Object.assign({ sens: 100, fov: 75, view: 150, vol: 100, invert: false, info: true, pvp: true, quality: 'media' }, store.get('settings', {}));
const PIXEL_RATIO = { baixa: 0.7, media: 1, alta: Math.min(devicePixelRatio, 2) };
function applySettings() {
  camera.fov = settings.fov; camera.updateProjectionMatrix();
  scene.fog.far = settings.view; scene.fog.near = settings.view * 0.37;
  camera.far = settings.view + 15; camera.updateProjectionMatrix(); // nada além da neblina é desenhado
  const pr = PIXEL_RATIO[settings.quality] || 1;
  if (renderer.getPixelRatio() !== pr) { renderer.setPixelRatio(pr); resize(); }
  $('#sQuality').value = settings.quality;
  if (rtc) rtc.master.gain.value = settings.vol / 100;
  $('#info').classList.toggle('hidden', !settings.info);
  $('#vSens').textContent = settings.sens + '%';
  $('#vFov').textContent = settings.fov + '°';
  $('#vView').textContent = settings.view + ' blocos';
  $('#vVol').textContent = settings.vol + '%';
  store.set('settings', settings);
}
function syncSettingsForm() {
  $('#sSens').value = settings.sens; $('#sFov').value = settings.fov; $('#sView').value = settings.view; $('#sVol').value = settings.vol;
  $('#sInvert').checked = settings.invert; $('#sInfo').checked = settings.info; $('#sPvp').checked = settings.pvp;
  $('#sVoice').value = voiceMode; $('#sNoise').value = noiseLevel; $('#sScreenMode').value = screenMode;
  $('#sMic').textContent = rtc && rtc.micOn ? 'Desligar' : 'Ligar';
}
for (const [id, key] of [['#sSens', 'sens'], ['#sFov', 'fov'], ['#sView', 'view'], ['#sVol', 'vol']]) $(id).oninput = e => { settings[key] = Number(e.target.value); applySettings(); };
$('#sInvert').onchange = e => { settings.invert = e.target.checked; applySettings(); };
$('#sQuality').onchange = e => { settings.quality = e.target.value; applySettings(); };
$('#sInfo').onchange = e => { settings.info = e.target.checked; applySettings(); };
$('#sPvp').onchange = e => { settings.pvp = e.target.checked; applySettings(); send({ t: 'pvp', on: settings.pvp }); hp = MAX_HP; renderHearts(); toast(settings.pvp ? 'Combate ligado: dá para socar e levar soco' : 'Combate desligado: ninguém te acerta e você não acerta ninguém'); };
$('#sVoice').onchange = e => { if (e.target.value !== voiceMode) toggleVoice(); };
$('#sNoise').onchange = e => { noiseLevel = e.target.value; store.set('noise', noiseLevel); if (rtc) rtc.setNoiseLevel(noiseLevel); renderButtons(); };
$('#sMic').onclick = async () => { await toggleMic(); syncSettingsForm(); };
$('#sScreenMode').onchange = e => {
  screenMode = e.target.value === 'motion' ? 'motion' : 'text'; store.set('screenMode', screenMode);
  if (rtc) rtc.setScreenMode(screenMode);
  toast(screenMode === 'motion' ? 'Tela em modo vídeo: mais fluida (texto pode ficar menos nítido)' : 'Tela em modo texto: mais nítida para planilhas, código e documentos');
};
// avisa a quem compartilha se estou vendo a tela dela: quem está longe não recebe o vídeo,
// e a banda de quem compartilha fica para quem está assistindo
const WATCH_DIST = 45;
let lastWatch = 0;
function updateWatching(now) {
  if (!rtc || now - lastWatch < 500) return;
  lastWatch = now;
  const master = Math.min(1, settings.vol / 100);
  for (const [id, p] of players) {
    if (!p.screen) { rtc.setScreenAudio(id, 0); continue; }
    let on = viewerId === id, vol = on ? 1 : 0;
    if (!on) {
      const it = screens.items.get(id), a = avatars.get(id);
      const pos = it && it.rect && it.mesh.visible ? it.mesh.position : a ? a.pos : null;
      const d = pos ? camera.position.distanceTo(pos) : Infinity;
      on = d <= WATCH_DIST;
      // som da tela: alto perto da tela, some aos poucos até 30 blocos; em outra sala, mudo
      const sr = it && it.rect && it.mesh.visible ? rooms.at(it.mesh.position) : a ? rooms.at(a.pos) : null;
      const same = (sr ? sr.id : null) === (myRoom ? myRoom.id : null);
      vol = same ? Math.max(0, Math.min(1, (30 - d) / 22)) : 0;
    }
    rtc.setWatching(id, on);
    rtc.setScreenAudio(id, vol * master);
  }
}
applySettings();

// skin
let mySkin = store.get('skin', null);
function drawSkinPreview() {
  const cv = $('#skinPreview'), x = cv.getContext('2d');
  x.imageSmoothingEnabled = false; x.clearRect(0, 0, 40, 40);
  if (!mySkin) { x.font = '28px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🤖', 20, 22); return; }
  const img = new Image();
  img.onload = () => { x.drawImage(img, 8, 8, 8, 8, 0, 0, 40, 40); x.drawImage(img, 40, 8, 8, 8, 0, 0, 40, 40); };
  img.src = mySkin;
}
// ---- janela de skins: galeria de skins originais, criador, busca por nome, arquivo
let skinOpen = false, skParams = store.get('skinParams', null) || randomParams();
const skStatus = t => { $('#skStatus').textContent = t; $('#skinStatus').textContent = t; };
function applySkinUrl(url, msg) {
  mySkin = url; store.set('skin', url); send({ t: 'skin', url });
  if (myAvatar) myAvatar.setSkin(url);
  rebuildHand();
  drawSkinPreview(); skStatus(msg || 'Skin aplicada! Os outros já estão vendo.');
}
async function uploadSkin(blob) {
  skStatus('Enviando…');
  const r = await fetch('/api/skins', { method: 'POST', body: blob, headers: { 'Content-Type': 'image/png' } });
  if (!r.ok) throw new Error(await r.text());
  applySkinUrl((await r.json()).url);
}
const canvasBlob = cv => new Promise(res => cv.toBlob(res, 'image/png'));
function openSkinDlg() {
  skinOpen = true; $('#skinDlg').classList.remove('hidden'); skStatus('');
  if (!$('#skGallery').children.length) fillGallery();
  updateOverlays();
}
function closeSkinDlg() { skinOpen = false; $('#skinDlg').classList.add('hidden'); updateOverlays(); }
function skTab(name) {
  document.querySelectorAll('#skTabs button').forEach(b => b.classList.toggle('sel', b.dataset.sk === name));
  document.querySelectorAll('#skinDlg .skpage').forEach(p => p.classList.toggle('hidden', p.id !== 'sk-' + name));
  if (name === 'criar') renderSkinEditor();
}
document.querySelectorAll('#skTabs button').forEach(b => (b.onclick = () => skTab(b.dataset.sk)));
$('#sSkinPick').onclick = openSkinDlg;
$('#skClose').onclick = closeSkinDlg;
function fillGallery() {
  const g = $('#skGallery'); g.textContent = '';
  for (let i = 0; i < 18; i++) {
    const p = randomParams();
    const b = document.createElement('button');
    b.append(frontPreview(makeSkin(p), 3));
    b.title = 'Clique para usar · botão direito para editar';
    b.onclick = async () => { try { skParams = p; store.set('skinParams', p); await uploadSkin(await canvasBlob(makeSkin(p))); } catch (e) { skStatus('Erro: ' + e.message); } };
    b.oncontextmenu = e => { e.preventDefault(); skParams = p; skTab('criar'); };
    g.appendChild(b);
  }
}
$('#skMore').onclick = fillGallery;
// criador
function renderSkinEditor() {
  const box = $('#skFields'); box.textContent = '';
  const field = (label, el) => { const d = document.createElement('div'); d.className = 'skField'; const l = document.createElement('label'); l.textContent = label; d.append(l, el); box.appendChild(d); };
  const swatches = (key, colors) => {
    const s = document.createElement('div'); s.className = 'swatches';
    for (const c of colors) { const b = document.createElement('button'); b.style.background = c; b.className = skParams[key] === c ? 'sel' : ''; b.onclick = () => { skParams[key] = c; renderSkinEditor(); }; s.appendChild(b); }
    const inp = document.createElement('input'); inp.type = 'color'; inp.value = skParams[key]; inp.title = 'Outra cor'; inp.style.cssText = 'width:26px;height:24px;padding:0;border:none;background:none';
    inp.oninput = () => { skParams[key] = inp.value; drawSkEditorPreview(); };
    s.appendChild(inp);
    return s;
  };
  const select = (key, opts) => {
    const s = document.createElement('select');
    for (const [v, t] of Object.entries(opts)) { const o = document.createElement('option'); o.value = v; o.textContent = t; s.appendChild(o); }
    s.value = skParams[key]; s.onchange = () => { skParams[key] = s.value; drawSkEditorPreview(); };
    return s;
  };
  field('Pele', swatches('tone', TONES));
  field('Cabelo', select('hairStyle', HAIR_STYLES));
  field('Cor do cabelo', swatches('hair', HAIR_COLORS));
  field('Olhos', swatches('eyes', EYE_COLORS));
  field('Roupa', select('top', TOPS));
  field('Cor da roupa', swatches('shirt', CLOTH_COLORS));
  field('Detalhe (gravata, capuz, boné)', swatches('accent', CLOTH_COLORS));
  field('Calça', swatches('pants', CLOTH_COLORS));
  field('Sapato', swatches('shoes', CLOTH_COLORS));
  field('Acessório', select('extra', EXTRAS));
  drawSkEditorPreview();
}
function drawSkEditorPreview() {
  const cv = $('#skPreview'), x = cv.getContext('2d');
  x.clearRect(0, 0, cv.width, cv.height); x.imageSmoothingEnabled = false;
  x.drawImage(frontPreview(makeSkin(skParams), 6), 0, 0);
}
$('#skRandom').onclick = () => { skParams = randomParams(); renderSkinEditor(); };
$('#skUse').onclick = async () => { try { store.set('skinParams', skParams); await uploadSkin(await canvasBlob(makeSkin(skParams))); } catch (e) { skStatus('Erro: ' + e.message); } };
$('#skDownload').onclick = () => { const a = document.createElement('a'); a.href = makeSkin(skParams).toDataURL('image/png'); a.download = 'minha-skin.png'; a.click(); };
// busca por nome de conta: tenta direto no navegador e depois pelo servidor
$('#skName').addEventListener('input', () => { const n = $('#skName').value.trim(); if (/^[A-Za-z0-9_]{2,16}$/.test(n)) $('#skHead').src = `https://mc-heads.net/avatar/${n}/48`; });
$('#skName').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('#skFind').click(); });
$('#skFind').onclick = async () => {
  const n = $('#skName').value.trim();
  if (!/^[A-Za-z0-9_]{2,16}$/.test(n)) { skStatus('Nome inválido (2 a 16 letras, números ou _).'); return; }
  skStatus('Buscando…');
  try {
    const r = await fetch(`https://mc-heads.net/skin/${n}`, { mode: 'cors' });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('image')) throw new Error('direto falhou');
    await uploadSkin(await r.blob());
    return;
  } catch {}
  try {
    const r = await fetch('/api/mcskin?name=' + encodeURIComponent(n));
    if (!r.ok) throw new Error(await r.text());
    applySkinUrl((await r.json()).url);
  } catch (e) { skStatus('Não deu para buscar: ' + (e.message || e) + '. Use a Galeria ou o Criar.'); }
};
$('#skFile').onclick = () => $('#sSkinFile').click();
$('#sSkinFile').onchange = async () => {
  const f = $('#sSkinFile').files[0]; if (!f) return;
  try { await uploadSkin(f); } catch (e) { skStatus('Erro: ' + (e.message || e)); }
  $('#sSkinFile').value = '';
};
$('#skRobot').onclick = () => applySkinUrl(null, 'Voltou para o robô.');
drawSkinPreview();

let menuPage = 'main', menuWasOpen = false;
function showPage(p) {
  menuPage = p;
  document.querySelectorAll('#menu .page').forEach(el => el.classList.toggle('hidden', el.id !== 'page-' + p));
  if (p === 'settings') syncSettingsForm();
  if (p === 'shares') renderShares();
  if (p === 'people') renderPeople(true);
}
document.querySelectorAll('#menu [data-go]').forEach(b => (b.onclick = () => showPage(b.dataset.go)));
$('#mContinue').onclick = () => {
  lock(true);
  // uma vez só: pede permissão de aviso do navegador (para saber quando alguém te chamar com o jogo em outra aba)
  if ('Notification' in window && Notification.permission === 'default' && !store.get('notifAsked', false)) { store.set('notifAsked', true); Notification.requestPermission().catch(() => {}); }
};
$('#mInventory').onclick = () => openPicker();
$('#mQuit').onclick = () => { if (confirm('Sair do mundo?')) { if (ws) ws.onclose = null; try { sessionStorage.setItem('vx_noauto', '1'); } catch {} location.reload(); } };
$('#mLogout').onclick = () => {
  if (!confirm(`Sair da conta de ${me.name} (${me.email})?\nNeste navegador o nome, o e-mail, a cor e a skin salvos serão esquecidos.`)) return;
  for (const k of ['name', 'email', 'color', 'skin']) { try { localStorage.removeItem('vx_' + k); } catch {} }
  if (ws) ws.onclose = null;
  try { sessionStorage.setItem('vx_noauto', '1'); } catch {}
  location.reload();
};
function renderShares() {
  const list = $('#shareList'); list.textContent = '';
  const shares = [...players.values()].filter(p => p.screen);
  if (!shares.length) { const p = document.createElement('p'); p.className = 'sub'; p.textContent = 'Ninguém está compartilhando a tela agora.'; list.appendChild(p); }
  for (const p of shares) {
    const r = document.createElement('div'); r.className = 'shareRow';
    const n = document.createElement('span'); n.textContent = '🖥️ ' + p.name;
    const b = document.createElement('button'); b.className = 'primary'; b.textContent = 'Assistir em tela cheia';
    b.onclick = () => openViewer(p.id);
    r.append(n, b); list.appendChild(r);
  }
}
function updateShareCount() { const n = [...players.values()].filter(p => p.screen).length; $('#shareCount').textContent = n || ''; if (menuPage === 'shares') renderShares(); }

// ------------------------------------------------------------ inventário
let invTab = 'blocks';
const sameItem = (a, b) => !!a && !!b && a.k === b.k && a.id === b.id;
function openPicker() {
  pickerOpen = true;
  if (document.pointerLockElement) document.exitPointerLock();
  stopLaser();
  renderInventory();
  $('#picker').classList.remove('hidden');
  updateOverlays();
}
// arrastar e soltar: item da lista -> espaço da barra; espaço -> espaço (troca); espaço -> lista (esvazia)
let dragData = null;
function putItem(i, it) {
  const j = hotbar.findIndex(h => sameItem(h, it));
  if (j >= 0 && j !== i) hotbar[j] = hotbar[i]; // já estava em outro espaço: troca
  hotbar[i] = it;
  saveHotbar(); renderHotbar(); renderInventory();
}
function draggable(el, data) {
  el.draggable = true;
  el.addEventListener('dragstart', e => { dragData = data; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'item'); el.classList.add('dragging'); });
  el.addEventListener('dragend', () => { dragData = null; el.classList.remove('dragging'); document.querySelectorAll('.over').forEach(x => x.classList.remove('over')); });
}
function dropTarget(el, onDrop) {
  el.addEventListener('dragover', e => { if (dragData) { e.preventDefault(); el.classList.add('over'); } });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('over'); if (dragData) onDrop(dragData); dragData = null; });
}
function renderInventory() {
  const bar = $('#invBar'); bar.textContent = '';
  hotbar.forEach((it, i) => {
    const s = slotEl(it, i, i === slot);
    s.title = itemName(it);
    s.onclick = () => { slot = i; renderInventory(); renderHotbar(); };
    s.oncontextmenu = e => { e.preventDefault(); hotbar[i] = null; saveHotbar(); renderInventory(); renderHotbar(); };
    if (it) draggable(s, { from: 'slot', i });
    dropTarget(s, d => {
      if (d.from === 'slot') { if (d.i !== i) { [hotbar[i], hotbar[d.i]] = [hotbar[d.i], hotbar[i]]; saveHotbar(); renderHotbar(); renderInventory(); } }
      else putItem(i, d.it);
    });
    bar.appendChild(s);
  });
  document.querySelectorAll('#picker .tabs button').forEach(b => b.classList.toggle('sel', b.dataset.tab === invTab));
  $('#importBox').classList.toggle('hidden', invTab !== 'models');
  const grid = $('#pickerGrid'); grid.textContent = '';
  const add = (it, label, extra) => {
    const b = document.createElement('button'); b.className = 'pick' + (sameItem(hotbar[slot], it) ? ' sel' : '');
    const l = document.createElement('span'); l.textContent = label;
    b.append(itemIcon(it, 44), l);
    if (extra) b.append(extra);
    b.onclick = () => putItem(slot, it);
    draggable(b, { from: 'item', it });
    grid.appendChild(b);
  };
  if (!grid.dataset.drop) {
    grid.dataset.drop = '1';
    // soltar um espaço da barra na lista = tirar da barra
    dropTarget(grid, d => { if (d.from === 'slot') { hotbar[d.i] = null; saveHotbar(); renderHotbar(); renderInventory(); } });
  }
  if (invTab === 'blocks') {
    for (const id of BLOCK_IDS) { if (id !== TELA) add(B(id), BLOCKS[id].name); } // Tela agora é objeto (aba de decoração)
  }
  else if (invTab === 'tools') { add({ k: 'laser' }, 'Laser'); add({ k: 'room' }, 'Demarcador de sala'); add({ k: 'marreta' }, 'Marreta de obra'); }
  else if (invTab === 'deco' || invTab === 'natal' || invTab === 'objetos') {
    for (const id of DECOR_IDS) { const md = models.meta(id); if (md.cat === invTab) add({ k: 'm', id }, md.name); }
  }
  else {
    const list = models.list();
    if (!list.length) { const p = document.createElement('p'); p.className = 'sub'; p.textContent = 'Nenhum modelo ainda. Importe um abaixo.'; grid.appendChild(p); }
    for (const md of list) {
      const wrap = document.createElement('div');
      const sz = document.createElement('div'); sz.className = 'sz'; sz.textContent = `${md.size[0]}×${md.size[2]}×${md.size[1]}`;
      const del = document.createElement('button'); del.className = 'del'; del.textContent = '🗑'; del.title = 'Apagar da biblioteca (some do mundo também)';
      del.onclick = e => { e.stopPropagation(); if (confirm(`Apagar o modelo "${md.name}" e todas as cópias dele no mundo?`)) send({ t: 'model_del', id: md.id }); };
      wrap.append(sz, del);
      add({ k: 'm', id: md.id }, md.name, wrap);
    }
  }
}
document.querySelectorAll('#picker .tabs button').forEach(b => (b.onclick = () => { invTab = b.dataset.tab; renderInventory(); }));
function closePicker(relock) { pickerOpen = false; $('#picker').classList.add('hidden'); if (relock) lock(); updateOverlays(); }
$('#pickerClose').onclick = () => closePicker(true);

// importação de modelo
$('#mFiles').onchange = () => {
  const f = [...$('#mFiles').files].find(x => /\.(glb|gltf|fbx|obj|stl)$/i.test(x.name));
  if (f && !$('#mName').value) $('#mName').value = f.name.replace(/\.[^.]+$/, '').slice(0, 40);
};
$('#mImport').onclick = async () => {
  const files = $('#mFiles').files;
  const status = t => ($('#mStatus').textContent = t);
  const w = parseFloat($('#mW').value), d = parseFloat($('#mD').value), hv = $('#mH').value.trim(), h = hv ? parseFloat(hv) : null;
  if (!files.length) return status('Escolha o arquivo do modelo.');
  if (!(w > 0 && d > 0 && w <= 64 && d <= 64) || (h !== null && !(h > 0 && h <= 64))) return status('Tamanho inválido (0,1 a 64 blocos).');
  const name = $('#mName').value.trim() || 'Modelo';
  $('#mImport').disabled = true;
  try {
    const { glb, size } = await buildModelGLB(files, [w, h, d], status);
    status(`Enviando (${(glb.byteLength / 1024 / 1024).toFixed(1)} MB)…`);
    const md = await uploadModel(glb, name, size, me.name);
    models.addModel(md);
    // coloca no espaço selecionado
    hotbar[slot] = { k: 'm', id: md.id }; saveHotbar(); renderHotbar();
    status(`Pronto! "${md.name}" está no espaço ${slot + 1}. Botão direito coloca, R gira.`);
    $('#mFiles').value = ''; $('#mName').value = '';
    renderInventory();
  } catch (e) {
    console.error(e);
    status('Erro: ' + (e.message || e));
  } finally { $('#mImport').disabled = false; }
};

// visualizador de tela
function openViewer(id) {
  const s = rtc && rtc.videoStream(id);
  if (!s) { toast('A tela ainda está chegando…'); return; }
  viewerId = id;
  if (document.pointerLockElement) document.exitPointerLock();
  $('#viewerVideo').srcObject = s;
  $('#viewerVideo').play().catch(() => {});
  $('#viewerTitle').textContent = 'Tela de ' + (players.get(id)?.name || '?');
  $('#viewer').classList.remove('hidden');
  updateOverlays();
}
function closeViewer() { viewerId = null; $('#viewerVideo').srcObject = null; $('#viewer').classList.add('hidden'); updateOverlays(); }
$('#viewerClose').onclick = closeViewer;
$('#viewerFull').onclick = () => $('#viewerVideo').requestFullscreen?.();

// chat
// F1: esconde toda a interface (barra, mapa, chat, botões, mira e a mão) para a tela ficar limpa
let hudHidden = false;
function toggleHud() {
  hudHidden = !hudHidden;
  document.body.classList.toggle('nohud', hudHidden);
}
function openChat() { if (hudHidden) toggleHud(); chatOpen = true; keys.clear(); $('#chat').classList.add('open'); const i = $('#chatInput'); i.classList.remove('hidden'); i.value = ''; setTimeout(() => i.focus(), 0); }
function closeChat() { chatOpen = false; $('#chat').classList.remove('open'); const i = $('#chatInput'); i.blur(); i.classList.add('hidden'); updateOverlays(); }
$('#chatInput').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') { const t = e.target.value.trim(); if (t) send({ t: 'chat', text: t }); closeChat(); }
  else if (e.key === 'Escape') closeChat();
});

function updateOverlays() {
  const open = !locked && !!world && !loading && !chatOpen && !pickerOpen && viewerId == null && !frameReq && !mapOpen && !kanbanOpen && !kbSize && !rchatRoom && !agendaRoom && !wbOpenObj;
  if (open && !menuWasOpen) showPage('main');
  menuWasOpen = open;
  $('#menu').classList.toggle('hidden', !open);
}

// ------------------------------------------------------------ entrada
canvas.tabIndex = -1; canvas.style.outline = 'none';
function lock(fromMenu) {
  if (!world || loading) return;
  try { canvas.focus({ preventScroll: true }); } catch {}
  const fail = () => { if (fromMenu) toast('Clique em Continuar de novo'); };
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(fail); } catch { fail(); }
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked) { keys.clear(); mouse.clear(); stopLaser(); }
  updateOverlays();
});
document.addEventListener('mousemove', e => {
  if (!locked) return;
  if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
  const s = 0.0022 * settings.sens / 100;
  me.yaw -= e.movementX * s;
  me.pitch = Math.max(-1.55, Math.min(1.55, me.pitch - e.movementY * s * (settings.invert ? -1 : 1)));
});
const mouse = new Map(); // botão -> próximo instante de repetição
document.addEventListener('mousedown', e => {
  if (!locked || chatOpen) return;
  if (e.button === 1) { pickBlock(); e.preventDefault(); return; }
  mouse.set(e.button, performance.now() + 300);
  if (e.button === 0) primary(); else if (e.button === 2) secondary();
});
document.addEventListener('mouseup', e => { mouse.delete(e.button); if (e.button === 0) stopLaser(); });
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('wheel', e => { if (locked) selectSlot(slot + Math.sign(e.deltaY)); }, { passive: true });

let lastSpace = 0;
// Tab é do mapa: nunca deixa o navegador trocar o foco (isso rolava a página para fora da tela)
document.addEventListener('keydown', e => { if (e.key === 'Tab' && !(pickerOpen || frameReq)) e.preventDefault(); }, true);
addEventListener('scroll', () => { if (scrollX || scrollY) scrollTo(0, 0); });
document.body.addEventListener('scroll', () => { document.body.scrollTop = document.body.scrollLeft = 0; });
document.addEventListener('keydown', e => {
  if (chatOpen || e.target.tagName === 'INPUT') return;
  if (!world) return;
  if (e.code === 'F1') { e.preventDefault(); if (!e.repeat) toggleHud(); return; }
  if (e.code === 'Tab') { if (!e.repeat) { if (mapOpen) closeMap(true); else if (locked) openMap(); } return; }
  if (kanbanOpen) { if (e.code === 'Escape') closeKanban(); return; }
  if (rchatRoom) { if (e.code === 'Escape') closeRchat(); return; }
  if (agendaRoom) { if (e.code === 'Escape') closeAgenda(); return; }
  if (wbOpenObj) {
    if (e.code === 'Escape') closeLousa();
    else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#wbUndo').click(); }
    return;
  }
  if (kbSize) {
    if (e.code === 'Escape') closeKanbanSize(false);
    else if (e.code === 'Enter' && !$('#kbSizeOk').disabled) $('#kbSizeOk').click();
    return;
  }
  if (e.code === 'Escape') {
    if (skinOpen) closeSkinDlg();
    else if (mapOpen) closeMap(false);
    else if (pickerOpen) closePicker(false);
    else if (viewerId != null) closeViewer();
    else if (!locked && menuPage !== 'main') showPage('main');
    return;
  }
  if (e.code === 'KeyE') { e.preventDefault(); pickerOpen ? closePicker(true) : openPicker(); return; }
  if (!locked) return;
  if (e.code === 'Enter' || e.code === 'KeyT') { e.preventDefault(); openChat(); return; }
  if (e.repeat) { keys.add(e.code); return; }
  if (e.code === 'KeyF') toggleFly();
  else if (e.code === 'KeyM') toggleMic();
  else if (e.code === 'KeyG') toggleScreen();
  else if (e.code === 'KeyV') toggleVoice();
  else if (e.code === 'KeyR') { modelRot = (modelRot + 1) % 4; }
  else if (e.code === 'KeyN') cycleNoise();
  else if (e.code === 'KeyL') toggleLock();
  else if (e.code === 'KeyK') toggleOwn();
  else if (e.code === 'KeyX') toggleFreePlace();
  else if (e.code === 'KeyB') { e.preventDefault(); openAgenda(); return; }
  else if (e.code === 'KeyY' && pendingCall) { const c = pendingCall; closeCall(); goTo(c.from); }
  else if (e.code === 'KeyJ') { e.preventDefault(); openRchat(); return; }
  else if (e.code === 'KeyC' || e.code === 'F5') { e.preventDefault(); cycleCam(); }
  else if (e.code === 'KeyP') setManualStatus(ORDER[(ORDER.indexOf(statusManual) + 1) % ORDER.length]);
  else if (/^Digit[1-9]$/.test(e.code)) selectSlot(Number(e.code.slice(5)) - 1);
  else if (e.code === 'Space') {
    const now = performance.now();
    if (now - lastSpace < 280) { toggleFly(); lastSpace = 0; } else lastSpace = now;
  }
  if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  keys.add(e.code);
});
document.addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouse.clear(); });

// ------------------------------------------------------------ física
function solidAt(x, y, z) {
  if (x < 0 || z < 0 || x >= world.W || z >= world.D || y < 0) return true;
  if (y >= world.H) return false;
  return isSolid(world.get(x, y, z));
}
// salas trancadas viram parede para quem está fora (calculado no começo de cada passo de física)
let lockedWalls = [];
const _aMin = new THREE.Vector3(), _aMax = new THREE.Vector3();
function refreshLockedWalls() {
  _aMin.set(me.pos.x - HALF, me.pos.y, me.pos.z - HALF); _aMax.set(me.pos.x + HALF, me.pos.y + HEIGHT, me.pos.z + HALF);
  lockedWalls = rooms.blockingFor(_aMin, _aMax);
}
function collidesAt(p) {
  const x0 = Math.floor(p.x - HALF), x1 = Math.floor(p.x + HALF);
  const y0 = Math.floor(p.y), y1 = Math.floor(p.y + HEIGHT);
  const z0 = Math.floor(p.z - HALF), z1 = Math.floor(p.z + HALF);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    if (solidAt(x, y, z)) return true;
    for (const r of lockedWalls) if (rooms.containsCell(r, x, y, z)) return true;
  }
  return false;
}
$('#lockBtn').onclick = () => toggleLock();
function toggleLock() {
  const r = rooms.at(me.pos);
  if (!r) { toast('Você precisa estar dentro de uma sala para trancar'); return; }
  send({ t: 'room_lock', id: r.id, locked: !r.locked });
}
function moveAxis(axis, amount) {
  if (!amount) return;
  const steps = Math.max(1, Math.ceil(Math.abs(amount) / 0.45));
  const s = amount / steps;
  for (let i = 0; i < steps; i++) {
    const prev = me.pos[axis];
    me.pos[axis] += s;
    if (!collidesAt(me.pos)) continue;
    if (axis === 'y') {
      if (s < 0) { me.pos.y = Math.floor(me.pos.y) + 1; me.onGround = true; }
      else me.pos.y = Math.floor(me.pos.y + HEIGHT) - HEIGHT - 0.001;
      me.vel.y = 0;
    } else {
      me.pos[axis] = s > 0 ? Math.floor(me.pos[axis] + HALF) - HALF - 0.001 : Math.floor(me.pos[axis] - HALF) + 1 + HALF + 0.001;
      me.vel[axis] = 0;
    }
    if (collidesAt(me.pos)) me.pos[axis] = prev;
    return;
  }
}
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3();
function physics(dt) {
  const input = locked && !chatOpen;
  const k = c => input && keys.has(c);
  fwd.set(-Math.sin(me.yaw), 0, -Math.cos(me.yaw));
  right.set(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
  wish.set(0, 0, 0);
  if (k('KeyW') || k('ArrowUp')) wish.add(fwd);
  if (k('KeyS') || k('ArrowDown')) wish.sub(fwd);
  if (k('KeyD') || k('ArrowRight')) wish.add(right);
  if (k('KeyA') || k('ArrowLeft')) wish.sub(right);
  if (wish.lengthSq()) wish.normalize();
  if (me.fly) {
    const sp = 11;
    me.vel.x += (wish.x * sp - me.vel.x) * Math.min(1, dt * 10);
    me.vel.z += (wish.z * sp - me.vel.z) * Math.min(1, dt * 10);
    const vy = ((k('Space') ? 1 : 0) - (k('ShiftLeft') || k('ShiftRight') ? 1 : 0)) * 9;
    me.vel.y += (vy - me.vel.y) * Math.min(1, dt * 10);
  } else {
    const sp = k('ShiftLeft') || k('ShiftRight') ? 6.6 : 4.4;
    const acc = me.onGround ? 14 : 5;
    me.vel.x += (wish.x * sp - me.vel.x) * Math.min(1, dt * acc);
    me.vel.z += (wish.z * sp - me.vel.z) * Math.min(1, dt * acc);
    me.vel.y = Math.max(-45, me.vel.y - 28 * dt);
    if (me.onGround && k('Space')) me.vel.y = 8.6;
  }
  me.onGround = false;
  refreshLockedWalls();
  moveAxis('x', me.vel.x * dt);
  moveAxis('z', me.vel.z * dt);
  moveAxis('y', me.vel.y * dt);
}

// ------------------------------------------------------------ blocos
const dirV = new THREE.Vector3();
const eyeV = new THREE.Vector3(); // a mira sai dos olhos do personagem (vale também em terceira pessoa)
const REACH = 7;
function updateEye() {
  eyeV.set(me.pos.x, me.pos.y + EYE, me.pos.z);
  const cp = Math.cos(me.pitch);
  dirV.set(-Math.sin(me.yaw) * cp, Math.sin(me.pitch), -Math.cos(me.yaw) * cp);
}
function target(dist = REACH) { updateEye(); return world.raycast(eyeV, dirV, dist); }
// o que está na mira: bloco ou objeto 3D (o mais perto)
function aim(dist = REACH) {
  const h = target(dist);
  const o = models.raycast(eyeV, dirV, dist);
  if (o && (!h || o.distance < h.t)) return { obj: o };
  return h ? { block: h } : null;
}
function setBlock(x, y, z, b, tool) {
  applySet(x, y, z, b);
  if (tool && protectMask) protectMask[x + welcome.size[0] * (z + welcome.size[2] * y)] = 0;
  send({ t: 'set', x, y, z, b, tool });
}
let lastProtectToast = 0;
const shift = () => keys.has('ShiftLeft') || keys.has('ShiftRight');

// ---- combate (PvP): soco com recuo, corações, nocaute e volta ao início
const MAX_HP = 20, PUNCH = 2, HIT_REACH = 3.6;
let hp = MAX_HP, lastPunch = 0, lastHurt = 0;
function avatarInSight(maxD) {
  updateEye();
  let best = null;
  for (const a of avatars.values()) {
    const [x0, y0, z0, x1, y1, z1] = a.hitBox();
    let tmin = 0, tmax = maxD, ok = true;
    for (const [o, d, lo, hi] of [[eyeV.x, dirV.x, x0, x1], [eyeV.y, dirV.y, y0, y1], [eyeV.z, dirV.z, z0, z1]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } continue; }
      let t1 = (lo - o) / d, t2 = (hi - o) / d; if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) { ok = false; break; }
    }
    if (ok && (!best || tmin < best.t)) best = { a, t: tmin };
  }
  return best;
}
function tryPunch() {
  if (!settings.pvp) return false;
  const hit = avatarInSight(HIT_REACH);
  if (!hit) return false;
  const blk = target(HIT_REACH);
  if (blk && blk.t < hit.t) return false; // tem parede no meio
  const now = performance.now();
  if (now - lastPunch < 400) return true;
  lastPunch = now;
  const dx = hit.a.pos.x - me.pos.x, dz = hit.a.pos.z - me.pos.z, l = Math.hypot(dx, dz) || 1;
  send({ t: 'hit', id: hit.a.id, dir: [dx / l, dz / l] });
  return true;
}
function hitSound(vol = 0.5) {
  if (!audioCtx) return;
  const n = audioCtx.sampleRate * 0.12, buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  const s = audioCtx.createBufferSource(); s.buffer = buf;
  const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  const g = audioCtx.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(audioCtx.destination); s.start();
}
function renderHearts() {
  const el = $('#hearts');
  el.classList.toggle('hidden', !settings.pvp);
  if (!settings.pvp) return;
  let s = '';
  for (let i = 0; i < MAX_HP / 2; i++) s += hp >= (i + 1) * 2 ? '❤️' : hp === i * 2 + 1 ? '💔' : '🖤';
  el.textContent = s;
}
function onHit(m) {
  if (!settings.pvp) return;
  if (seated) standUp();
  me.vel.x = m.dir[0] * 7; me.vel.z = m.dir[1] * 7; me.vel.y = 5.5; me.onGround = false;
  hp -= PUNCH; lastHurt = performance.now();
  hitSound(0.7);
  const fl = $('#hurt'); fl.classList.remove('show'); void fl.offsetWidth; fl.classList.add('show');
  if (hp <= 0) {
    hp = MAX_HP;
    me.pos.set(...welcome.spawn); me.vel.set(0, 0, 0);
    send({ t: 'ko', by: m.from });
    toast(`💥 Você foi nocauteado por ${m.name}!`);
  }
  renderHearts();
}
// recupera 1 coração a cada 4 s sem levar golpe
setInterval(() => { if (hp < MAX_HP && performance.now() - lastHurt > 4000) { hp = Math.min(MAX_HP, hp + 1); renderHearts(); } }, 2000);

function primary() {
  const it = item();
  if (it && it.k === 'laser') return; // o laser é tratado no loop enquanto o botão estiver pressionado
  swingHand();
  if (!(it && it.k === 'room') && tryPunch()) { mouse.delete(0); return; }
  if (it && it.k === 'room') {
    mouse.delete(0);
    if (roomCornerA) { roomCornerA = null; toast('Marcação cancelada'); return; }
    const h = target(30);
    const r = h && (rooms.atCell(h.x + h.n[0], h.y + h.n[1], h.z + h.n[2]) || rooms.atCell(h.x, h.y, h.z));
    if (!r) { toast('Mire em algo dentro de uma sala para apagá-la'); return; }
    keys.clear(); mouse.clear();
    if (confirm(`Apagar a sala "${r.name}"? (os blocos não mudam, só o limite de voz)`)) send({ t: 'room_del', id: r.id });
    return;
  }
  const a = aim();
  if (!a) return;
  if (a.obj) {
    mouse.delete(0);
    const o = models.objects.get(a.obj.id);
    if (o && ownedDenied(o.data.x, o.data.y, o.data.z)) return;
    send({ t: 'obj_del', id: a.obj.id }); return;
  }
  const { x, y, z } = a.block;
  if (y <= 0) return;
  if (ownedDenied(x, y, z)) { mouse.delete(0); return; }
  if (it && it.k === 'marreta') { setBlock(x, y, z, 0, 'marreta'); return; }
  if (isProtected(x, y, z)) {
    mouse.delete(0);
    if (performance.now() - lastProtectToast > 2500) { lastProtectToast = performance.now(); toast('🛡️ Estrutura do prédio protegida: para quebrar use a Marreta de obra (inventário → Ferramentas)'); }
    return;
  }
  setBlock(x, y, z, 0);
}
// caixa da sala a partir de 2 cantos: se os cantos estão na mesma altura (ex.: chão), sobe 6 blocos
function roomBox(a, b) {
  const min = [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)], max = [Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)];
  if (max[1] - min[1] < 2) { min[1] += 1; max[1] = min[1] + 5; }
  return { min, max };
}
function secondary() {
  const it = item();
  swingHand();
  if (it && it.k === 'room') {
    mouse.delete(2);
    const h = target(30);
    if (!h) return;
    const c = { x: h.x, y: h.y, z: h.z };
    if (!roomCornerA) { roomCornerA = c; toast('Canto 1 marcado. Botão direito no canto oposto (botão esquerdo cancela)'); return; }
    const box = roomBox(roomCornerA, c);
    roomCornerA = null;
    keys.clear(); mouse.clear();
    const name = prompt('Nome da sala:', 'Sala ' + (rooms.list.length + 1));
    if (name === null) return;
    send({ t: 'room_add', name, min: box.min, max: box.max });
    toast('Sala criada: quem está dentro só ouve quem está dentro');
    return;
  }
  const a = aim();
  if (!a) return;
  // botão direito num bloco Tela = usar a tela (Shift + botão direito = construir normalmente)
  if (a.block && a.block.b === TELA && !shift()) { mouse.delete(2); useScreenBlock(a.block); return; }
  if (a.obj) {
    mouse.delete(2);
    const o = models.objects.get(a.obj.id);
    if (o && o.meta.tv) { if (shift()) openKanbanSize(o); else useTv(a.obj.id); return; }
    if (o && o.meta.lousa) { if (shift()) openKanbanSize(o); else openLousa(o); return; }
    if (o && o.meta.kanban) {
      const src = o.kanban && o.kanban.source || 'time';
      if (shift()) openKanbanSize(o); else openKanban(src.startsWith('sn:') ? src : o.meta.kanban === 'meu');
      return;
    }
    // segurando um modelo e mirando no tampo de um objeto: coloca em cima (ex.: monitor na mesa)
    if (it && it.k === 'm' && a.obj.normal.y > 0.7 && !(o && o.meta.picture)) { placeModel(a); return; }
    if (o && o.meta.sit && !shift()) { sitOn(a.obj.id); return; }
    if (o && o.meta.picture) { openFrameDialog({ edit: o.data }); return; }
    if (it && it.k === 'm') placeModel(a);
    return;
  }
  const h = a.block;
  if (!it || (it.k !== 'b' && it.k !== 'm')) return;
  if (it.k === 'm') { mouse.delete(2); placeModel(a); return; }
  const x = h.x + h.n[0], y = h.y + h.n[1], z = h.z + h.n[2];
  if (!world.inBounds(x, y, z) || y < 1 || world.get(x, y, z)) return;
  if (ownedDenied(x, y, z)) return;
  const b = it.id;
  const overlaps = p => x < p.x + HALF && x + 1 > p.x - HALF && y < p.y + HEIGHT && y + 1 > p.y && z < p.z + HALF && z + 1 > p.z - HALF;
  if (isSolid(b) && overlaps(me.pos)) return;
  for (const av of avatars.values()) if (overlaps(av.pos)) return;
  setBlock(x, y, z, b);
}
let frameSize = store.get('frameSize', [2, 1]);
function placeModel(a) {
  const r = modelPlacement(a);
  if (!r) return;
  if (!r.valid) { toast('Não cabe aqui: tem blocos no caminho'); return; }
  if (ownedDenied(r.cell.x, r.cell.y, r.cell.z)) return;
  const it = item();
  if (r.meta.picture) { openFrameDialog({ add: { model: it.id, x: r.cell.x, y: r.cell.y, z: r.cell.z, rot: r.rot } }); return; }
  const extra = r.meta.kanban || r.meta.tv || r.meta.lousa ? { w: r.meta.size[0], h: r.meta.size[1] } : {};
  if (r.free) extra.free = true;
  // painel de alertas novo já começa no primeiro grupo do ServiceNow (se houver)
  if (r.meta.kanban === 'alertas' && snConfig.groups.length) extra.source = 'sn:' + snConfig.groups[0].key;
  send({ t: 'obj_add', model: it.id, x: r.cell.x, y: r.cell.y, z: r.cell.z, rot: r.rot, ...extra });
}
// colocação livre (fora da grade) para decorações de chão/mesa: no ponto exato da mira, em passos de 1/16 de bloco.
// X liga/desliga (desligado = encaixa na grade, como antes). Itens de parede, portas, quadros e telas seguem a grade.
const canFree = m => !m.wall && !m.picture && !m.door && !m.kanban && !m.tv;
function toggleFreePlace() {
  freePlace = !freePlace; store.set('freePlace', freePlace);
  toast(freePlace ? '📐 Colocação livre: o objeto vai exatamente onde você mira (X encaixa na grade)' : '🔲 Encaixe na grade ligado (X volta à colocação livre)');
}
// caixa do objeto girada e posicionada: [minX, minY, minZ, maxX, maxY, maxZ]
function freeBox(id, meta, cell, rot) {
  const b = models.bounds(id);
  const mn = b ? b.min : { x: -meta.size[0] / 2, y: 0, z: -meta.size[2] / 2 }, mx = b ? b.max : { x: meta.size[0] / 2, y: meta.size[1], z: meta.size[2] / 2 };
  const a = rot * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of [[mn.x, mn.z], [mx.x, mn.z], [mn.x, mx.z], [mx.x, mx.z]]) {
    const rx = x * c + z * s, rz = -x * s + z * c;
    x0 = Math.min(x0, rx); x1 = Math.max(x1, rx); z0 = Math.min(z0, rz); z1 = Math.max(z1, rz);
  }
  return [cell.x + x0, cell.y + mn.y, cell.z + z0, cell.x + x1, cell.y + mx.y, cell.z + z1];
}
function freePlacement(it, meta, a, rot) {
  let p = null;
  if (a.block && a.block.n[1] === 1) { const h = a.block; p = { x: eyeV.x + dirV.x * h.t, y: h.y + 1, z: eyeV.z + dirV.z * h.t }; }
  else if (a.obj && a.obj.normal.y > 0.7) p = { x: a.obj.point.x, y: a.obj.point.y, z: a.obj.point.z };
  if (!p) return null;
  const snap = v => Math.round(v * 16) / 16;
  const cell = { x: snap(p.x), y: Math.round(p.y * 100) / 100, z: snap(p.z) };
  const box = freeBox(it.id, meta, cell, rot), e = 0.002;
  let valid = cell.y >= 1 && box[4] <= world.H;
  for (let y = Math.floor(box[1] + e); valid && y <= Math.floor(box[4] - e); y++)
    for (let z = Math.floor(box[2] + e); valid && z <= Math.floor(box[5] - e); z++)
      for (let x = Math.floor(box[0] + e); x <= Math.floor(box[3] - e); x++)
        if (!world.inBounds(x, y, z) || world.get(x, y, z)) { valid = false; break; }
  return { cell, rot, valid, meta, free: { box } };
}
// onde o modelo selecionado ficaria: na face de um bloco, ou em cima de um objeto
function modelPlacement(a) {
  const it = item();
  if (!it || it.k !== 'm' || !a) return null;
  let meta = models.meta(it.id);
  if (!meta) return null;
  if (meta.picture) meta = { ...meta, size: [frameSize[0], frameSize[1], 0.125] };
  let cell, rot = (((Math.round(me.yaw / (Math.PI / 2)) % 4) + 4 + modelRot) % 4);
  if (freePlace && canFree(meta)) { const f = freePlacement(it, meta, a, rot); if (f) return f; }
  if (a.block) {
    const h = a.block;
    cell = { x: h.x + h.n[0], y: h.y + h.n[1], z: h.z + h.n[2] };
    // itens de parede ficam encostados na parede mirada
    if (meta.wall && h.n[1] === 0) rot = ((Math.round(Math.atan2(h.n[0], h.n[2]) / (Math.PI / 2)) % 4) + 4) % 4;
  } else if (a.obj && a.obj.normal.y > 0.7) {
    cell = { x: Math.floor(a.obj.point.x), y: Math.round(a.obj.point.y * 100) / 100, z: Math.floor(a.obj.point.z) };
  } else return null;
  const pl = placement(meta, cell, rot);
  const y0 = Math.floor(cell.y + 0.001);
  let valid = cell.y >= 1 && cell.y + meta.size[1] <= world.H;
  for (let y = y0; valid && y < Math.ceil(cell.y + Math.max(meta.size[1], 0.05) - 0.01); y++) for (let z = pl.z0; valid && z < pl.z0 + pl.fd; z++) for (let x = pl.x0; x < pl.x0 + pl.fw; x++) {
    if (!world.inBounds(x, y, z) || world.get(x, y, z)) { valid = false; break; }
  }
  return { cell, rot, valid, meta };
}
function pickBlock() {
  const a = aim();
  if (!a) return;
  if (a.obj) { const o = models.objects.get(a.obj.id); if (o) hotbar[slot] = { k: 'm', id: o.data.model }; }
  else hotbar[slot] = B(a.block.b);
  saveHotbar(); renderHotbar();
}

// ---- sentar
let seated = null; // { objId, p, yaw }
function sitOn(objId) {
  const s = models.seat(objId);
  if (!s) return;
  seated = { objId, p: s.p };
  me.yaw = s.yaw; me.pitch = 0; me.vel.set(0, 0, 0); me.fly = false;
  renderButtons();
  toast('Sentado. Espaço ou WASD para levantar');
}
function standUp() {
  if (!seated) return;
  const o = models.objects.get(seated.objId);
  // sai pela frente do assento
  const yaw = me.yaw;
  me.pos.set(seated.p.x - Math.sin(yaw) * 0.9, Math.floor(seated.p.y) , seated.p.z - Math.cos(yaw) * 0.9);
  let guard = 0;
  while (collidesAt(me.pos) && guard++ < 6) me.pos.y += 1;
  if (collidesAt(me.pos)) me.pos.set(seated.p.x, seated.p.y + 0.6, seated.p.z);
  seated = null;
  if (!o) toast('O assento foi removido');
}
function seatedUpdate() {
  if (!seated) return false;
  if (!models.objects.has(seated.objId)) { standUp(); return false; }
  const input = locked && !chatOpen;
  if (input && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some(k => keys.has(k))) { standUp(); keys.delete('Space'); return false; }
  me.pos.set(seated.p.x, seated.p.y - 0.63, seated.p.z);
  return true;
}

// ---- quadro com imagem
let frameReq = null;
function openFrameDialog(req) {
  frameReq = req;
  if (document.pointerLockElement) document.exitPointerLock();
  const cur = req.edit || {};
  $('#fUrl').value = cur.url && !cur.url.startsWith('/images/') ? cur.url : '';
  $('#fFile').value = '';
  $('#fW').value = cur.w || frameSize[0]; $('#fH').value = cur.h || frameSize[1];
  $('#fW').disabled = $('#fH').disabled = !!req.edit;
  $('#fTitle').textContent = req.edit ? 'Trocar imagem do quadro' : 'Novo quadro';
  $('#fStatus').textContent = '';
  $('#frameDlg').classList.remove('hidden');
  updateOverlays();
  setTimeout(() => $('#fUrl').focus(), 0);
}
function closeFrameDialog(relock) { frameReq = null; $('#frameDlg').classList.add('hidden'); if (relock) lock(); updateOverlays(); }
$('#fCancel').onclick = () => closeFrameDialog(true);
$('#fOk').onclick = async () => {
  const req = frameReq; if (!req) return;
  const status = t => ($('#fStatus').textContent = t);
  let url = $('#fUrl').value.trim();
  const file = $('#fFile').files[0];
  const w = Math.max(1, Math.min(8, parseInt($('#fW').value) || 2)), h = Math.max(1, Math.min(8, parseInt($('#fH').value) || 1));
  try {
    if (file) {
      status('Enviando imagem…');
      const r = await fetch('/api/images', { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
      if (!r.ok) throw new Error(await r.text());
      url = (await r.json()).url;
    }
    if (!url) { status('Cole um link de imagem ou escolha um arquivo.'); return; }
    if (!/^https?:\/\//i.test(url) && !url.startsWith('/images/')) { status('O link precisa começar com http:// ou https://'); return; }
    if (req.edit) send({ t: 'obj_update', id: req.edit.id, url });
    else {
      frameSize = [w, h]; store.set('frameSize', frameSize);
      send({ t: 'obj_add', ...req.add, w, h, url });
    }
    closeFrameDialog(true);
  } catch (e) { status('Erro: ' + (e.message || e)); }
};
$('#fUrl').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('#fOk').click(); if (e.key === 'Escape') closeFrameDialog(false); });

// ---- laser
let laserOn = false, laserSent = 0, laserLast = null;
const laserFrom = new THREE.Vector3(), laserTo = new THREE.Vector3();
function stopLaser() {
  if (myStroke && !wbOpenObj) endStroke(); // soltou o botão: termina o traço no quadro branco
  if (!laserOn) return;
  laserOn = false; laserLast = null;
  if (myLaser) myLaser.set(null, null);
  send({ t: 'laser', p: null });
}
function updateLaser(now) {
  const it = item();
  const want = locked && !chatOpen && it && it.k === 'laser' && mouse.has(0);
  if (!want) { stopLaser(); return; }
  // só funciona apontando para uma Tela (TV de parede ou painel de blocos Tela)
  const a = aim(120);
  const tvObj = a && a.obj && models.objects.get(a.obj.id);
  if (tvObj && tvObj.lousa) {
    // quadro branco: o laser desenha (cor e espessura escolhidas na janela do quadro)
    laserTo.copy(a.obj.point).addScaledVector(a.obj.normal, 0.03);
    strokePoint(tvObj, ...lousaUV(tvObj, a.obj.point));
  } else if (tvObj && tvObj.meta.tv) {
    if (myStroke) endStroke();
    laserTo.copy(a.obj.point).addScaledVector(a.obj.normal, 0.03);
  } else if (a && a.block && a.block.b === TELA) {
    laserTo.copy(eyeV).addScaledVector(dirV, a.block.t).addScaledVector(new THREE.Vector3(...a.block.n), 0.05);
  } else { stopLaser(); return; }
  laserOn = true;
  if (myLaser) myLaser.set(laserFrom, laserTo);
  if (now - laserSent > 66 && (!laserLast || laserLast.distanceToSquared(laserTo) > 0.0004)) {
    laserSent = now; (laserLast ||= new THREE.Vector3()).copy(laserTo);
    send({ t: 'laser', p: [laserTo.x, laserTo.y, laserTo.z] });
  } else if (now - laserSent > 800) { laserSent = now; send({ t: 'laser', p: [laserTo.x, laserTo.y, laserTo.z] }); } // mantém vivo
}

// ------------------------------------------------------------ mão em primeira pessoa
const handRoot = new THREE.Group();
camera.add(handRoot); scene.add(camera);
const HAND_POS = new THREE.Vector3(0.4, -0.4, -0.62);
let handSwingAt = 0, handBob = 0;
async function rebuildHand() {
  const skin = store.get('skin', null);
  let tex = null;
  if (skin) { try { tex = await loadSkinTexture(skin); } catch {} }
  handRoot.clear();
  const m = buildHand(tex, me.color);
  m.rotation.set(1.35, 0.45, 0.1); // a mão aponta para frente, vindo do canto inferior direito
  handRoot.add(m);
}
function swingHand() { handSwingAt = performance.now(); if (myAvatar) myAvatar.swing(); }
// a mão só aparece durante o golpe: entra pelo canto inferior direito, bate e volta
function updateHand(dt) {
  const t = (performance.now() - handSwingAt) / 300;
  handRoot.visible = camMode === 0 && !loading && t < 1 && !hudHidden;
  if (!handRoot.visible) return;
  const s = Math.sin(t * Math.PI);           // 0 → 1 → 0
  const hit = Math.sin(Math.min(1, t * 1.6) * Math.PI); // empurrão rápido para frente
  handRoot.position.set(HAND_POS.x + (1 - s) * 0.35 - hit * 0.08, HAND_POS.y - (1 - s) * 0.45 + hit * 0.04, HAND_POS.z - hit * 0.16);
  handRoot.rotation.set(-hit * 0.5, hit * 0.35, 0);
}

// ------------------------------------------------------------ Kanban: quadros no mundo + página aberta dentro do jogo
let kanbanBoard = null, kanbanOpen = false, kanbanFetch = null;
// quadros dos grupos do ServiceNow (chave do grupo → dados) e a configuração (nomes dos grupos)
const snBoards = new Map(); let snConfig = { enabled: false, groups: [] };
fetch('/api/sn/config').then(r => r.json()).then(c => { snConfig = c; }).catch(() => {});
async function fetchSnBoard(key) {
  try {
    const r = await fetch('/api/sn/board?key=' + encodeURIComponent(key), { cache: 'no-store' });
    snBoards.set(key, r.ok ? await r.json() : { notConfigured: true });
  } catch { snBoards.set(key, { error: 'servidor indisponível' }); }
  for (const e of models.objects.values()) if (e.kanban && e.kanban.source === 'sn:' + key) drawKanbanObj(e);
}
function drawKanbanObj(e) {
  const src = e.kanban.source || 'time';
  if (e.kanban.mode === 'alertas') {
    // painel de alertas: atrasados e sem responsável (do Kanban do time ou de um grupo do ServiceNow)
    let b = kanbanBoard, label = 'Kanban do time';
    if (src.startsWith('sn:')) {
      const key = src.slice(3); b = snBoards.get(key);
      if (b === undefined) { snBoards.set(key, null); fetchSnBoard(key); }
      label = (snConfig.groups.find(g => g.key === key) || {}).label || (b && b.label) || 'ServiceNow';
    }
    e.kanban.alerts = drawAlerts(e.kanban.canvas, b || null, { title: `Alertas — ${label}`, blink: alertBlink });
    e.kanban.tex.needsUpdate = true;
    return;
  }
  if (src.startsWith('sn:')) {
    const key = src.slice(3), b = snBoards.get(key);
    if (b === undefined) { snBoards.set(key, null); fetchSnBoard(key); }
    const label = (snConfig.groups.find(g => g.key === key) || {}).label || (b && b.label) || 'ServiceNow';
    drawKanban(e.kanban.canvas, b || null, { title: `🎫 ${label}`, subtitle: 'ServiceNow · botão direito abre e edita', cols: e.kanban.cols });
  } else drawKanban(e.kanban.canvas, kanbanBoard, { mine: e.kanban.mode === 'meu', me: me.name, cols: e.kanban.cols });
  e.kanban.tex.needsUpdate = true;
}
function drawAllKanbans() { for (const e of models.objects.values()) if (e.kanban) drawKanbanObj(e); }
// painéis de alerta com algo pendente piscam (só os que estão perto: não gasta à toa)
let alertBlink = false, lastBlink = 0;
function blinkAlerts(now) {
  if (now - lastBlink < 700) return;
  lastBlink = now; alertBlink = !alertBlink;
  for (const e of models.objects.values()) {
    if (!e.kanban || e.kanban.mode !== 'alertas' || !e.kanban.alerts) continue;
    if (camera.position.distanceTo(e.group.position) < 45) drawKanbanObj(e);
  }
}
// o painel de alertas do ServiceNow se atualiza sozinho (o servidor já busca a cada minuto e avisa)
setInterval(() => { for (const e of models.objects.values()) if (e.kanban && e.kanban.mode === 'alertas') drawKanbanObj(e); }, 60000);
models.onKanban = e => drawKanbanObj(e);
function fetchKanban() {
  clearTimeout(kanbanFetch);
  kanbanFetch = setTimeout(async () => {
    try { kanbanBoard = await (await fetch('/api/kanban', { cache: 'no-store' })).json(); drawAllKanbans(); } catch {}
  }, 150);
}
// o logo do cabeçalho carrega depois: redesenha quando chegar
setTimeout(drawAllKanbans, 1500);
function openKanban(mine) {
  kanbanOpen = true;
  if (document.pointerLockElement) document.exitPointerLock();
  const q = new URLSearchParams({ me: me.name, email: me.email || '', embed: '1' });
  if (mine) q.set('mine', '1');
  if (typeof mine === 'string') { q.delete('mine'); q.set('board', mine); } // quadro de um grupo do ServiceNow
  $('#kanbanFrame').src = '/kanban.html?' + q;
  $('#kanbanDlg').classList.remove('hidden');
  updateOverlays();
}
function closeKanban() {
  kanbanOpen = false;
  // devolve o teclado ao jogo (senão o foco fica preso na página escondida e as teclas não chegam)
  const fr = $('#kanbanFrame');
  fr.blur(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  window.focus();
  keys.clear(); mouse.clear();
  $('#kanbanDlg').classList.add('hidden');
  fr.src = 'about:blank';
  updateOverlays();
  lock();
}
addEventListener('message', e => { if (e.data && e.data.kanban === 'close' && kanbanOpen) closeKanban(); });

// mudar o tamanho de um quadro Kanban (Shift + botão direito nele)
let kbSize = null; // { obj, w, h }
function kanbanFits(o, w, h) {
  const meta = { size: [w, h, 0.125] };
  const pl = placement(meta, o, o.rot);
  for (let y = Math.floor(o.y + 0.001); y < Math.ceil(o.y + h - 0.01); y++)
    for (let z = pl.z0; z < pl.z0 + pl.fd; z++) for (let x = pl.x0; x < pl.x0 + pl.fw; x++)
      if (!world.inBounds(x, y, z) || world.get(x, y, z)) return false;
  return true;
}
function renderKbSize() {
  $('#kbW').textContent = kbSize.w; $('#kbH').textContent = kbSize.h;
  const ok = kanbanFits(kbSize.obj.data, kbSize.w, kbSize.h);
  $('#kbSizeStatus').textContent = ok ? '' : '⚠️ Nesse tamanho o quadro bate em blocos (parede, teto ou chão)';
  $('#kbSizeOk').disabled = !ok;
}
const SIZE_LIMITS = { kanban: { w: [2, 16], h: [1, 6] }, tv: { w: [1, 16], h: [1, 5] }, lousa: { w: [1, 10], h: [1, 5] } };
function openKanbanSize(o) {
  if (document.pointerLockElement) document.exitPointerLock();
  const kind = o.meta.tv ? 'tv' : o.meta.lousa ? 'lousa' : 'kanban', L = SIZE_LIMITS[kind];
  const alert = o.meta.kanban === 'alertas';
  kbSize = { obj: o, w: o.meta.size[0], h: o.meta.size[1], L, kind };
  $('#kbSizeTitle').textContent = kind === 'tv' ? 'Tela (TV)' : kind === 'lousa' ? 'Quadro branco' : alert ? 'Painel de alertas' : 'Quadro Kanban';
  $('#kbSourceRow').classList.toggle('hidden', kind !== 'kanban');
  $('#kbColsRow').classList.toggle('hidden', kind !== 'kanban' || alert);
  $('#kbWHint').textContent = `${L.w[0]} a ${L.w[1]}`; $('#kbHHint').textContent = `${L.h[0]} a ${L.h[1]}`;
  if (kind !== 'kanban') { renderKbSize(); $('#kbSizeDlg').classList.remove('hidden'); updateOverlays(); return; }
  // fonte do quadro: Kanban do time ou um dos grupos do ServiceNow
  const sel = $('#kbSource'), cur = (o.kanban && o.kanban.source) || 'time';
  sel.innerHTML = `<option value="time">📌 Kanban do time${o.meta.kanban === 'meu' ? ' (minhas tarefas)' : ''}</option>` +
    snConfig.groups.map(g => `<option value="sn:${g.key}">🎫 ${g.label} (ServiceNow)</option>`).join('');
  if (cur.startsWith('sn:') && !snConfig.groups.some(g => 'sn:' + g.key === cur)) sel.insertAdjacentHTML('beforeend', `<option value="${cur}">🎫 ${cur.slice(3)} (não configurado)</option>`);
  sel.value = cur;
  kbSize.cols = o.kanban && o.kanban.cols ? o.kanban.cols.slice() : null; // null = todas
  sel.onchange = () => { kbSize.cols = null; if (!alert) renderKbCols(); };
  if (!alert) renderKbCols();
  renderKbSize();
  $('#kbSizeDlg').classList.remove('hidden');
  updateOverlays();
}
// colunas que aparecem no quadro da parede (as do quadro escolhido em "Mostrar")
function kbBoardFor(src) {
  if (src.startsWith('sn:')) { const b = snBoards.get(src.slice(3)); if (b === undefined) { snBoards.set(src.slice(3), null); fetchSnBoard(src.slice(3)).then(() => kbSize && renderKbCols()); } return b; }
  return kanbanBoard;
}
function renderKbCols() {
  const box = $('#kbCols'); box.textContent = '';
  const b = kbBoardFor($('#kbSource').value);
  const cols = b && b.columns;
  if (!cols || !cols.length) { box.textContent = 'Carregando colunas…'; return; }
  const on = id => !kbSize.cols || kbSize.cols.includes(id);
  for (const c of cols) {
    const l = document.createElement('label'); l.className = 'kbCol';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = on(c.id);
    cb.onchange = () => {
      const cur = cols.filter(x => (x.id === c.id ? cb.checked : on(x.id))).map(x => x.id);
      kbSize.cols = cur.length === cols.length ? null : cur;
      $('#kbColsHint').textContent = cur.length ? '' : '⚠️ Marque pelo menos uma coluna';
      $('#kbSizeOk').disabled = !cur.length || !kanbanFits(kbSize.obj.data, kbSize.w, kbSize.h);
    };
    const nm = document.createElement('span'); nm.textContent = c.name + (c.done ? ' ✓' : ''); l.title = nm.textContent;
    l.append(cb, nm);
    box.append(l);
  }
  $('#kbColsHint').textContent = '';
}
$('#kbColsAll').onclick = () => { if (kbSize) { kbSize.cols = null; renderKbCols(); renderKbSize(); } };
function closeKanbanSize(relock) { kbSize = null; $('#kbSizeDlg').classList.add('hidden'); updateOverlays(); if (relock) lock(); }
document.querySelectorAll('#kbSizeDlg [data-d]').forEach(b => (b.onclick = () => {
  if (!kbSize) return;
  const [k, s] = [b.dataset.d[0], b.dataset.d[1] === '+' ? 1 : -1];
  const L = kbSize.L;
  if (k === 'w') kbSize.w = Math.max(L.w[0], Math.min(L.w[1], kbSize.w + s)); else kbSize.h = Math.max(L.h[0], Math.min(L.h[1], kbSize.h + s));
  renderKbSize();
}));
$('#kbSizeOk').onclick = () => {
  if (kbSize) send({ t: 'obj_update', id: kbSize.obj.data.id, w: kbSize.w, h: kbSize.h, ...(kbSize.kind !== 'kanban' ? {} : { source: $('#kbSource').value, cols: kbSize.cols && kbSize.cols.length ? kbSize.cols : null }) });
  closeKanbanSize(true);
};
$('#kbSizeCancel').onclick = () => closeKanbanSize(true);

// ------------------------------------------------------------ pessoas: onde está, ir até, chamar
let mapFocus = null; // { id, until }: destaca a pessoa no mapa grande
const BUSY = s => s === 'ocupado' || s === 'reuniao';
function whereIs(id) {
  const a = avatars.get(id);
  if (!a) return '';
  const r = rooms.at(a.pos);
  return r ? `🚪 ${r.name}` : '🚶 Fora das salas';
}
let peopleSig = '';
function renderPeople(force) {
  const list = $('#peopleList');
  const ps = [...players.values()].sort((a, b) => a.name.localeCompare(b.name));
  const sig = ps.map(p => [p.id, p.name, p.status, whereIs(p.id)].join('|')).join(';');
  if (!force && sig === peopleSig) return; // só redesenha se algo mudou (não perde o clique no meio)
  peopleSig = sig;
  list.textContent = '';
  $('#peopleCount').textContent = ps.length || '';
  if (!ps.length) { const p = document.createElement('p'); p.className = 'sub'; p.textContent = 'Só você está online agora.'; list.append(p); }
  for (const p of ps) {
    const r = document.createElement('div'); r.className = 'personRow';
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = STATUS_COLORS[p.status] || STATUS_COLORS.disp; dot.title = STATUS_LABELS[p.status] || '';
    const info = document.createElement('div'); info.className = 'pInfo';
    const nm = document.createElement('b'); nm.textContent = p.name;
    const wh = document.createElement('span'); wh.className = 'pWhere'; wh.textContent = `${whereIs(p.id)} · ${STATUS_LABELS[p.status] || 'Disponível'}`;
    info.append(nm, wh);
    info.title = 'Mostrar no mapa'; info.onclick = () => showOnMap(p.id);
    const bMap = document.createElement('button'); bMap.textContent = '📍'; bMap.title = 'Mostrar no mapa'; bMap.onclick = () => showOnMap(p.id);
    const bGo = document.createElement('button'); bGo.className = 'primary'; bGo.textContent = '➜ Ir até'; bGo.onclick = () => goTo(p.id);
    const bCall = document.createElement('button'); bCall.textContent = '🔔 Chamar';
    if (BUSY(p.status)) { bCall.disabled = true; bCall.title = `${p.name} está ${p.status === 'reuniao' ? 'em reunião' : 'não disponível'}: não recebe chamadas`; }
    else bCall.onclick = () => { send({ t: 'call', to: p.id }); bCall.disabled = true; setTimeout(() => (bCall.disabled = false), 15000); };
    r.append(dot, info, bMap, bGo, bCall);
    list.append(r);
  }
  $('#notifBtn').classList.toggle('hidden', !('Notification' in window) || Notification.permission !== 'default');
}
$('#notifBtn').onclick = () => { if ('Notification' in window) Notification.requestPermission().then(() => renderPeople(true)); };
function showOnMap(id) {
  const a = avatars.get(id);
  if (!a) return;
  mapFocus = { id, until: performance.now() + 10000 };
  openMap();
  mapView.cx = a.pos.x; mapView.cz = a.pos.z; mapView.span = 56; clampMap(); lastMap = 0;
}
// vai até a pessoa: procura um lugar livre ao lado dela (na mesma sala) e vira para ela
function goTo(id) {
  const a = avatars.get(id), p = players.get(id);
  if (!a || !p) { toast('Essa pessoa não está mais online'); return; }
  const r = rooms.at(a.pos);
  if (r && r.locked && !(myRoom && myRoom.id === r.id)) { toast(`🔒 ${p.name} está em ${r.name}, que está trancada`); return; }
  const base = a.pos.clone(), t = new THREE.Vector3(), below = new THREE.Vector3();
  let spot = null;
  for (const d of [1.4, 2.2, 3]) {
    for (let k = 0; k < 8 && !spot; k++) {
      const ang = k * Math.PI / 4;
      for (const dy of [0, 1, -1]) {
        t.set(base.x + Math.sin(ang) * d, Math.floor(base.y) + dy, base.z + Math.cos(ang) * d);
        below.set(t.x, t.y - 0.3, t.z);
        const rr = rooms.at(t);
        if ((rr ? rr.id : null) !== (r ? r.id : null)) continue;
        if (!collidesAt(t) && collidesAt(below)) { spot = t.clone(); break; }
      }
    }
    if (spot) break;
  }
  if (!spot) spot = base.clone();
  if (seated) standUp();
  me.pos.copy(spot); me.vel.set(0, 0, 0);
  me.yaw = Math.atan2(-(base.x - spot.x), -(base.z - spot.z)); me.pitch = 0;
  if (menuPage !== 'main') showPage('main');
  if (mapOpen) closeMap(false);
  lock(true);
  toast(`Você foi até ${p.name}`);
}
// ---- chamadas recebidas
let pendingCall = null, titleFlash = null;
function callSound() {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  for (const [f, at] of [[880, 0], [1175, 0.18], [880, 0.5], [1175, 0.68]]) {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t0 + at); g.gain.linearRampToValueAtTime(0.25, t0 + at + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t0 + at + 0.35);
    o.connect(g); g.connect(audioCtx.destination); o.start(t0 + at); o.stop(t0 + at + 0.4);
  }
}
function onCall(m) {
  if (BUSY(myStatus)) return; // não incomoda quem está em reunião ou não disponível
  pendingCall = { from: m.from, name: m.name, at: performance.now() };
  $('#callText').textContent = `${m.name} está te chamando${m.room ? ' (' + m.room + ')' : ''}`;
  $('#callCard').classList.remove('hidden');
  callSound();
  clearTimeout(onCall.h); onCall.h = setTimeout(closeCall, 30000);
  if (document.hidden || !document.hasFocus()) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try { const n = new Notification('Voxel Hub', { body: `🔔 ${m.name} está te chamando${m.room ? ' (' + m.room + ')' : ''}`, tag: 'vh-call' }); n.onclick = () => { window.focus(); n.close(); }; } catch {}
    }
    clearInterval(titleFlash); const t = document.title; let k = 0;
    titleFlash = setInterval(() => { document.title = k++ % 2 ? t : `🔔 ${m.name} te chamou`; if (!document.hidden && document.hasFocus()) { clearInterval(titleFlash); document.title = t; } }, 900);
  }
}
function closeCall() { pendingCall = null; $('#callCard').classList.add('hidden'); }
$('#callGo').onclick = () => { const c = pendingCall; closeCall(); if (c) goTo(c.from); };
$('#callNo').onclick = () => closeCall();

// ------------------------------------------------------------ agenda das salas (só no Voxel Hub)
let reservas = [], agendaRoom = null;
const fmtH = ms => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
// reserva em andamento agora e a próxima de hoje
function roomAgenda(roomId, now = Date.now()) {
  const list = reservas.filter(x => x.room === roomId).sort((a, b) => a.start - b.start);
  const cur = list.find(x => x.start <= now && x.end > now) || null;
  const next = list.find(x => x.start > now && sameDay(x.start, now)) || null;
  return { cur, next, today: list.filter(x => sameDay(x.start, now) || (x.start < now && x.end > now)) };
}
function agendaLabel(r) {
  const { cur, next } = roomAgenda(r.id);
  if (cur) return `🔴 ${cur.title} até ${fmtH(cur.end)}`;
  if (next) return `🟢 Livre até ${fmtH(next.start)}`;
  return /reuni/i.test(r.name) ? '🟢 Livre' : '';
}
function openAgenda(roomId) {
  const r = rooms.get(roomId || (myRoom && myRoom.id));
  if (!r) { toast('Entre numa sala para ver a agenda dela'); return; }
  agendaRoom = r.id;
  if (document.pointerLockElement) document.exitPointerLock();
  keys.clear(); mouse.clear();
  const d = new Date(); $('#agDate').value = d.toISOString().slice(0, 10);
  const m = Math.ceil((d.getHours() * 60 + d.getMinutes()) / 15) * 15;
  const hm = v => String(Math.floor(v / 60) % 24).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
  $('#agStart').value = hm(m); $('#agEnd').value = hm(m + 60); $('#agTitle').value = '';
  renderAgenda();
  $('#agenda').classList.remove('hidden');
  updateOverlays();
}
function closeAgenda() { agendaRoom = null; $('#agenda').classList.add('hidden'); updateOverlays(); }
function renderAgenda() {
  const r = rooms.get(agendaRoom);
  if (!r) { closeAgenda(); return; }
  $('#agName').textContent = '📅 ' + r.name;
  $('#agStatus').textContent = agendaLabel(r) || '🟢 Livre';
  const day = $('#agDate').value ? new Date($('#agDate').value + 'T00:00') : new Date();
  const list = reservas.filter(x => x.room === r.id && sameDay(x.start, day)).sort((a, b) => a.start - b.start);
  const box = $('#agList'); box.textContent = '';
  if (!list.length) { const p = document.createElement('p'); p.className = 'sub'; p.textContent = 'Nenhuma reserva nesse dia.'; box.append(p); }
  const now = Date.now();
  for (const x of list) {
    const row = document.createElement('div'); row.className = 'agRow' + (x.start <= now && x.end > now ? ' now' : x.end < now ? ' past' : '');
    const t = document.createElement('b'); t.textContent = `${fmtH(x.start)}–${fmtH(x.end)}`;
    const ti = document.createElement('span'); ti.className = 'agT'; ti.textContent = `${x.title} · ${x.byName}`;
    row.append(t, ti);
    if (x.by === myKey() || isMine(r)) {
      const del = document.createElement('button'); del.textContent = 'Cancelar';
      del.onclick = () => { if (confirm(`Cancelar a reserva "${x.title}" (${fmtH(x.start)}–${fmtH(x.end)})?`)) send({ t: 'res_del', id: x.id }); };
      row.append(del);
    }
    box.append(row);
  }
}
function reserve(startMs, endMs) {
  send({ t: 'res_add', room: agendaRoom, title: $('#agTitle').value.trim() || 'Reunião', start: startMs, end: endMs });
}
$('#agDate').onchange = renderAgenda;
$('#agForm').onsubmit = e => {
  e.preventDefault();
  const d = $('#agDate').value, s = $('#agStart').value, en = $('#agEnd').value;
  if (!d || !s || !en) return;
  reserve(new Date(`${d}T${s}`).getTime(), new Date(`${d}T${en}`).getTime());
};
document.querySelectorAll('#agenda [data-now]').forEach(b => (b.onclick = () => { const n = Math.floor(Date.now() / 60000) * 60000; reserve(n, n + Number(b.dataset.now) * 60000); }));
$('#agClose').onclick = () => closeAgenda();
$('#agendaBtn').onclick = () => openAgenda();
$('#agTitle').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closeAgenda(); });
function onReservasChanged() {
  if (agendaRoom) renderAgenda();
  updateRoomHud(); refreshDoorSigns(true);
}
// placa em cima das portas: "Livre" / "Ocupada até 15:00" (salas de reunião ou com reserva hoje)
function signTexture(text, busy) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 112;
  const x = c.getContext('2d');
  x.fillStyle = busy ? '#b3261e' : '#1e7d4a'; x.beginPath(); x.roundRect(4, 4, 504, 104, 20); x.fill();
  x.fillStyle = '#fff'; x.font = 'bold 44px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  let t = text; while (x.measureText(t).width > 470 && t.length > 3) t = t.slice(0, -2) + '…';
  x.fillText(t, 256, 58);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
const signGeo = new THREE.PlaneGeometry(1.7, 0.37);
let lastSigns = 0;
function refreshDoorSigns(force) {
  const now = performance.now();
  if (!force && now - lastSigns < 20000) return;
  lastSigns = now;
  for (const e of models.doors) {
    if (!e.doorRooms) continue;
    const r = e.doorRooms.map(id => rooms.get(id)).find(rr => rr && (/reuni/i.test(rr.name) || roomAgenda(rr.id).today.length));
    let text = '', busy = false;
    if (r) { const { cur, next } = roomAgenda(r.id); busy = !!cur; text = cur ? `Ocupada até ${fmtH(cur.end)}` : next ? `Livre · ${fmtH(next.start)} reservada` : 'Livre'; }
    if (text === (e.signText || '')) continue;
    e.signText = text;
    if (e.sign) { for (const m of e.sign) { e.group.remove(m); m.material.map.dispose(); m.material.dispose(); } e.sign = null; }
    if (!text) continue;
    const tex = signTexture(text, busy), h = e.meta.size[1];
    e.sign = [1, -1].map(s => {
      const m = new THREE.Mesh(signGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
      m.position.set(0, h + 0.32, s * 0.515); if (s < 0) m.rotation.y = Math.PI;
      m.raycast = () => {}; e.group.add(m); return m;
    });
  }
}

// ------------------------------------------------------------ quadro branco interativo
// traços: { c: cor ou 'erase', w: espessura (milésimos da altura), p: [[u,v]...] } — u,v de 0 a 1
const WB_COLORS = ['#111111', '#1e63c6', '#c62828', '#2e7d32', '#f37021', '#7b1fa2'];
const WB_SIZES = { fino: 4, medio: 10, grosso: 22 };
let wbColor = store.get('wbColor', '#111111'), wbSize = store.get('wbSize', 'medio');
let myStroke = null, wbOpenObj = null, wbSeq = 0;
function lousaClear(e) { const c = e.lousa.canvas, x = c.getContext('2d'); x.fillStyle = '#fbfbf8'; x.fillRect(0, 0, c.width, c.height); }
function lousaSeg(e, s, from) {
  const c = e.lousa.canvas, x = c.getContext('2d'), W = c.width, H = c.height;
  const pts = s.p; if (!pts.length) return;
  x.strokeStyle = x.fillStyle = s.c === 'erase' ? '#fbfbf8' : s.c;
  x.lineWidth = Math.max(1, s.w / 1000 * H); x.lineCap = 'round'; x.lineJoin = 'round';
  const i0 = Math.max(0, from - 1);
  if (pts.length === 1 || i0 === pts.length - 1) { x.beginPath(); x.arc(pts[pts.length - 1][0] * W, pts[pts.length - 1][1] * H, x.lineWidth / 2, 0, Math.PI * 2); x.fill(); }
  else { x.beginPath(); x.moveTo(pts[i0][0] * W, pts[i0][1] * H); for (let i = i0 + 1; i < pts.length; i++) x.lineTo(pts[i][0] * W, pts[i][1] * H); x.stroke(); }
  e.lousa.tex.needsUpdate = true;
}
function lousaRedraw(e) { lousaClear(e); for (const s of e.lousa.strokes.values()) lousaSeg(e, s, 0); e.lousa.tex.needsUpdate = true; }
models.onLousa = e => { lousaRedraw(e); send({ t: 'wb_get', id: e.data.id }); };
function lousaObj(id) { const e = models.objects.get(id); return e && e.lousa ? e : null; }
function onWb(m) {
  const e = lousaObj(m.id); if (!e) return;
  if (m.t === 'wb_all') { e.lousa.strokes = new Map(m.strokes.map(s => [s.id, { c: s.c, w: s.w, p: s.p }])); lousaRedraw(e); }
  else if (m.t === 'wb_seg') {
    let s = e.lousa.strokes.get(m.sid);
    if (!s) e.lousa.strokes.set(m.sid, (s = { c: m.c, w: m.w, p: [] }));
    const from = s.p.length; s.p.push(...m.pts); lousaSeg(e, s, from);
  } else if (m.t === 'wb_clear') { e.lousa.strokes.clear(); lousaRedraw(e); if (wbOpenObj === e && m.by) toast(`${m.by} limpou o quadro`); }
  else if (m.t === 'wb_del') { e.lousa.strokes.delete(m.sid); lousaRedraw(e); }
}
// desenhar: começa/continua um traço meu no quadro e manda os pontos novos a cada ~50 ms
function strokePoint(e, u, v) {
  u = Math.max(0, Math.min(1, u)); v = Math.max(0, Math.min(1, v));
  if (!myStroke || myStroke.e !== e) {
    endStroke();
    const sid = `${myId}:${Date.now().toString(36)}${(wbSeq++).toString(36)}`;
    const s = { c: wbColor, w: WB_SIZES[wbSize] * (wbColor === 'erase' ? 3 : 1), p: [] };
    e.lousa.strokes.set(sid, s);
    myStroke = { e, sid, s, pending: [], sent: 0 };
  }
  const s = myStroke.s, last = s.p[s.p.length - 1];
  if (last && Math.hypot(last[0] - u, last[1] - v) < 0.0015) return;
  const from = s.p.length; s.p.push([u, v]); myStroke.pending.push([u, v]);
  lousaSeg(e, s, from);
  if (performance.now() - myStroke.sent > 50) flushStroke();
}
function flushStroke() {
  if (!myStroke || !myStroke.pending.length) return;
  send({ t: 'wb_seg', id: myStroke.e.data.id, sid: myStroke.sid, c: myStroke.s.c, w: myStroke.s.w, pts: myStroke.pending });
  myStroke.pending = []; myStroke.sent = performance.now();
}
function endStroke() { flushStroke(); myStroke = null; }
// ponto da mira (mundo) → u,v na superfície do quadro
const _wbP = new THREE.Vector3();
function lousaUV(e, point) {
  e.group.updateMatrixWorld();
  e.group.worldToLocal(_wbP.copy(point));
  const W = e.meta.size[0] - 0.12, H = e.meta.size[1] - 0.12;
  return [(_wbP.x + W / 2) / W, 1 - (_wbP.y - 0.06) / H];
}
// janela para desenhar com o mouse: o próprio canvas do quadro vai para a janela (todo mundo vê ao vivo)
function openLousa(e) {
  wbOpenObj = e;
  if (document.pointerLockElement) document.exitPointerLock();
  keys.clear(); mouse.clear();
  const cv = e.lousa.canvas; cv.className = 'wbCanvas';
  $('#wbHolder').textContent = ''; $('#wbHolder').append(cv);
  renderWbTools();
  $('#wbDlg').classList.remove('hidden');
  updateOverlays();
}
function closeLousa() {
  endStroke();
  if (wbOpenObj) wbOpenObj.lousa.canvas.remove();
  wbOpenObj = null; $('#wbDlg').classList.add('hidden'); updateOverlays();
}
function renderWbTools() {
  const box = $('#wbColors'); box.textContent = '';
  for (const c of [...WB_COLORS, 'erase']) {
    const b = document.createElement('button'); b.className = 'wbSw' + (wbColor === c ? ' sel' : '');
    if (c === 'erase') { b.textContent = '🧽'; b.title = 'Borracha'; } else { b.style.background = c; b.title = c; }
    b.onclick = () => { wbColor = c; store.set('wbColor', c); renderWbTools(); };
    box.append(b);
  }
  document.querySelectorAll('#wbDlg [data-size]').forEach(b => b.classList.toggle('sel', b.dataset.size === wbSize));
}
document.querySelectorAll('#wbDlg [data-size]').forEach(b => (b.onclick = () => { wbSize = b.dataset.size; store.set('wbSize', wbSize); renderWbTools(); }));
$('#wbUndo').onclick = () => { if (wbOpenObj) { endStroke(); send({ t: 'wb_undo', id: wbOpenObj.data.id }); } };
$('#wbClear').onclick = () => { if (wbOpenObj && confirm('Limpar o quadro para todo mundo?')) send({ t: 'wb_clear', id: wbOpenObj.data.id }); };
$('#wbClose').onclick = () => closeLousa();
{
  const holder = $('#wbHolder');
  const uv = ev => { const c = wbOpenObj.lousa.canvas, r = c.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height]; };
  holder.addEventListener('pointerdown', ev => { if (!wbOpenObj || ev.button !== 0) return; ev.preventDefault(); holder.setPointerCapture(ev.pointerId); endStroke(); strokePoint(wbOpenObj, ...uv(ev)); });
  holder.addEventListener('pointermove', ev => { if (!wbOpenObj || !(ev.buttons & 1) || !myStroke) return; const co = ev.getCoalescedEvents ? ev.getCoalescedEvents() : []; for (const pe of co.length ? co : [ev]) strokePoint(wbOpenObj, ...uv(pe)); });
  for (const t of ['pointerup', 'pointercancel']) holder.addEventListener(t, () => endStroke());
}

// ------------------------------------------------------------ portas automáticas
const _doorP = new THREE.Vector3();
function updateDoors(dt) {
  const people = [me.pos];
  for (const a of avatars.values()) people.push(a.pos);
  for (const e of models.doors) {
    const d = e.door;
    if (!d) continue;
    const g = e.group;
    // salas dos dois lados da porta (recalcula de vez em quando)
    if (!e.doorRoomsAt || performance.now() - e.doorRoomsAt > 1500) {
      e.doorRoomsAt = performance.now();
      const th = e.data.rot * Math.PI / 2, nx = Math.round(Math.sin(th)), nz = Math.round(Math.cos(th));
      const y = Math.floor(g.position.y) + 1, ids = new Set();
      for (const s of [1, -1]) { const r = rooms.atCell(Math.floor(g.position.x + nx * s), y, Math.floor(g.position.z + nz * s)); if (r) ids.add(r.id); }
      e.doorRooms = [...ids];
    }
    const locked = e.doorRooms.map(id => rooms.get(id)).find(r => r && r.locked);
    let want = 0;
    for (const p of people) {
      if (Math.abs(p.y - g.position.y) > 2.5 || Math.hypot(p.x - g.position.x, p.z - g.position.z) > 2.6) continue;
      if (locked) { const r = rooms.at(p); if (!r || r.id !== locked.id) continue; } // trancada: só abre para quem está dentro
      want = 1; break;
    }
    d.open += (want - d.open) * Math.min(1, dt * 7);
    for (const l of d.leaves) l.leaf.position.x = l.base + l.dir * d.open * l.lw * 0.92;
    for (const s of d.locks) s.visible = !!locked;
  }
}

// ------------------------------------------------------------ câmera: 1ª pessoa, 3ª por trás, 3ª pela frente
let camMode = 0, myAvatar = null;
const CAM_NAMES = ['Primeira pessoa', 'Terceira pessoa (por trás)', 'Terceira pessoa (pela frente)'];
const _camDir = new THREE.Vector3(), _camP = new THREE.Vector3();
function cycleCam() { camMode = (camMode + 1) % 3; toast('Câmera: ' + CAM_NAMES[camMode]); }
function updateCamera(dt) {
  updateEye();
  if (myAvatar) {
    myAvatar.setTarget([me.pos.x, me.pos.y, me.pos.z], [me.yaw, me.pitch], true);
    myAvatar.sit = !!seated;
    myAvatar.group.visible = camMode !== 0;
    if (camMode !== 0) myAvatar.update(dt, camera);
  }
  if (camMode === 0) { camera.position.copy(eyeV); camera.rotation.set(me.pitch, me.yaw, 0); return; }
  // afasta a câmera da cabeça, parando antes de entrar num bloco
  _camDir.copy(dirV).multiplyScalar(camMode === 1 ? -1 : 1);
  let dist = 4;
  for (let t = 0.2; t <= 4; t += 0.1) {
    _camP.copy(eyeV).addScaledVector(_camDir, t);
    if (solidAt(Math.floor(_camP.x), Math.floor(_camP.y), Math.floor(_camP.z))) { dist = Math.max(0.25, t - 0.3); break; }
  }
  camera.position.copy(eyeV).addScaledVector(_camDir, dist);
  camera.lookAt(eyeV);
}

// ------------------------------------------------------------ loop
let last = performance.now(), lastSend = 0, lastSent = '', fps = 0, fpsAcc = 0, fpsN = 0;
const audioPos = new Map();
// o quadro é sempre desenhado: um erro em alguma parte do jogo é registrado, mas não congela a tela
let frameErrAt = 0;
function frame(now) {
  requestAnimationFrame(frame);
  try { frameBody(now); }
  catch (e) {
    if (now - frameErrAt > 5000) { frameErrAt = now; console.error('erro no quadro', e); toast('⚠️ Algo deu errado (detalhes no console, F12) — o jogo continua'); }
  }
  renderer.render(scene, camera);
}
function frameBody(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }

  if (world) {
    if (loading) {
      world.update(30);
      $('#loadBar').style.width = (world.progress * 100).toFixed(0) + '%';
      if (!world.queue.length) {
        loading = false;
        $('#loading').classList.add('hidden');
        $('#hud').classList.remove('hidden');
        renderHotbar(); renderButtons(); renderPlayers(); renderStatusInd(); renderHearts();
        sysMsg('Bem-vindo! Enter abre o chat, Esc abre o menu.');
        $('#menuSub').textContent = 'Bem-vindo, ' + me.name + '!';
        setTimeout(() => ($('#menuSub').textContent = 'Pausado'), 4000);
        updateOverlays();
      }
    } else {
      world.update(6);
      if (!seatedUpdate()) physics(dt);
    }
    updateCamera(dt);
    updateHand(dt);
    if (!loading) updateDoors(dt);

    if (!loading) {
      const it = item();
      const h = locked && !(it && it.k === 'laser') ? target() : null;
      highlight.visible = !!h && !(it && it.k === 'm') && !hudHidden;
      if (h) highlight.position.set(h.x + 0.5, h.y + 0.5, h.z + 0.5);
      // prévia do modelo
      const a = locked && it && it.k === 'm' ? aim() : null;
      const mp = a && !(a.block && a.block.b === TELA && !shift()) ? modelPlacement(a) : null;
      if (mp) models.showGhost(it.id, mp.cell, mp.rot, mp.valid, mp.meta, mp.free); else models.hideGhost();
      for (const [b, t] of mouse) if (now >= t && !(it && it.k === 'laser')) { if (b === 0) primary(); else if (b === 2) secondary(); mouse.set(b, now + 200); }
      updateLaser(now);
    }

    // posição de cada voz: reaproveita os vetores (nada de criar objetos novos a cada quadro)
    for (const id of audioPos.keys()) if (!avatars.has(id)) audioPos.delete(id);
    for (const a of avatars.values()) {
      a.update(dt, camera);
      let v = audioPos.get(a.id); if (!v) audioPos.set(a.id, (v = new THREE.Vector3()));
      v.set(a.pos.x, a.pos.y + (a.sit ? 1.0 : 1.6), a.pos.z);
    }
    if (!loading && now - lastOcc > 250) { lastOcc = now; updateOcclusion(audioPos); updateRoomHud(); updateStatus(false); models.updateLod(camera.position); refreshDoorSigns(false); if (menuPage === 'people' && !locked) renderPeople(); }
    if (!loading) blinkAlerts(now);
    if (rtc) rtc.update(camera, audioPos, voiceMode, occlusion);
    if (!loading) updateWatching(now);
    if (!loading) {
      const it = item();
      rooms.setOutlines(!!(it && it.k === 'room'));
      const h = roomCornerA && locked ? target(30) : null;
      rooms.showBox(roomCornerA ? roomBox(roomCornerA, h ? { x: h.x, y: h.y, z: h.z } : roomCornerA) : null);
      rooms.updateLockVisibility(myRoom);
    }
    screens.update();
    particles.update(dt, solidAt);
    if (!loading) drawMap(now);

    if (now - lastSend > 80) {
      const msg = JSON.stringify([me.pos.x.toFixed(2), me.pos.y.toFixed(2), me.pos.z.toFixed(2), me.yaw.toFixed(2), me.pitch.toFixed(2), !!seated]);
      if (msg !== lastSent) { send({ t: 'pos', p: [me.pos.x, me.pos.y, me.pos.z], r: [me.yaw, me.pitch], s: !!seated }); lastSent = msg; }
      lastSend = now;
      $('#info').textContent = `X ${me.pos.x.toFixed(1)}  Y ${me.pos.y.toFixed(1)}  Z ${me.pos.z.toFixed(1)}\n${fps} fps · ${players.size + 1} online`;
    }
  }
  clouds.position.x = (now / 1000 * 0.6) % 200;
  tickGifs(now);
}
requestAnimationFrame(frame);

// para depuração no console: voxelHub.rtc, voxelHub.players
window.voxelHub = {
  get rtc() { return rtc; }, players, avatars, me, models, rooms,
  // estatísticas de desenho (para medir desempenho): desenha um quadro e devolve chamadas/triângulos/tempo
  drawStats() { renderer.info.autoReset = true; updateCamera(0); scene.updateMatrixWorld(); const t0 = performance.now(); renderer.render(scene, camera); const gl = renderer.getContext(); gl.finish(); return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, ms: +(performance.now() - t0).toFixed(2) }; },
};

// retoma o áudio se o navegador suspender (no login automático ele nasce suspenso até o 1º clique/tecla)
for (const ev of ['click', 'keydown']) document.addEventListener(ev, () => { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); });

// login salvo neste navegador: entra direto, sem a tela de entrada.
// "Sair do mundo" volta para a tela de entrada uma vez; "Sair da conta" esquece o login.
(() => {
  let skip = false;
  try { skip = sessionStorage.getItem('vx_noauto') === '1'; sessionStorage.removeItem('vx_noauto'); } catch {}
  if (!skip && store.get('name', '') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(store.get('email', ''))) join();
})();

