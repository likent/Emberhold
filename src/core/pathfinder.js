import { PathAbort, MinHeap } from "./minheap.js";
import { reportError } from "./report-error.js";
import { clamp } from "./util.js";
import { CONFIG } from "../data/config.js";

/* --------------------------------------------------------------------------
 * Pathfinder: one Dijkstra flow field, reused by every enemy
 * ------------------------------------------------------------------------ */

export class Pathfinder {
  constructor(grid, type) {
    this.grid = grid;
    this.type = type;
    this.walk = grid.cell / type.speed;
    const n = grid.w * grid.h;
    this.dist = new Float64Array(n);
    this.heap = new MinHeap(n);
    this.sig = "";              // targets + grid version this field was built for
    this.maxDist = 1;
    this.dirty = true;
    this.version = -1;
  }

  /**
   * Multi-source: every entry in `targets` is seeded at its own starting cost,
   * so one pass answers "which objective is cheapest from here" for every cell.
   * A bias on a source makes it less attractive without excluding it.
   */
  /** Never throws: a degenerate field leaves the previous one in place. */
  compute(targets) {
    try { this._compute(targets); }
    catch (e) {
      if (!(e instanceof PathAbort)) throw e;
      this.heap.clear();
      if (!this._warned) { this._warned = true; reportError(e); }
    }
  }

  _compute(targets) {
    const g = this.grid, w = g.w, h = g.h;
    const dist = this.dist, heap = this.heap;
    dist.fill(Infinity);
    heap.clear();

    for (const t of targets) {
      const tx = clamp(t.cx, 0, w - 1), ty = clamp(t.cy, 0, h - 1);
      const ti = g.idx(tx, ty);
      const seed = t.bias || 0;
      if (seed < dist[ti]) { dist[ti] = seed; heap.push(ti, seed); }
    }

    let maxFinite = 1;
    while (heap.size > 0) {
      const top = heap.pop();
      const i = top.node;
      if (top.cost > dist[i]) continue;
      if (top.cost > maxFinite) maxFinite = top.cost;
      const cx = i % w, cy = (i / w) | 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const diag = dx !== 0 && dy !== 0;
          // Two cells touching only at a corner leave zero clearance, so a
          // diagonal step is illegal if EITHER orthogonal neighbour is occupied
          // (rock or structure). Without this the field hands out routes that
          // no body of non-zero radius can physically walk.
          if (diag && (g.blocksEnemy(g.idx(cx + dx, cy)) || g.blocksEnemy(g.idx(cx, cy + dy)))) continue;
          const ni = ny * w + nx;
          const step = g.enterCost(ni, this.walk, this.type.dpsVsStructure, this.type.trapFear) *
                       (diag ? CONFIG.path.diagonal : 1);
          if (!isFinite(step)) continue;
          const nd = top.cost + step;
          // Belt and braces: only a real improvement re-opens a cell.
          if (nd < dist[ni] - 1e-9) { dist[ni] = nd; heap.push(ni, nd); }
        }
      }
    }
    this.maxDist = maxFinite;
  }



  /**
   * Steepest descent from one cell, computed on demand. Building a direction
   * for all 1600 cells cost more than every enemy asking for its own: eight
   * comparisons per body per frame against thirteen thousand per rebuild.
   */
  stepFrom(cx, cy) {
    const g = this.grid, w = g.w, h = g.h, dist = this.dist;
    const here = dist[cy * w + cx];
    if (!isFinite(here)) return null;
    let best = here, bx = 0, by = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (dx !== 0 && dy !== 0 &&
            (g.blocksEnemy(g.idx(cx + dx, cy)) || g.blocksEnemy(g.idx(cx, cy + dy)))) continue;
        const nd = dist[ny * w + nx];
        if (nd < best) { best = nd; bx = dx; by = dy; }
      }
    }
    return bx || by ? { dx: bx, dy: by } : null;
  }

  hasRoute(i) { return isFinite(this.dist[i]); }
}
