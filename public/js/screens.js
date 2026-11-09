// Telas compartilhadas espelhadas em painéis de blocos "Tela".
// O painel é o retângulo de blocos Tela conectados, no mesmo plano da face clicada:
// construa o painel do tamanho que quiser. A resolução do vídeo não muda com o tamanho,
// a imagem só é esticada (mantendo a proporção) na superfície.
import * as THREE from 'three';
import { isOpaque } from './blocks.js';

export const TELA = 29;
const PLANE = new THREE.PlaneGeometry(1, 1);
const MAX_CELLS = 4096;

// A tela também pode ser um objeto "Tela (TV)" de parede: âncora { o: id do objeto }.
const TV_FRONT = -0.5 + 0.08 + 0.012, TV_BORDER = 0.06;
const _v = new THREE.Vector3();

export class Screens {
  constructor(scene, models) { this.scene = scene; this.models = models; this.world = null; this.items = new Map(); }
  setWorld(w) { this.world = w; this.recomputeAll(); }

  // owner: id do jogador ou 'me'; anchor: {x,y,z,n} ou null
  set(owner, anchor, video) {
    if (!anchor || !video) { this.remove(owner); return; }
    let it = this.items.get(owner);
    if (!it || it.video !== video) {
      this.remove(owner);
      const tex = new THREE.VideoTexture(video);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      this.scene.add(mesh);
      it = { owner, video, tex, mesh };
      this.items.set(owner, it);
    }
    it.anchor = anchor;
    it.rect = this.computeRect(anchor);
    it.mesh.visible = !!it.rect;
  }
  remove(owner) {
    const it = this.items.get(owner);
    if (!it) return;
    this.scene.remove(it.mesh); it.tex.dispose(); it.mesh.material.dispose();
    this.items.delete(owner);
  }
  has(owner) { const it = this.items.get(owner); return !!(it && it.rect); }
  recomputeAll() { for (const it of this.items.values()) { it.rect = this.computeRect(it.anchor); it.mesh.visible = !!it.rect; } }

  computeRect(a) {
    if (a && a.o) { const e = this.models && this.models.objects.get(a.o); return e && e.meta.tv ? { obj: a.o } : null; }
    const w = this.world;
    if (!w || !a || w.get(a.x, a.y, a.z) !== TELA) return null;
    const axis = a.n[0] ? 0 : a.n[1] ? 1 : 2;
    const pa = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1]; // [largura, altura]
    const start = [a.x, a.y, a.z];
    const min = start.slice(), max = start.slice();
    const seen = new Set([start.join(',')]);
    const stack = [start];
    let count = 0;
    while (stack.length && count++ < MAX_CELLS) {
      const c = stack.pop();
      for (const ax of pa) for (const d of [-1, 1]) {
        const nb = c.slice(); nb[ax] += d;
        const k = nb.join(',');
        if (seen.has(k)) continue;
        seen.add(k);
        if (w.get(nb[0], nb[1], nb[2]) !== TELA) continue;
        if (isOpaque(w.get(nb[0] + a.n[0], nb[1] + a.n[1], nb[2] + a.n[2]))) continue; // face coberta
        stack.push(nb);
        for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], nb[i]); max[i] = Math.max(max[i], nb[i]); }
      }
    }
    return { axis, n: a.n, pa, min, max };
  }

  // qual tela ocupa esse bloco/face?
  ownerAtObj(id) {
    for (const it of this.items.values()) if (it.rect && it.rect.obj === id) return it.owner;
    return null;
  }
  ownerAt(x, y, z, n) {
    for (const it of this.items.values()) {
      const r = it.rect;
      if (!r || r.obj || r.n[0] !== n[0] || r.n[1] !== n[1] || r.n[2] !== n[2]) continue;
      const p = [x, y, z];
      if (p[r.axis] !== r.min[r.axis]) continue;
      if (r.pa.every(ax => p[ax] >= r.min[ax] && p[ax] <= r.max[ax])) return it.owner;
    }
    return null;
  }

  update() {
    for (const it of this.items.values()) {
      const r = it.rect;
      if (!r) continue;
      if (r.obj) {
        const e = this.models.objects.get(r.obj);
        if (!e) { it.rect = null; it.mesh.visible = false; continue; }
        const W = e.meta.size[0] - 2 * TV_BORDER, H = e.meta.size[1] - 2 * TV_BORDER;
        const v = it.video, asp = v.videoWidth ? v.videoWidth / v.videoHeight : 16 / 9;
        let w = W, h = W / asp;
        if (h > H) { h = H; w = H * asp; }
        e.group.updateMatrixWorld();
        it.mesh.position.copy(e.group.localToWorld(_v.set(0, e.meta.size[1] / 2, TV_FRONT)));
        it.mesh.rotation.set(0, e.group.rotation.y, 0);
        it.mesh.scale.set(w, h, 1);
        continue;
      }
      const [wa, ha] = r.pa;
      const W = r.max[wa] - r.min[wa] + 1, H = r.max[ha] - r.min[ha] + 1;
      const v = it.video;
      const asp = v.videoWidth ? v.videoWidth / v.videoHeight : 16 / 9;
      let w = W, h = W / asp;
      if (h > H) { h = H; w = H * asp; }
      const c = [0, 0, 0];
      c[wa] = (r.min[wa] + r.max[wa] + 1) / 2;
      c[ha] = (r.min[ha] + r.max[ha] + 1) / 2;
      c[r.axis] = r.min[r.axis] + (r.n[r.axis] > 0 ? 1.02 : -0.02);
      const m = it.mesh;
      m.position.set(c[0], c[1], c[2]);
      m.scale.set(w, h, 1);
      const [nx, ny, nz] = r.n;
      m.rotation.set(ny ? -ny * Math.PI / 2 : 0, nx ? nx * Math.PI / 2 : nz < 0 ? Math.PI : 0, 0);
    }
  }
}
