// Salas: caixas no mundo que isolam a voz (quem está dentro só ouve quem está dentro)
// e podem ser trancadas por quem está dentro (aí ninguém de fora entra).
import * as THREE from 'three';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const EDGES = new THREE.EdgesGeometry(BOX);

export class Rooms {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.group = new THREE.Group(); scene.add(this.group);
    this.lockGroup = new THREE.Group(); scene.add(this.lockGroup);
    this.showOutlines = false;
    this.lockMat = new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
    this.marker = new THREE.LineSegments(EDGES, new THREE.LineBasicMaterial({ color: 0xffd54f }));
    this.marker.visible = false; scene.add(this.marker);
  }
  set(list) { this.list = list.slice(); this.rebuild(); }
  add(r) { this.list = this.list.filter(x => x.id !== r.id); this.list.push(r); this.rebuild(); }
  update(r) { this.add(r); }
  remove(id) { this.list = this.list.filter(x => x.id !== id); this.rebuild(); }
  get(id) { return this.list.find(r => r.id === id); }
  containsCell(r, x, y, z) { return x >= r.min[0] && x <= r.max[0] && y >= r.min[1] && y <= r.max[1] && z >= r.min[2] && z <= r.max[2]; }
  // sala (a menor, se houver sobreposição) onde está um jogador (posição dos pés)
  at(p) {
    const x = Math.floor(p.x), y = Math.floor(p.y + 1), z = Math.floor(p.z);
    let best = null, bestV = Infinity;
    for (const r of this.list) {
      if (!this.containsCell(r, x, y, z)) continue;
      const v = (r.max[0] - r.min[0] + 1) * (r.max[1] - r.min[1] + 1) * (r.max[2] - r.min[2] + 1);
      if (v < bestV) { best = r; bestV = v; }
    }
    return best;
  }
  atCell(x, y, z) { return this.list.find(r => this.containsCell(r, x, y, z)) || null; }
  // salas trancadas que a caixa do jogador NÃO toca (essas viram parede para ele)
  blockingFor(aabbMin, aabbMax) {
    return this.list.filter(r => r.locked && !(aabbMax.x > r.min[0] && aabbMin.x < r.max[0] + 1 && aabbMax.y > r.min[1] && aabbMin.y < r.max[1] + 1 && aabbMax.z > r.min[2] && aabbMin.z < r.max[2] + 1));
  }
  rebuild() {
    this.group.clear(); this.lockGroup.clear();
    for (const r of this.list) {
      const s = [r.max[0] - r.min[0] + 1, r.max[1] - r.min[1] + 1, r.max[2] - r.min[2] + 1];
      const c = [r.min[0] + s[0] / 2, r.min[1] + s[1] / 2, r.min[2] + s[2] / 2];
      const l = new THREE.LineSegments(EDGES, new THREE.LineBasicMaterial({ color: r.locked ? 0xff5555 : 0x55ff99 }));
      l.scale.set(s[0] + 0.02, s[1] + 0.02, s[2] + 0.02); l.position.set(...c);
      this.group.add(l);
      if (r.locked) { const m = new THREE.Mesh(BOX, this.lockMat); m.scale.set(s[0] + 0.04, s[1] + 0.04, s[2] + 0.04); m.position.set(...c); this.lockGroup.add(m); }
    }
    this.group.visible = this.showOutlines;
  }
  setOutlines(v) { if (v !== this.showOutlines) { this.showOutlines = v; this.group.visible = v; } }
  // mostra a caixa trancada só para quem está fora dela
  updateLockVisibility(myRoom) {
    let i = 0;
    for (const r of this.list) if (r.locked) { const m = this.lockGroup.children[i++]; if (m) m.visible = !myRoom || myRoom.id !== r.id; }
  }
  // prévia enquanto marca a sala: { min, max } em células
  showBox(box) {
    if (!box) { this.marker.visible = false; return; }
    const { min, max } = box;
    this.marker.visible = true;
    this.marker.scale.set(max[0] - min[0] + 1.02, max[1] - min[1] + 1.02, max[2] - min[2] + 1.02);
    this.marker.position.set((min[0] + max[0] + 1) / 2, (min[1] + max[1] + 1) / 2, (min[2] + max[2] + 1) / 2);
  }
}
