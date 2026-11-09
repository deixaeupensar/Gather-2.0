// Avatares dos outros jogadores: robozinho de blocos, nome, e tela compartilhada flutuante
import * as THREE from 'three';

const geo = {};
const box = (w, h, d) => (geo[`${w},${h},${d}`] ||= new THREE.BoxGeometry(w, h, d));
const PLANE = new THREE.PlaneGeometry(1, 1);
const TAU = Math.PI * 2;
const wrap = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;

// ---- presença
export const STATUS_COLORS = { disp: '#2ecc71', ausente: '#f1c40f', ocupado: '#e74c3c', reuniao: '#9b59b6' };
export const STATUS_LABELS = { disp: 'Disponível', ausente: 'Ausente', ocupado: 'Não disponível', reuniao: 'Em reunião' };

// ---- laser apontador: só um pontinho vermelho na tela
let dotTex = null;
function dotTexture() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d');
  x.beginPath(); x.arc(16, 16, 13, 0, Math.PI * 2);
  x.fillStyle = '#ff2020'; x.fill();
  x.lineWidth = 3; x.strokeStyle = 'rgba(90,0,0,0.9)'; x.stroke();
  dotTex = new THREE.CanvasTexture(c); dotTex.colorSpace = THREE.SRGBColorSpace;
  return dotTex;
}
export class LaserBeam {
  constructor(scene) {
    this.scene = scene;
    this.dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), transparent: true, depthWrite: false, fog: false, toneMapped: false }));
    this.dot.scale.set(0.11, 0.11, 1);
    this.dot.renderOrder = 10;
    this.dot.visible = false;
    scene.add(this.dot);
  }
  set(from, to) {
    this.dot.visible = !!to;
    if (to) this.dot.position.copy(to);
  }
  dispose() { this.scene.remove(this.dot); this.dot.material.dispose(); }
}

// ---- skins no layout padrão 64x64 (ou 64x32 antigo) de jogos de blocos
const PX = 1.8 / 32; // 32 pixels de altura = 1,8 bloco
const skinLoader = new THREE.TextureLoader();
const skinCache = new Map();
function loadSkin(url) {
  if (!skinCache.has(url)) skinCache.set(url, skinLoader.loadAsync(url).then(t => {
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return t;
  }));
  return skinCache.get(url);
}
// caixa w×h×d (pixels) com a textura a partir de (u, v) no arquivo da skin
function skinBox(w, h, d, u, v, texH, mat, inflate = 0) {
  const g = new THREE.BoxGeometry((w + inflate * 2) * PX, (h + inflate * 2) * PX, (d + inflate * 2) * PX);
  // faces do BoxGeometry: +x (lado direito), -x (esquerdo), +y (topo), -y (baixo), +z (costas), -z (frente)
  const R = [[u, v + d, d, h], [u + d + w, v + d, d, h], [u + d, v, w, d], [u + d + w, v, w, d], [u + 2 * d + w, v + d, w, h], [u + d, v + d, w, h]];
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const [rx, ry, rw, rh] = R[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      let uu = uv.getX(i), vv = uv.getY(i);
      if (f === 2) { uu = 1 - uu; vv = 1 - vv; } else if (f === 3) uu = 1 - uu;
      uv.setXY(i, (rx + uu * rw) / 64, 1 - (ry + (1 - vv) * rh) / texH);
    }
  }
  return new THREE.Mesh(g, mat);
}
export const loadSkinTexture = url => loadSkin(url);
// braço direito para a mão em primeira pessoa (desenhado por cima de tudo)
export function buildHand(tex, color) {
  let mesh;
  if (tex) {
    const texH = tex.image.height === 32 ? 32 : 64;
    mesh = skinBox(4, 12, 4, 40, 16, texH, new THREE.MeshLambertMaterial({ map: tex, depthTest: false, depthWrite: false }));
    if (texH === 64) { const o = skinBox(4, 12, 4, 40, 32, texH, new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.1, depthTest: false, depthWrite: false }), 0.25); mesh.add(o); }
  } else {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.66, 0.24), new THREE.MeshLambertMaterial({ color: new THREE.Color(color), depthTest: false, depthWrite: false }));
  }
  mesh.traverse(m => { m.renderOrder = 999; });
  return mesh;
}
function buildSkinModel(tex) {
  const texH = tex.image.height === 32 ? 32 : 64, modern = texH === 64;
  const base = new THREE.MeshLambertMaterial({ map: tex });
  const over = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
  const root = new THREE.Group();
  const P = (x, y, z) => { const g = new THREE.Group(); g.position.set(x * PX, y * PX, z * PX); root.add(g); return g; };
  const add = (pivot, mesh, y) => { mesh.position.y = y * PX; pivot.add(mesh); };
  const head = P(0, 24, 0);
  add(head, skinBox(8, 8, 8, 0, 0, texH, base), 4);
  add(head, skinBox(8, 8, 8, 32, 0, texH, over, 0.5), 4);
  const body = P(0, 18, 0);
  add(body, skinBox(8, 12, 4, 16, 16, texH, base), 0);
  if (modern) add(body, skinBox(8, 12, 4, 16, 32, texH, over, 0.25), 0);
  const armR = P(6, 22, 0), armL = P(-6, 22, 0), legR = P(2, 12, 0), legL = P(-2, 12, 0);
  add(armR, skinBox(4, 12, 4, 40, 16, texH, base), -4);
  add(armL, modern ? skinBox(4, 12, 4, 32, 48, texH, base) : skinBox(4, 12, 4, 40, 16, texH, base), -4);
  add(legR, skinBox(4, 12, 4, 0, 16, texH, base), -6);
  add(legL, modern ? skinBox(4, 12, 4, 16, 48, texH, base) : skinBox(4, 12, 4, 0, 16, texH, base), -6);
  if (modern) {
    add(armR, skinBox(4, 12, 4, 40, 32, texH, over, 0.25), -4);
    add(armL, skinBox(4, 12, 4, 48, 48, texH, over, 0.25), -4);
    add(legR, skinBox(4, 12, 4, 0, 32, texH, over, 0.25), -6);
    add(legL, skinBox(4, 12, 4, 0, 48, texH, over, 0.25), -6);
  }
  return { root, head, arms: [armL, armR], legs: [legL, legR], mats: [base, over] };
}

export class Avatar {
  constructor(scene, info) {
    this.scene = scene;
    this.id = info.id; this.name = info.name; this.color = info.color;
    this.mic = false; this.screen = false; this.speaking = false; this.float = true; this.status = info.status || 'disp';
    this.pos = new THREE.Vector3(); this.target = new THREE.Vector3();
    this.yaw = 0; this.tYaw = 0; this.pitch = 0; this.tPitch = 0; this.walk = 0;

    const c = new THREE.Color(info.color);
    const body = new THREE.MeshLambertMaterial({ color: c });
    const dark = new THREE.MeshLambertMaterial({ color: c.clone().multiplyScalar(0.55) });
    const light = new THREE.MeshLambertMaterial({ color: c.clone().lerp(new THREE.Color('#ffffff'), 0.6) });
    const visor = new THREE.MeshBasicMaterial({ color: 0x18202c });
    const eye = new THREE.MeshBasicMaterial({ color: 0x7fe3ff });
    this.mats = [body, dark, light, visor, eye];

    const g = this.group = new THREE.Group();
    const add = (parent, geom, mat, x, y, z) => { const m = new THREE.Mesh(geom, mat); m.position.set(x, y, z); parent.add(m); return m; };
    add(g, box(0.56, 0.72, 0.32), body, 0, 1.11, 0);
    add(g, box(0.4, 0.2, 0.04), light, 0, 1.2, -0.17);
    this.head = new THREE.Group(); this.head.position.y = 1.47; g.add(this.head);
    add(this.head, box(0.5, 0.46, 0.46), light, 0, 0.23, 0);
    add(this.head, box(0.4, 0.15, 0.03), visor, 0, 0.26, -0.235);
    add(this.head, box(0.07, 0.07, 0.01), eye, -0.1, 0.26, -0.252);
    add(this.head, box(0.07, 0.07, 0.01), eye, 0.1, 0.26, -0.252);
    add(this.head, box(0.05, 0.14, 0.05), dark, 0, 0.53, 0);
    add(this.head, box(0.1, 0.1, 0.1), body, 0, 0.64, 0);
    this.legs = []; this.arms = [];
    for (const s of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(0.14 * s, 0.75, 0); g.add(leg);
      add(leg, box(0.24, 0.75, 0.28), dark, 0, -0.375, 0); this.legs.push(leg);
      const arm = new THREE.Group(); arm.position.set(0.39 * s, 1.43, 0); g.add(arm);
      add(arm, box(0.18, 0.66, 0.24), body, 0, -0.31, 0); this.arms.push(arm);
    }

    this.robot = { parts: g.children.slice(), head: this.head, legs: this.legs, arms: this.arms };
    this.tagCanvas = document.createElement('canvas');
    this.tagCanvas.width = 512; this.tagCanvas.height = 96;
    this.tagTex = new THREE.CanvasTexture(this.tagCanvas);
    this.tagTex.colorSpace = THREE.SRGBColorSpace;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tagTex, depthWrite: false, fog: false }));
    this.tag.scale.set(2.4, 0.45, 1);
    this.tag.position.y = 2.35;
    g.add(this.tag);
    this.drawTag();
    scene.add(g);
    this.laser = new LaserBeam(scene, info.color);
    this.laserTarget = null; this.laserAt = 0;
    this.hand = new THREE.Vector3();
  }
  setSkin(url) {
    if (this.skinUrl === url) return;
    this.skinUrl = url;
    const useRobot = () => {
      if (this.skin) { this.group.remove(this.skin.root); this.skin.mats.forEach(m => m.dispose()); this.skin = null; }
      this.robot.parts.forEach(p => (p.visible = true));
      Object.assign(this, { head: this.robot.head, legs: this.robot.legs, arms: this.robot.arms });
    };
    if (!url) { useRobot(); return; }
    loadSkin(url).then(tex => {
      if (this.skinUrl !== url) return;
      useRobot();
      this.skin = buildSkinModel(tex);
      this.group.add(this.skin.root);
      this.robot.parts.forEach(p => (p.visible = false));
      Object.assign(this, { head: this.skin.head, legs: this.skin.legs, arms: this.skin.arms });
    }).catch(() => { if (this.skinUrl === url) useRobot(); });
  }
  setLaser(p) {
    if (p) { (this.laserTarget ||= new THREE.Vector3()).set(p[0], p[1], p[2]); this.laserAt = performance.now(); }
    else this.laserTarget = null;
  }
  drawTag() {
    const x = this.tagCanvas.getContext('2d');
    x.clearRect(0, 0, 512, 96);
    const label = (this.mic ? '🎤 ' : '') + (this.screen ? '🖥️ ' : '') + this.name;
    x.font = 'bold 44px system-ui, "Segoe UI", sans-serif';
    const tw = Math.min(420, x.measureText(label).width);
    const w = tw + 40 + 34, left = (512 - w) / 2;
    x.fillStyle = this.speaking ? 'rgba(39,174,96,0.9)' : 'rgba(10,14,22,0.6)';
    x.beginPath(); x.roundRect(left, 10, w, 76, 22); x.fill();
    // bolinha de presença
    x.beginPath(); x.arc(left + 32, 48, 13, 0, Math.PI * 2);
    x.fillStyle = STATUS_COLORS[this.status] || STATUS_COLORS.disp; x.fill();
    x.lineWidth = 4; x.strokeStyle = 'rgba(255,255,255,0.9)'; x.stroke();
    x.fillStyle = '#fff'; x.textAlign = 'left'; x.textBaseline = 'middle';
    x.fillText(label, left + 56, 50, 420);
    this.tagTex.needsUpdate = true;
  }
  setTarget(p, r, snap) {
    this.target.set(p[0], p[1], p[2]); this.tYaw = r[0]; this.tPitch = r[1];
    if (snap) { this.pos.copy(this.target); this.yaw = this.tYaw; this.pitch = this.tPitch; }
  }
  setMedia(mic, screen) {
    if (mic === this.mic && screen === this.screen) return;
    this.mic = mic; this.screen = screen; this.drawTag();
  }
  swing() { this.swingAt = performance.now(); }
  hurt() { this.hurtAt = performance.now(); }
  allMats() { return this.skin ? this.mats.concat(this.skin.mats) : this.mats; }
  // caixa de colisão para o soco (pés em pos)
  hitBox() { const h = this.sit ? 1.4 : 1.9; return [this.pos.x - 0.4, this.pos.y, this.pos.z - 0.4, this.pos.x + 0.4, this.pos.y + h, this.pos.z + 0.4]; }
  setStatus(s) { if (s !== this.status) { this.status = s; this.drawTag(); } }
  setSpeaking(s) { if (s !== this.speaking) { this.speaking = s; this.drawTag(); } }
  attachVideo(video) {
    this.video = video;
    this.removeScreen();
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false, fog: false });
    this.screenMesh = new THREE.Mesh(PLANE, mat);
    this.screenFrame = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ color: 0x111318, side: THREE.DoubleSide, fog: false }));
    this.screenMesh.add(this.screenFrame);
    this.screenFrame.position.z = -0.01;
    this.screenFrame.scale.set(1.04, 1.06, 1);
    this.screenMesh.visible = false;
    this.scene.add(this.screenMesh);
  }
  removeScreen() {
    if (!this.screenMesh) return;
    this.scene.remove(this.screenMesh);
    this.screenMesh.material.map.dispose(); this.screenMesh.material.dispose(); this.screenFrame.material.dispose();
    this.screenMesh = null;
  }
  update(dt, camera) {
    const k = 1 - Math.exp(-dt * 12);
    const px = this.lastX ?? this.pos.x, pz = this.lastZ ?? this.pos.z;
    this.pos.lerp(this.target, k);
    this.lastX = this.pos.x; this.lastZ = this.pos.z;
    this.yaw += wrap(this.tYaw - this.yaw) * k;
    this.pitch += (this.tPitch - this.pitch) * k;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    this.head.rotation.x = this.pitch * 0.8;
    const speed = Math.hypot(this.pos.x - px, this.pos.z - pz) / Math.max(dt, 1e-3);
    this.walk += dt * Math.min(speed, 8) * 2.4;
    const amp = Math.min(1, speed / 3) * 0.7;
    const sw = Math.sin(this.walk) * amp;
    this.legs[0].rotation.x = sw; this.legs[1].rotation.x = -sw;
    this.arms[0].rotation.x = -sw; this.arms[1].rotation.x = sw;
    if (this.sit) { // sentado: pernas para frente, braços no colo
      this.legs[0].rotation.x = this.legs[1].rotation.x = Math.PI / 2;
      this.arms[0].rotation.x = this.arms[1].rotation.x = 0.5;
    }
    // soco: braço direito vai para frente e volta
    const now = performance.now();
    if (this.swingAt && now - this.swingAt < 300) this.arms[1].rotation.x = Math.sin((now - this.swingAt) / 300 * Math.PI) * 1.6;
    // levou um golpe: fica avermelhado por um instante
    const hurt = this.hurtAt && now - this.hurtAt < 300;
    if (hurt !== this.wasHurt) {
      this.wasHurt = hurt;
      for (const m of this.allMats()) if (m.emissive) m.emissive.setHex(hurt ? 0x990000 : 0x000000);
    }
    // laser: braço direito aponta para o alvo
    if (this.laserTarget && performance.now() - this.laserAt > 1500) this.laserTarget = null;
    if (this.laserTarget) {
      this.arms[1].rotation.x = Math.PI / 2 + this.pitch;
      this.group.updateMatrixWorld(true);
      this.arms[1].localToWorld(this.hand.set(0, -0.62, 0));
      this.laser.set(this.hand, this.laserTarget);
    } else this.laser.set(null, null);
    if (this.screenMesh) this.screenMesh.visible = this.screen && this.float;
    if (this.screenMesh && this.screen && this.float) {
      const v = this.video;
      const aspect = v && v.videoWidth ? v.videoWidth / v.videoHeight : 16 / 9;
      const w = 4.2, h = w / aspect;
      this.screenMesh.scale.set(w, h, 1);
      this.screenMesh.position.set(this.pos.x, this.pos.y + 2.75 + h / 2, this.pos.z);
      this.screenMesh.rotation.y = Math.atan2(camera.position.x - this.pos.x, camera.position.z - this.pos.z);
    }
  }
  dispose() {
    this.scene.remove(this.group);
    this.removeScreen();
    this.laser.dispose();
    this.mats.forEach(m => m.dispose());
    this.tag.material.dispose(); this.tagTex.dispose();
  }
}
