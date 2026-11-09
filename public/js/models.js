// Modelos 3D: importação (OBJ/MTL, FBX, GLB/GLTF, STL), ajuste ao tamanho em blocos,
// conversão para GLB, envio ao servidor, e os objetos colocados no mundo.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { decorMeta, buildDecor, buildPicture, buildDoor, buildKanbanBoard, buildTv } from './decor.js';

const MODEL_EXT = /\.(glb|gltf|fbx|obj|stl)$/i;

// files: FileList com o modelo e (opcionalmente) .mtl, texturas, .bin
// size: [largura X, altura Y ou null = automática, profundidade Z] em blocos
export async function buildModelGLB(files, size, onStatus = () => {}) {
  const list = [...files];
  const main = list.find(f => MODEL_EXT.test(f.name));
  if (!main) throw new Error('Escolha um arquivo .obj, .fbx, .glb, .gltf ou .stl');
  const urls = new Map(list.map(f => [f.name.toLowerCase(), URL.createObjectURL(f)]));
  let pending = 0, done = 0;
  const manager = new THREE.LoadingManager();
  manager.onStart = (u, l, t) => { done = l; pending = t; };
  manager.onProgress = (u, l, t) => { done = l; pending = t; };
  manager.setURLModifier(url => {
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    const base = decodeURIComponent(url.split(/[\\/]/).pop().split('?')[0]).toLowerCase();
    return urls.get(base) || url;
  });
  const ext = main.name.split('.').pop().toLowerCase();
  const mainUrl = urls.get(main.name.toLowerCase());
  onStatus('Lendo o modelo…');
  let obj;
  if (ext === 'glb' || ext === 'gltf') obj = (await new GLTFLoader(manager).loadAsync(mainUrl)).scene;
  else if (ext === 'fbx') { const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js'); obj = await new FBXLoader(manager).loadAsync(mainUrl); }
  else if (ext === 'obj') {
    const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');
    const loader = new OBJLoader(manager);
    const mtl = list.find(f => /\.mtl$/i.test(f.name));
    if (mtl) {
      const { MTLLoader } = await import('three/addons/loaders/MTLLoader.js');
      const mats = await new MTLLoader(manager).loadAsync(urls.get(mtl.name.toLowerCase()));
      mats.preload(); loader.setMaterials(mats);
    }
    obj = await loader.loadAsync(mainUrl);
  } else if (ext === 'stl') {
    const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
    const geo = await new STLLoader(manager).loadAsync(mainUrl);
    geo.computeVertexNormals();
    obj = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xb4b8be, roughness: 0.7 }));
  }
  // espera as texturas terminarem de carregar (até 15 s)
  onStatus('Carregando texturas…');
  const t0 = performance.now();
  while (done < pending && performance.now() - t0 < 15000) await new Promise(r => setTimeout(r, 100));

  // materiais sem textura e sem cor viram cinza claro; materiais exóticos viram standard
  obj.traverse(o => {
    if (!o.isMesh) return;
    const fix = m => {
      if (!m || m.isMeshStandardMaterial || m.isMeshBasicMaterial) return m;
      const s = new THREE.MeshStandardMaterial({ color: m.color || 0xcccccc, map: m.map || null, transparent: !!m.transparent, opacity: m.opacity ?? 1, side: m.side ?? THREE.FrontSide, roughness: 0.75, metalness: 0 });
      if (m.normalMap) s.normalMap = m.normalMap;
      if (s.map) s.map.colorSpace = THREE.SRGBColorSpace;
      return s;
    };
    o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
  });

  // ajusta ao tamanho pedido: pegada X×Z exata, base no chão, centrado
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) throw new Error('O modelo está vazio');
  const sz = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  const eps = v => Math.max(v, 1e-6);
  const [W, Hreq, D] = size;
  const sx = W / eps(sz.x), sz_ = D / eps(sz.z);
  const sy = Hreq ? Hreq / eps(sz.y) : (sx + sz_) / 2;
  const inner = new THREE.Group();
  inner.add(obj);
  inner.scale.set(sx, sy, sz_);
  inner.position.set(-ctr.x * sx, -box.min.y * sy, -ctr.z * sz_);
  const holder = new THREE.Group();
  holder.add(inner);
  const finalH = Math.max(0.05, sz.y * sy);

  onStatus('Convertendo…');
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const glb = await new GLTFExporter().parseAsync(holder, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
  setTimeout(() => urls.forEach(u => URL.revokeObjectURL(u)), 5000);
  return { glb, size: [W, Math.round(finalH * 100) / 100, D] };
}

export async function uploadModel(glb, name, size, by) {
  const q = new URLSearchParams({ name, w: size[0], h: size[1], d: size[2], by });
  const r = await fetch('/api/models?' + q, { method: 'POST', body: glb, headers: { 'Content-Type': 'model/gltf-binary' } });
  if (!r.ok) throw new Error(await r.text() || ('erro ' + r.status));
  return r.json();
}

// pegada em células (arredondada), girada de 90 em 90 graus
export function footprint(meta, rot) {
  const w = Math.max(1, Math.round(meta.size[0])), d = Math.max(1, Math.round(meta.size[2]));
  return rot % 2 ? [d, w] : [w, d];
}
// a célula clicada fica no centro da pegada (tamanhos pares crescem para +X/+Z)
export function placement(meta, cell, rot) {
  const [fw, fd] = footprint(meta, rot);
  const x0 = cell.x - Math.floor((fw - 1) / 2), z0 = cell.z - Math.floor((fd - 1) / 2);
  return { x0, z0, fw, fd, fh: Math.max(1, Math.ceil(meta.size[1] - 0.01)), cx: x0 + fw / 2, cz: z0 + fd / 2, y: cell.y };
}

export class Models {
  constructor(scene) {
    this.scene = scene;
    this.lib = new Map();      // id do modelo -> { meta, promise, src }
    this.objects = new Map();  // id do objeto -> { data, group }
    this.group = new THREE.Group();
    scene.add(this.group);
    this.loader = new GLTFLoader();
    this.ray = new THREE.Raycaster();
    this.ghostCache = new Map();
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    edges.translate(0, 0.5, 0);
    this.ghostBox = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x66ccff }));
    this.ghostBox.visible = false;
    scene.add(this.ghostBox);
    this.ghost = null;
    // decorações embutidas são desenhadas em lotes por região (16x16): poucos desenhos por quadro.
    // Cada objeto mantém uma cópia invisível só para a mira (o raycast não depende de visibilidade).
    this.batchGroup = new THREE.Group(); scene.add(this.batchGroup);
    this.batches = new Map(); this.dirtyRegions = new Set(); this.flushPending = false;
    this.doors = new Set();
    // cópias de mira das decorações em lote ficam FORA da cena: o motor não percorre mais
    // ~1000 objetos invisíveis a cada quadro (o raycast funciona igual com a matriz calculada uma vez)
    this.pickRoot = new THREE.Group();
    // LOD: objetos pequenos (caneca, teclado, lata…) vão para malhas separadas por região,
    // que somem a partir de LOD_SMALL blocos de distância (lá eles teriam 1–2 pixels)
    this.lodSmall = 40;
  }
  // tamanho real (maior dimensão em blocos) da decoração, calculado uma vez por modelo
  maxDim(id) {
    const e = this.entry(id);
    if (e.maxDim === undefined) {
      const box = new THREE.Box3().setFromObject(e.src || new THREE.Group());
      const s = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
      e.maxDim = Math.max(s.x, s.y, s.z);
    }
    return e.maxDim;
  }
  // caixa real do modelo (sem rotação; base em y=0, centrado na pegada). null se ainda não carregou.
  bounds(id) {
    const e = this.entry(id);
    if (!e) return null;
    if (e.meta.builtin && !e.src) this.load(id);
    if (!e.src) return null;
    if (!e.bounds) { const b = new THREE.Box3().setFromObject(e.src); e.bounds = b.isEmpty() ? null : b; }
    return e.bounds;
  }
  // chamado algumas vezes por segundo: liga/desliga as malhas de objetos pequenos pela distância
  updateLod(camPos) {
    const lim = this.lodSmall;
    for (const meshes of this.batches.values()) for (const m of meshes) {
      if (!m.userData.small) continue;
      const s = m.geometry.boundingSphere;
      m.visible = camPos.distanceTo(s.center) - s.radius < lim;
    }
  }
  regionKey(g) { return Math.floor(g.position.x / 16) + ',' + Math.floor(g.position.z / 16); }
  markDirty(e) {
    this.dirtyRegions.add(e.region);
    if (!this.flushPending) { this.flushPending = true; setTimeout(() => { this.flushPending = false; this.flushBatches(); }, 0); }
  }
  flushBatches() { for (const k of this.dirtyRegions) this.rebuildRegion(k); this.dirtyRegions.clear(); }
  rebuildRegion(key) {
    const old = this.batches.get(key);
    if (old) for (const m of old) { this.batchGroup.remove(m); m.geometry.dispose(); }
    this.batches.delete(key);
    const byMat = new Map(); // material + pequeno? -> { mat, small, pos, nor, col, idx }
    const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
    for (const e of this.objects.values()) {
      if (!e.batch || e.region !== key) continue;
      const src = this.entry(e.data.model).src;
      if (!src) continue;
      e.group.updateMatrix();
      nm.getNormalMatrix(e.group.matrix);
      const small = this.maxDim(e.data.model) <= 0.55;
      for (const mesh of src.children) {
        const g = mesh.geometry;
        const mk = mesh.material.uuid + (small ? ':p' : ':g');
        let acc = byMat.get(mk);
        if (!acc) byMat.set(mk, (acc = { mat: mesh.material, small, pos: [], nor: [], col: [], idx: [] }));
        const base = acc.pos.length / 3, P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(e.group.matrix); acc.pos.push(v.x, v.y, v.z);
          n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); acc.nor.push(n.x, n.y, n.z);
          acc.col.push(C.getX(i), C.getY(i), C.getZ(i));
        }
        const I = g.index.array;
        for (let i = 0; i < I.length; i++) acc.idx.push(base + I[i]);
      }
    }
    const meshes = [];
    for (const a of byMat.values()) {
      const mat = a.mat;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(a.nor, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(a.col, 3));
      geo.setIndex(a.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(a.idx, 1) : new THREE.Uint16BufferAttribute(a.idx, 1));
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false;
      m.userData.small = a.small;
      this.batchGroup.add(m); meshes.push(m);
    }
    if (meshes.length) this.batches.set(key, meshes);
  }
  addModel(meta) { if (!this.lib.has(meta.id)) this.lib.set(meta.id, { meta }); }
  entry(id) {
    let e = this.lib.get(id);
    if (!e && id && id.startsWith('d:')) { const m = decorMeta(id); if (m) this.lib.set(id, (e = { meta: m })); }
    return e;
  }
  meta(id) { const e = this.entry(id); return e && e.meta; }
  // meta efetiva de um objeto (o quadro tem tamanho próprio)
  objMeta(o) {
    const m = this.meta(o.model);
    if (m && m.picture) return { ...m, size: [o.w || 2, o.h || 1, 0.125] };
    if (m && m.door) return { ...m, size: [o.w || 2, o.h || 3, 1] };
    if (m && (m.kanban || m.tv || m.lousa)) return { ...m, size: [o.w || m.size[0], o.h || m.size[1], 0.125] };
    return m;
  }
  list() { return [...this.lib.values()].map(e => e.meta).filter(m => !m.builtin); }
  removeModel(id) {
    for (const [oid, o] of this.objects) if (o.data.model === id) this.removeObject(oid);
    this.lib.delete(id);
    const g = this.ghostCache.get(id);
    if (g) { if (this.ghost === g) this.ghost = null; this.scene.remove(g); this.ghostCache.delete(id); }
  }
  load(id) {
    const e = this.entry(id);
    if (!e) return Promise.reject(new Error('modelo não existe'));
    if (e.meta.builtin) return (e.promise ||= Promise.resolve(e.src = e.meta.picture ? buildPicture(2, 1, null) : e.meta.door ? buildDoor(2, 3) : e.meta.kanban || e.meta.lousa ? buildKanbanBoard(e.meta.size[0], e.meta.size[1]) : e.meta.tv ? buildTv(e.meta.size[0], e.meta.size[1]) : buildDecor(id)));
    return (e.promise ||= this.loader.loadAsync('/models/' + id + '.glb').then(g => (e.src = g.scene)));
  }
  updateObject(o) { this.removeObject(o.id); this.addObject(o); }
  addObject(o) {
    const meta = this.objMeta(o);
    if (!meta || this.objects.has(o.id)) return;
    const g = new THREE.Group();
    if (o.free) g.position.set(o.x, o.y, o.z); // posição livre: x/z já é o centro
    else { const pl = placement(meta, o, o.rot); g.position.set(pl.cx, o.y, pl.cz); }
    g.rotation.y = o.rot * Math.PI / 2;
    g.userData.objId = o.id;
    // objetos não se movem depois de colocados: matriz calculada uma vez (o motor não recalcula a cada quadro)
    g.updateMatrix(); g.matrixAutoUpdate = false;
    const batched = meta.builtin && !meta.kanban && !meta.picture && !meta.door && !meta.tv && !meta.lousa;
    (batched ? this.pickRoot : this.group).add(g);
    this.objects.set(o.id, { data: o, group: g, meta });
    if (meta.picture) { g.add(buildPicture(meta.size[0], meta.size[1], o.url)); return; }
    if (meta.door) { const d = buildDoor(meta.size[0], meta.size[1]); g.add(d); const e = this.objects.get(o.id); e.door = d.userData.door; this.doors.add(e); return; }
    if (meta.tv) { g.add(buildTv(meta.size[0], meta.size[1])); if (this.onTv) this.onTv(o.id); return; }
    if (meta.lousa) {
      // quadro branco: moldura de alumínio + canvas onde os traços são desenhados (main.js)
      const k = buildKanbanBoard(meta.size[0], meta.size[1], 0xb8bec6); g.add(k);
      const e = this.objects.get(o.id); e.lousa = { ...k.userData.kanban, strokes: new Map() };
      if (this.onLousa) this.onLousa(e);
      return;
    }
    if (meta.builtin && !meta.kanban) {
      // decoração embutida: entra no lote da região; a cópia no grupo fica invisível (só para a mira)
      this.load(o.model);
      const src = this.entry(o.model).src;
      const c = src.clone(true); c.visible = false; g.add(c);
      g.updateMatrixWorld(true); // fora da cena: matriz do mundo calculada aqui, uma vez
      const e = this.objects.get(o.id); e.batch = true; e.region = this.regionKey(g);
      this.markDirty(e);
      return;
    }
    if (meta.kanban) {
      const k = buildKanbanBoard(meta.size[0], meta.size[1]); g.add(k);
      const e = this.objects.get(o.id); e.kanban = { ...k.userData.kanban, mode: meta.kanban, source: o.source || 'time', cols: Array.isArray(o.cols) ? o.cols : null };
      if (this.onKanban) this.onKanban(e);
      return;
    }
    this.load(o.model).then(src => {
      if (!this.objects.has(o.id)) return;
      const c = src.clone(true);
      g.add(c);
    }).catch(err => console.warn('modelo', err));
  }
  removeObject(id) {
    const e = this.objects.get(id);
    if (!e) return;
    if (e.group.parent) e.group.parent.remove(e.group);
    this.objects.delete(id);
    this.doors.delete(e);
    if (e.batch) this.markDirty(e);
  }
  // raio contra os objetos: { id, distance, point } — só testa os objetos ao alcance
  raycast(origin, dir, far) {
    this.ray.set(origin, dir); this.ray.far = far;
    const near = [], lim = (far + 6) * (far + 6);
    for (const e of this.objects.values()) {
      const p = e.group.position, dx = p.x - origin.x, dz = p.z - origin.z;
      if (dx * dx + dz * dz <= lim) near.push(e.group);
    }
    if (!near.length) return null;
    let hit;
    try { hit = this.ray.intersectObjects(near, true)[0]; } catch (e) { console.warn('raycast', e); return null; } // nunca derruba os cliques
    if (!hit) return null;
    let o = hit.object;
    while (o && !o.userData.objId) o = o.parent;
    const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
    return o ? { id: o.userData.objId, distance: hit.distance, point: hit.point, normal } : null;
  }
  // ponto de sentar de um objeto (em coordenadas do mundo) e direção para onde olha
  seat(id) {
    const e = this.objects.get(id);
    if (!e || !e.meta.sit) return null;
    const p = e.group.localToWorld(new THREE.Vector3(0, e.meta.sit, 0.05));
    return { p, yaw: e.data.rot * Math.PI / 2 + Math.PI };
  }
  // prévia translúcida de onde o objeto vai ficar
  // free: { box: [minX, minY, minZ, maxX, maxY, maxZ] } já girada e no lugar → prévia na posição exata
  showGhost(modelId, cell, rot, valid, metaOverride, free) {
    const meta = metaOverride || this.meta(modelId);
    if (!meta || !cell) { this.hideGhost(); return; }
    let g = this.ghostCache.get(modelId);
    if (!g) {
      g = new THREE.Group();
      this.ghostCache.set(modelId, g);
      this.scene.add(g);
      this.load(modelId).then(src => {
        const c = src.clone(true);
        const mat = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.35, depthWrite: false });
        c.traverse(m => { if (m.isMesh) m.material = mat; });
        g.add(c); g.userData.mat = mat;
      }).catch(() => {});
    }
    if (this.ghost && this.ghost !== g) this.ghost.visible = false;
    this.ghost = g;
    g.visible = true;
    g.rotation.y = rot * Math.PI / 2;
    const color = valid ? 0x66ccff : 0xff5555;
    if (g.userData.mat) g.userData.mat.color.setHex(color);
    this.ghostBox.material.color.setHex(color);
    this.ghostBox.visible = true;
    if (free) {
      const b = free.box;
      g.position.set(cell.x, cell.y, cell.z);
      this.ghostBox.position.set((b[0] + b[3]) / 2, b[1], (b[2] + b[5]) / 2);
      this.ghostBox.scale.set(b[3] - b[0] + 0.01, Math.max(b[4] - b[1], 0.03) + 0.01, b[5] - b[2] + 0.01);
      return;
    }
    const pl = placement(meta, cell, rot);
    g.position.set(pl.cx, cell.y, pl.cz);
    this.ghostBox.position.set(pl.cx, cell.y, pl.cz);
    this.ghostBox.scale.set(pl.fw + 0.01, Math.max(meta.size[1], 0.05) + 0.01, pl.fd + 0.01);
  }
  hideGhost() { if (this.ghost) this.ghost.visible = false; this.ghostBox.visible = false; }
}
