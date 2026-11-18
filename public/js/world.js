// Dados do mundo, geração de malha por chunk (com oclusão de ambiente) e raycast
import * as THREE from 'three';
import { faceTiles, isOpaque, isEmissive, TILE_COUNT, TV_TILE, TV_ID } from './blocks.js';

export const CH = 16;

// ordem: esq(-x), dir(+x), baixo(-y), cima(+y), trás(-z), frente(+z)
const FACES = [
  { dir: [-1, 0, 0], c: [[0, 1, 0], [0, 0, 0], [0, 1, 1], [0, 0, 1]], uv: [[0, 1], [0, 0], [1, 1], [1, 0]], shade: 0.78 },
  { dir: [1, 0, 0], c: [[1, 1, 1], [1, 0, 1], [1, 1, 0], [1, 0, 0]], uv: [[0, 1], [0, 0], [1, 1], [1, 0]], shade: 0.78 },
  { dir: [0, -1, 0], c: [[1, 0, 1], [0, 0, 1], [1, 0, 0], [0, 0, 0]], uv: [[1, 0], [0, 0], [1, 1], [0, 1]], shade: 0.45 },
  { dir: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]], uv: [[1, 1], [0, 1], [1, 0], [0, 0]], shade: 1.0 },
  { dir: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [1, 1, 0], [0, 1, 0]], uv: [[0, 0], [1, 0], [0, 1], [1, 1]], shade: 0.62 },
  { dir: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]], uv: [[0, 0], [1, 0], [0, 1], [1, 1]], shade: 0.62 },
];
const AO = [0.38, 0.58, 0.78, 1.0];
// direções u (direita da textura) e v (cima da textura) de cada face, para emendar blocos Tela
for (const F of FACES) {
  const at = (u, v) => F.c[F.uv.findIndex(p => p[0] === u && p[1] === v)];
  const o = at(0, 0), r = at(1, 0), t = at(0, 1);
  F.u = [r[0] - o[0], r[1] - o[1], r[2] - o[2]];
  F.v = [t[0] - o[0], t[1] - o[1], t[2] - o[2]];
}
const TV_TILES = Array.from({ length: 16 }, (_, m) => TV_TILE(m));
const OPAQUE = new Uint8Array(256);
for (let b = 0; b < 256; b++) OPAQUE[b] = isOpaque(b) ? 1 : 0;
// blocos de neon brilham: sem sombra por face nem oclusão de ambiente
const EMISSIVE = new Uint8Array(256);
for (let b = 0; b < 256; b++) EMISSIVE[b] = isEmissive(b) ? 1 : 0;

export class World {
  constructor(W, H, D, data, scene, material) {
    this.W = W; this.H = H; this.D = D; this.data = data;
    this.scene = scene; this.material = material;
    this.cw = W / CH; this.cd = D / CH;
    this.meshes = new Map();
    this.dirty = new Set();
    this.queue = [];
  }
  inBounds(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.W && y < this.H && z < this.D; }
  get(x, y, z) {
    if (y < 0) return 3;
    if (x < 0 || z < 0 || x >= this.W || z >= this.D || y >= this.H) return 0;
    return this.data[x + this.W * (z + this.D * y)];
  }
  set(x, y, z, b) {
    if (!this.inBounds(x, y, z)) return;
    this.data[x + this.W * (z + this.D * y)] = b;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    this.dirty.add(cx + ',' + cz);
    const lx = x - cx * CH, lz = z - cz * CH;
    if (lx === 0 && cx > 0) this.dirty.add((cx - 1) + ',' + cz);
    if (lx === CH - 1 && cx < this.cw - 1) this.dirty.add((cx + 1) + ',' + cz);
    if (lz === 0 && cz > 0) this.dirty.add(cx + ',' + (cz - 1));
    if (lz === CH - 1 && cz < this.cd - 1) this.dirty.add(cx + ',' + (cz + 1));
  }
  queueAll(center) {
    const list = [];
    for (let cz = 0; cz < this.cd; cz++) for (let cx = 0; cx < this.cw; cx++) {
      const d = Math.hypot((cx + 0.5) * CH - center.x, (cz + 0.5) * CH - center.z);
      list.push([d, cx, cz]);
    }
    list.sort((a, b) => a[0] - b[0]);
    this.queue = list.map(v => [v[1], v[2]]);
    this.total = this.queue.length;
  }
  get progress() { return this.total ? 1 - this.queue.length / this.total : 1; }
  update(budgetMs) {
    for (const key of this.dirty) { const [cx, cz] = key.split(',').map(Number); this.buildChunk(cx, cz); }
    this.dirty.clear();
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) { const [cx, cz] = this.queue.shift(); this.buildChunk(cx, cz); }
  }
  buildChunk(cx, cz) {
    const pos = [], uv = [], col = [], ind = [];
    const x0 = cx * CH, z0 = cz * CH, N = TILE_COUNT;
    // consulta rápida de "bloco opaco" (tabela + índice direto): é chamada milhares de vezes por chunk
    const data = this.data, W = this.W, D = this.D, H = this.H, WD = W * D;
    const occ = (x, y, z) => (y < 0 ? 1 : (x < 0 || z < 0 || x >= W || z >= D || y >= H) ? 0 : OPAQUE[data[x + W * z + WD * y]]);
    // pula camadas vazias de cima
    let topY = 0;
    for (let y = this.H - 1; y >= 0 && !topY; y--) for (let z = z0; z < z0 + CH && !topY; z++) for (let x = x0; x < x0 + CH; x++) if (this.data[x + this.W * (z + this.D * y)]) { topY = y; break; }
    for (let y = 0; y <= topY; y++) for (let z = z0; z < z0 + CH; z++) for (let x = x0; x < x0 + CH; x++) {
      const b = this.data[x + this.W * (z + this.D * y)];
      if (!b) continue;
      const tiles = faceTiles[b];
      if (!tiles) continue;
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        const nx = x + F.dir[0], ny = y + F.dir[1], nz = z + F.dir[2];
        const nb = this.get(nx, ny, nz);
        if (nb && (OPAQUE[nb] || nb === b)) continue;
        let tile = tiles[f];
        if (b === TV_ID) {
          // TV: borda só onde o vizinho no mesmo plano não é Tela
          const u = F.u, v = F.v, g = (d, s) => this.get(x + d[0] * s, y + d[1] * s, z + d[2] * s) === TV_ID;
          tile = TV_TILES[(g(v, 1) ? 0 : 1) | (g(u, 1) ? 0 : 2) | (g(v, -1) ? 0 : 4) | (g(u, -1) ? 0 : 8)];
        }
        const n = pos.length / 3;
        const axis = F.dir[0] ? 0 : F.dir[1] ? 1 : 2;
        const ua = (axis + 1) % 3, va = (axis + 2) % 3;
        const ao = [0, 0, 0, 0];
        for (let i = 0; i < 4; i++) {
          const c = F.c[i];
          pos.push(x + c[0], y + c[1], z + c[2]);
          uv.push((tile + 0.002 + F.uv[i][0] * 0.996) / N, 0.002 + F.uv[i][1] * 0.996);
          const su = c[ua] * 2 - 1, sv = c[va] * 2 - 1;
          const ux = ua === 0 ? su : 0, uy = ua === 1 ? su : 0, uz = ua === 2 ? su : 0;
          const vx = va === 0 ? sv : 0, vy = va === 1 ? sv : 0, vz = va === 2 ? sv : 0;
          const s1 = occ(nx + ux, ny + uy, nz + uz), s2 = occ(nx + vx, ny + vy, nz + vz), s3 = occ(nx + ux + vx, ny + uy + vy, nz + uz + vz);
          const a = s1 && s2 ? 0 : 3 - (s1 + s2 + s3);
          ao[i] = a;
          const l = EMISSIVE[b] ? 1 : F.shade * AO[a];
          col.push(l, l, l);
        }
        if (ao[0] + ao[3] > ao[1] + ao[2]) ind.push(n, n + 1, n + 3, n, n + 3, n + 2);
        else ind.push(n, n + 1, n + 2, n + 2, n + 1, n + 3);
      }
    }
    const key = cx + ',' + cz;
    const old = this.meshes.get(key);
    if (old) { this.scene.remove(old); old.geometry.dispose(); this.meshes.delete(key); }
    if (!ind.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(ind, 1) : new THREE.Uint16BufferAttribute(ind, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.material);
    m.matrixAutoUpdate = false;
    this.scene.add(m);
    this.meshes.set(key, m);
  }
  // DDA: retorna o bloco atingido e a normal da face
  raycast(o, d, maxDist) {
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
    const tdx = sx ? Math.abs(1 / d.x) : Infinity, tdy = sy ? Math.abs(1 / d.y) : Infinity, tdz = sz ? Math.abs(1 / d.z) : Infinity;
    let tmx = sx > 0 ? (x + 1 - o.x) * tdx : sx < 0 ? (o.x - x) * tdx : Infinity;
    let tmy = sy > 0 ? (y + 1 - o.y) * tdy : sy < 0 ? (o.y - y) * tdy : Infinity;
    let tmz = sz > 0 ? (z + 1 - o.z) * tdz : sz < 0 ? (o.z - z) * tdz : Infinity;
    let n = [0, 0, 0], t = 0;
    while (t <= maxDist) {
      if (this.inBounds(x, y, z)) { const b = this.get(x, y, z); if (b) return { x, y, z, n, b, t }; }
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; n = [-sx, 0, 0]; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; n = [0, -sy, 0]; }
      else { z += sz; t = tmz; tmz += tdz; n = [0, 0, -sz]; }
    }
    return null;
  }
}
