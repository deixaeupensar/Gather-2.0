// "Sound tracing" simplificado: o som se espalha pelo ar a partir de quem ouve (busca em largura
// pelas células vazias). Paredes, teto, chão e vidro bloqueiam; folhas deixam passar.
// Se a voz só chega dando a volta (por uma porta ou buraco), fica mais baixa e abafada.
// Se não existe caminho pelo ar (sala fechada), não dá para ouvir.
const R = 40, N = 2 * R + 1, N2 = N * N, SIZE = N * N2;
const stamp = new Int32Array(SIZE), dist = new Uint8Array(SIZE), queue = new Int32Array(SIZE);
const SOLID = 255;
let sid = 0;
const blocksSound = b => b !== 0 && b !== 6; // 6 = folhas
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export function soundField(world, ox, oy, oz) {
  sid++;
  const bx = ox - R, by = oy - R, bz = oz - R;
  let h = 0, t = 0;
  const s = R + R * N + R * N2;
  stamp[s] = sid; dist[s] = 0; queue[t++] = s;
  while (h < t) {
    const c = queue[h++], d = dist[c];
    if (d >= R) continue;
    const lx = c % N, ly = ((c / N) | 0) % N, lz = (c / N2) | 0;
    for (const [dx, dy, dz] of DIRS) {
      const nx = lx + dx, ny = ly + dy, nz = lz + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= N || ny >= N || nz >= N) continue;
      const ni = nx + ny * N + nz * N2;
      if (stamp[ni] === sid) continue;
      stamp[ni] = sid;
      const wy = ny + by;
      if (wy < 0 || blocksSound(world.get(nx + bx, wy, nz + bz))) { dist[ni] = SOLID; continue; }
      dist[ni] = d + 1;
      queue[t++] = ni;
    }
  }
  const at = (x, y, z) => {
    x -= bx; y -= by; z -= bz;
    if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) return -1;
    const i = x + y * N + z * N2;
    return stamp[i] === sid && dist[i] !== SOLID ? dist[i] : -1;
  };
  // distância pelo ar até uma posição (se a cabeça estiver dentro de um bloco, tenta os vizinhos)
  return (x, y, z) => {
    let d = at(x, y, z);
    if (d >= 0) return d;
    let best = -1;
    for (const [dx, dy, dz] of DIRS) { const v = at(x + dx, y + dy, z + dz); if (v >= 0 && (best < 0 || v + 1 < best)) best = v + 1; }
    return best;
  };
}
