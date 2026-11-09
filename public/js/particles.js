// Partículas de bloco quebrado: pedacinhos com as cores da textura, com gravidade e quique
import * as THREE from 'three';
import { faceTiles, T } from './blocks.js';

const MAX = 900;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export class Particles {
  constructor(scene, atlas) {
    this.atlas = atlas; this.cache = new Map(); this.list = [];
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }
  colors(tile) {
    let c = this.cache.get(tile);
    if (c) return c;
    const d = this.atlas.getContext('2d').getImageData(tile * T, 0, T, T).data;
    c = [];
    for (let i = 0; i < d.length; i += 4 * 3) if (d[i + 3] > 128) c.push(new THREE.Color().setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace));
    if (!c.length) c.push(new THREE.Color(0xdddddd));
    this.cache.set(tile, c);
    return c;
  }
  burst(x, y, z, id) {
    const ft = faceTiles[id];
    if (!ft) return;
    const cols = this.colors(ft[0]).concat(this.colors(ft[3]));
    for (let i = 0; i < 18; i++) {
      const R = Math.random;
      this.list.push({
        x: x + 0.15 + R() * 0.7, y: y + 0.15 + R() * 0.7, z: z + 0.15 + R() * 0.7,
        vx: (R() - 0.5) * 4.5, vy: 1.5 + R() * 4, vz: (R() - 0.5) * 4.5,
        t: 0, life: 0.6 + R() * 0.7, s: 0.07 + R() * 0.09,
        c: cols[(R() * cols.length) | 0].clone().multiplyScalar(0.75 + R() * 0.25),
        rx: R() * 6, ry: R() * 6, spin: (R() - 0.5) * 10,
      });
    }
    if (this.list.length > MAX) this.list.splice(0, this.list.length - MAX);
  }
  update(dt, solid) {
    const L = this.list;
    let w = 0, n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.t += dt;
      if (p.t >= p.life) continue;
      p.vy -= 22 * dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (solid(Math.floor(nx), Math.floor(p.y), Math.floor(p.z))) p.vx *= -0.3; else p.x = nx;
      if (solid(Math.floor(p.x), Math.floor(p.y), Math.floor(nz))) p.vz *= -0.3; else p.z = nz;
      if (solid(Math.floor(p.x), Math.floor(ny - p.s / 2), Math.floor(p.z))) {
        if (p.vy < 0) { p.vy *= -0.25; p.vx *= 0.6; p.vz *= 0.6; p.spin *= 0.5; } else p.vy = 0;
      } else p.y = ny;
      p.rx += p.spin * dt;
      L[w++] = p;
      const k = 1 - Math.pow(p.t / p.life, 3), s = p.s * k;
      _p.set(p.x, p.y, p.z); _s.set(s, s, s); _q.setFromEuler(_e.set(p.rx, p.ry, 0));
      this.mesh.setMatrixAt(n, _m.compose(_p, _q, _s));
      this.mesh.setColorAt(n, p.c);
      n++;
    }
    L.length = w;
    this.mesh.count = n;
    if (n) { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
  }
}
