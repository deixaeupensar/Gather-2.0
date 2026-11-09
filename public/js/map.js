// Mapa visto de cima: cor do bloco mais alto de cada coluna, sombreado pela altura,
// com os jogadores por cima. Minimapa no canto e mapa grande segurando Tab.
import { faceTiles, T } from './blocks.js';

export class WorldMap {
  constructor(world, atlas) {
    this.world = world;
    this.cv = document.createElement('canvas');
    this.cv.width = world.W; this.cv.height = world.D;
    this.ctx = this.cv.getContext('2d');
    this.img = this.ctx.createImageData(world.W, world.D);
    // cor média do topo de cada bloco
    const actx = atlas.getContext('2d');
    this.colors = faceTiles.map(ft => {
      if (!ft) return null;
      const d = actx.getImageData(ft[3] * T, 0, T, T).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 100) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      return n ? [r / n, g / n, b / n] : [200, 220, 235];
    });
    for (let z = 0; z < world.D; z++) for (let x = 0; x < world.W; x++) this.column(x, z);
    this.ctx.putImageData(this.img, 0, 0);
    this.dirty = false;
  }
  column(x, z) {
    const w = this.world, i = (x + z * w.W) * 4, im = this.img.data;
    for (let y = w.H - 1; y >= 0; y--) {
      const b = w.get(x, y, z);
      if (!b) continue;
      const c = this.colors[b] || [255, 0, 255];
      // mais alto = mais claro; borda sutil quando o vizinho do norte é mais baixo
      let f = 0.62 + (y / w.H) * 0.75;
      if (z > 0 && w.get(x, y, z - 1) === 0 && w.get(x, y + 1, z - 1) === 0) f *= 1.12;
      im[i] = Math.min(255, c[0] * f); im[i + 1] = Math.min(255, c[1] * f); im[i + 2] = Math.min(255, c[2] * f); im[i + 3] = 255;
      return;
    }
    im[i] = im[i + 1] = im[i + 2] = 20; im[i + 3] = 255;
  }
  updateAt(x, z) {
    this.column(x, z);
    if (z + 1 < this.world.D) this.column(x, z + 1);
    this.dirty = true;
  }
  flush() { if (this.dirty) { this.ctx.putImageData(this.img, 0, 0); this.dirty = false; } }

  // desenha o mapa num canvas. view: { cx, cz, span } em blocos; marks: [{x, z, color, name, yaw, me}]
  draw(canvas, view, marks, labels, roomList = []) {
    this.flush();
    // mapa grande: resolução do canvas = tamanho na tela × densidade de pixels (texto nítido e no tamanho certo)
    if (labels && canvas.clientWidth) {
      const want = Math.round(canvas.clientWidth * (window.devicePixelRatio || 1));
      if (want > 0 && Math.abs(canvas.width - want) > 2) { canvas.width = want; canvas.height = want; }
    }
    const ctx = canvas.getContext('2d'), S = canvas.width;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, S, S);
    const k = S / view.span, x0 = view.cx - view.span / 2, z0 = view.cz - view.span / 2;
    ctx.drawImage(this.cv, x0, z0, view.span, view.span, 0, 0, S, S);
    for (const r of roomList) {
      const rx = (r.min[0] - x0) * k, rz = (r.min[2] - z0) * k, rw = (r.max[0] - r.min[0] + 1) * k, rh = (r.max[2] - r.min[2] + 1) * k;
      // salas com dono: contorno dourado; trancadas: vermelho
      ctx.fillStyle = r.locked ? 'rgba(255,80,80,0.15)' : r.owner ? 'rgba(255,200,60,0.12)' : 'rgba(80,255,150,0.07)'; ctx.fillRect(rx, rz, rw, rh);
      ctx.lineWidth = (r.owner ? 2 : 1.5) * (labels ? S / (canvas.clientWidth || S) : 1); ctx.strokeStyle = r.locked ? 'rgba(255,90,90,0.9)' : r.owner ? 'rgba(255,205,70,0.95)' : 'rgba(90,255,160,0.6)'; ctx.strokeRect(rx, rz, rw, rh);
      if (labels) {
        // tamanho do texto acompanha o zoom (em px de tela), entre 12 e 26; etiqueta com fundo escuro
        // no centro da sala. Se nem o menor tamanho couber na sala, não desenha (evita amontoar).
        const px = S / (canvas.clientWidth || S); // px do canvas por px de tela
        const blockCss = k / px;                  // px de tela por bloco
        const base = Math.max(12, Math.min(26, blockCss * 1.4));
        const lines = [{ t: (r.locked ? '🔒 ' : '') + r.name, c: '#ffffff', w: 600 }];
        if (r.owner) lines.push({ t: '👑 ' + (r.ownerName || '?'), c: '#ffd54f', w: 600 });
        let size = base, ok = false;
        for (; size >= 10; size -= 1) {
          ctx.font = `600 ${size * px}px system-ui, sans-serif`;
          const tw = Math.max(...lines.map(l => ctx.measureText(l.t).width));
          if (tw <= rw * 1.1 + 6 * px && lines.length * size * 1.25 * px <= rh + 4 * px) { ok = true; break; }
          if (lines.length > 1 && size <= 11) { lines.pop(); size = base + 1; } // sem espaço: mostra só o nome
        }
        if (ok) {
          ctx.save();
          ctx.font = `600 ${size * px}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const lh = size * 1.25 * px, tw = Math.max(...lines.map(l => ctx.measureText(l.t).width));
          const cx = rx + rw / 2, cy = rz + rh / 2, top = cy - (lines.length * lh) / 2;
          ctx.fillStyle = 'rgba(10,14,22,0.72)';
          ctx.beginPath(); ctx.roundRect(cx - tw / 2 - 5 * px, top - 2 * px, tw + 10 * px, lines.length * lh + 4 * px, 5 * px); ctx.fill();
          lines.forEach((l, i) => { ctx.fillStyle = l.c; ctx.fillText(l.t, cx, top + lh * (i + 0.5)); });
          ctx.restore();
        }
      } else if (!labels && r.owner && rw > 10) {
        // minimapa: só uma coroinha no canto
        ctx.font = '9px system-ui, sans-serif'; ctx.textAlign = 'left';
        ctx.fillText('👑', rx + 1, rz + 10);
      }
    }
    const u = labels ? S / (canvas.clientWidth || S) : 1; // marcas no mesmo tamanho de tela, qualquer resolução
    for (const m of marks) {
      const px = (m.x - x0) * k, py = (m.z - z0) * k;
      if (px < -10 * u || py < -10 * u || px > S + 10 * u || py > S + 10 * u) continue;
      ctx.save(); ctx.translate(px, py); ctx.scale(u, u);
      if (m.me) {
        ctx.rotate(-m.yaw); // seta para onde você olha (norte = cima)
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath();
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
      } else {
        if (m.focus) {
          // pessoa procurada: anéis pulsando em volta
          const ph = ((m.t || 0) / 900) % 1;
          for (const k of [0, 0.5]) { const q = (ph + k) % 1; ctx.beginPath(); ctx.arc(0, 0, 7 + q * 16, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = `rgba(255,213,79,${1 - q})`; ctx.stroke(); }
        }
        ctx.beginPath(); ctx.arc(0, 0, m.focus ? 7 : 5, 0, Math.PI * 2);
        ctx.fillStyle = m.color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      }
      ctx.restore();
      if (labels && m.name) {
        ctx.font = `bold ${13 * u}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.lineWidth = 3 * u; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(m.name, px, py - 10 * u);
        ctx.fillStyle = '#fff'; ctx.fillText(m.name, px, py - 10 * u);
      }
    }
  }
}
