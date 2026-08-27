const CELL_EMPTY = 0;
export const CELL_BLOCKER = 1;    // natural impassable (rock node)
export const CELL_STRUCT = 2;     // built structure: passable at the price of breaking it
export const CELL_TRAP = 3;       // built trap: freely walkable, hurts whoever walks it

/** Floor for any single step, in seconds. Keeps the search well-founded. */
const MIN_STEP_COST = 0.02;

export class Grid {
  constructor(w, h, cell) {
    this.w = w; this.h = h; this.cell = cell;
    this.originX = -w * cell / 2;
    this.originZ = -h * cell / 2;
    this.type = new Uint8Array(w * h);
    this.hp = new Float32Array(w * h);
    this.def = new Array(w * h).fill(null);     // structure definition per cell
    this.node = new Array(w * h).fill(null);    // resource node per cell
    this.version = 0;
  }
  idx(cx, cy) { return cy * this.w + cx; }
  inBounds(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.w && cy < this.h; }
  cellX(x) { return Math.floor((x - this.originX) / this.cell); }
  cellY(z) { return Math.floor((z - this.originZ) / this.cell); }
  centerX(cx) { return this.originX + (cx + 0.5) * this.cell; }
  centerZ(cy) { return this.originZ + (cy + 0.5) * this.cell; }

  isBlocker(i) { return this.type[i] === CELL_BLOCKER; }
  isFree(i) { return this.type[i] === CELL_EMPTY; }
  blocksEnemy(i) {
    const t = this.type[i];
    return t === CELL_BLOCKER || t === CELL_STRUCT;   // traps never block
  }
  blocksPlayer(i) {
    const t = this.type[i];
    if (t === CELL_BLOCKER) return true;
    if (t === CELL_STRUCT) return this.def[i].blocksPlayer;
    return false;
  }

  /**
   * Cost in seconds of stepping into a cell, as judged by one class.
   * walk = how long that class needs to cross a cell, dps = how fast it
   * chews structures, fear = how much it respects a visible trap.
   */
  enterCost(i, walk, dps, fear) {
    const t = this.type[i];
    if (t === CELL_BLOCKER) return Infinity;
    let c = walk;
    if (t === CELL_STRUCT) c = walk + this.hp[i] / dps;
    else if (t === CELL_TRAP) c = walk + this.def[i].pathCost * fear;
    if (!isFinite(c)) return Infinity;
    // Dijkstra only terminates while every edge is positive. A structure
    // caught at negative hit points for a frame, or a class that cannot
    // damage anything, must never be allowed to produce a free step.
    return c > MIN_STEP_COST ? c : MIN_STEP_COST;
  }

  setBlocker(cx, cy, node) {
    const i = this.idx(cx, cy);
    this.type[i] = CELL_BLOCKER; this.node[i] = node; this.version++;
  }
  setStructure(cx, cy, def, hp) {
    const i = this.idx(cx, cy);
    this.type[i] = CELL_STRUCT; this.def[i] = def; this.hp[i] = hp; this.version++;
  }
  setTrap(cx, cy, def, hp) {
    const i = this.idx(cx, cy);
    this.type[i] = CELL_TRAP; this.def[i] = def; this.hp[i] = hp; this.version++;
  }
  clearCell(cx, cy) {
    const i = this.idx(cx, cy);
    this.type[i] = CELL_EMPTY; this.hp[i] = 0; this.def[i] = null; this.node[i] = null;
    this.version++;
  }
  /**
   * True when anything solid stands between two points. Walks the cells the
   * segment crosses, so a body only charges straight at a target it can
   * actually reach that way.
   */
  lineBlocked(x0, z0, x1, z1) {
    let cx = this.cellX(x0), cy = this.cellY(z0);
    const tx = this.cellX(x1), ty = this.cellY(z1);
    const dx = x1 - x0, dz = z1 - z0;
    const stepX = dx > 0 ? 1 : -1, stepY = dz > 0 ? 1 : -1;
    const invX = dx !== 0 ? Math.abs(this.cell / dx) : Infinity;
    const invZ = dz !== 0 ? Math.abs(this.cell / dz) : Infinity;
    let tMaxX = dx !== 0
      ? Math.abs(((dx > 0 ? cx + 1 : cx) * this.cell + this.originX - x0) / dx) : Infinity;
    let tMaxZ = dz !== 0
      ? Math.abs(((dz > 0 ? cy + 1 : cy) * this.cell + this.originZ - z0) / dz) : Infinity;

    for (let guard = 0; guard < 128; guard++) {
      if (cx === tx && cy === ty) return false;
      if (tMaxX < tMaxZ) { cx += stepX; tMaxX += invX; }
      else { cy += stepY; tMaxZ += invZ; }
      if (!this.inBounds(cx, cy)) return true;
      if (cx === tx && cy === ty) return false;
      if (this.blocksEnemy(this.idx(cx, cy))) return true;
    }
    return true;
  }

  /** HP changes are picked up by the timed rebuild, so no version bump here. */
  damageStructure(i, amount) {
    this.hp[i] -= amount;
    return this.hp[i] <= 0;
  }
}
