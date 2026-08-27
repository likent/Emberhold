export class PathAbort extends Error {
  constructor() { super("pathfinding aborted: the cost field is degenerate"); }
}

export class MinHeap {
  constructor(capacity) {
    this.nodes = new Int32Array(capacity);
    // Costs must be float64: the search arithmetic is, and mixing the two
    // precisions makes equal values compare as improvements.
    this.costs = new Float64Array(capacity);
    this.size = 0;
  }
  clear() { this.size = 0; }
  push(node, cost) {
    if (this.size === this.nodes.length) this._grow();
    let i = this.size++;
    this.nodes[i] = node; this.costs[i] = cost;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.costs[p] <= this.costs[i]) break;
      this._swap(i, p); i = p;
    }
  }
  pop() {
    const topNode = this.nodes[0], topCost = this.costs[0];
    this.size--;
    if (this.size > 0) {
      this.nodes[0] = this.nodes[this.size]; this.costs[0] = this.costs[this.size];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.size && this.costs[l] < this.costs[m]) m = l;
        if (r < this.size && this.costs[r] < this.costs[m]) m = r;
        if (m === i) break;
        this._swap(i, m); i = m;
      }
    }
    return { node: topNode, cost: topCost };
  }
  _swap(a, b) {
    const n = this.nodes[a], c = this.costs[a];
    this.nodes[a] = this.nodes[b]; this.costs[a] = this.costs[b];
    this.nodes[b] = n; this.costs[b] = c;
  }
  /**
   * Dijkstra can only push a bounded number of times when every edge is
   * positive. If this ever runs away it means a cost went to zero, and
   * doubling the buffers until the tab dies is the worst way to find out.
   */
  _grow() {
    const next = this.nodes.length * 2;
    // Should be unreachable now that steps have a positive floor. If it ever
    // happens, give up on this pass instead of killing the run.
    if (next > 1 << 18) throw new PathAbort();
    const n = new Int32Array(next); n.set(this.nodes); this.nodes = n;
    const c = new Float64Array(next); c.set(this.costs); this.costs = c;
  }
}
