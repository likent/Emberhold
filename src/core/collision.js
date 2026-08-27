import { clamp } from "./util.js";

/**
 * Sliding collision against the grid, shared by the player and every enemy.
 * Each axis is tried on its own, which is what lets a body slide along a wall
 * instead of sticking to it.
 */
export function resolveMove(g, pos, nx, nz, radius, isPlayer) {
  const limitX = (g.w * g.cell) / 2 - radius;
  const limitZ = (g.h * g.cell) / 2 - radius;
  nx = clamp(nx, -limitX, limitX);
  nz = clamp(nz, -limitZ, limitZ);
  // Escape hatch: anything already inside solid geometry (a boulder that
  // regrew underneath it, say) may move freely until it is out again.
  if (blocked(g, pos.x, pos.z, radius, isPlayer)) { pos.x = nx; pos.z = nz; return; }
  if (!blocked(g, nx, pos.z, radius, isPlayer)) pos.x = nx;
  if (!blocked(g, pos.x, nz, radius, isPlayer)) pos.z = nz;
}

export function blocked(g, x, z, radius, isPlayer) {
  const minX = g.cellX(x - radius), maxX = g.cellX(x + radius);
  const minZ = g.cellY(z - radius), maxZ = g.cellY(z + radius);
  for (let cy = minZ; cy <= maxZ; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      if (!g.inBounds(cx, cy)) continue;
      const i = g.idx(cx, cy);
      if (isPlayer ? g.blocksPlayer(i) : g.blocksEnemy(i)) return true;
    }
  }
  return false;
}
