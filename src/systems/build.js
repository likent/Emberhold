import { DIR, MASK_NS, MASK_EW } from "../core/autotile.js";
import { CELL_STRUCT, CELL_TRAP } from "../core/grid.js";
import { clamp, costText } from "../core/util.js";
import { CONFIG } from "../data/config.js";
import { ITEMS } from "../data/items.js";
import { RESOURCES } from "../data/resources.js";
import { STRUCTURES } from "../data/structures.js";
import { BenchOutput, CraftQueue } from "./crafting.js";
import { Inventory } from "./inventory.js";

/* --------------------------------------------------------------------------
 * Build system: places STRUCTURES entries on the grid
 * ------------------------------------------------------------------------ */

export class BuildSystem {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.selected = STRUCTURES.fence;
    this.placed = new Map();      // cell index -> mesh
    this.hpBars = new Map();      // cell index -> health bar
    this.tickers = new Map();     // cell index -> { def, mesh, state } for structures with onUpdate
    this.chests = new Map();      // cell index -> Inventory
    this.queues = new Map();      // cell index -> CraftQueue (workbenches)
    this.outputs = new Map();     // cell index -> BenchOutput tray
    this.queueBars = new Map();   // cell index -> world progress bar
                                  // NB: kept separate from `active`, which is the build-mode flag
    this.meta = new Map();        // cell index -> { orient } for direction-aware pieces
    this.repairDebt = { wood: 0, stone: 0 };   // fractional material cost carried between frames
    this._repairWarn = 0;
    this.ghostMats = {
      ok: new THREE.MeshBasicMaterial({ color: 0x4fb4c9, transparent: true, opacity: 0.42 }),
      bad: new THREE.MeshBasicMaterial({ color: 0xff6a4d, transparent: true, opacity: 0.42 })
    };
    this.ghost = null;
    this.ghostKey = "";
    this.line = null;          // anchor cell while a run is being dragged out
    this.lineMeshes = [];
    this.lineKey = "";
    this.aim = { cx: -1, cy: -1, valid: false };
  }

  setActive(on) {
    if (!on) this.cancelLine();
    this.active = on;
    if (!on && this.ghost) this.ghost.visible = false;
    this.game.palette.setBuildMode(on);
  }

  select(id) {
    this.selected = STRUCTURES[id];
    this.ghostKey = "";
    this.game.palette.setSelected(id);
  }

  /* ---- auto-tiling ------------------------------------------------------ */

  /** Neighbour bitmask of connectable structures around a cell. */
  maskAt(cx, cy, def) {
    const g = this.game.grid;
    let mask = 0;
    for (const d of DIR) {
      const nx = cx + d.dx, ny = cy + d.dy;
      if (!g.inBounds(nx, ny)) continue;
      const ni = g.idx(nx, ny);
      if (g.type[ni] !== CELL_STRUCT) continue;
      const other = g.def[ni];
      if (other.connect && def.connect && other.connect === def.connect) mask |= d.bit;
    }
    return mask;
  }

  /** Rebuilds the mesh of one cell to match its current neighbours. */
  refresh(cx, cy) {
    const g = this.game.grid;
    if (!g.inBounds(cx, cy)) return;
    const i = g.idx(cx, cy);
    if (g.type[i] !== CELL_STRUCT && g.type[i] !== CELL_TRAP) return;
    const def = g.def[i];
    const old = this.placed.get(i);
    if (old) this.game.scene.remove(old);
    const mesh = def.build(this.maskAt(cx, cy, def), this.meta.get(i));
    mesh.position.set(g.centerX(cx), 0, g.centerZ(cy));
    this.game.scene.add(mesh);
    this.placed.set(i, mesh);
    if (def.station === "craft" || def.station === "smelt" || def.station === "cook") this.queueAt(i);
    if (def.station === "storage" && !this.chests.has(i)) {
      this.chests.set(i, new Inventory(def.slots || CONFIG.station.chestSlots));
    }
    if (def.onUpdate) {
      const prev = this.tickers.get(i);
      this.tickers.set(i, { def, mesh, index: i, state: prev ? prev.state : { cd: 0, t: 0 } });
    }
  }

  /** Per-frame tick for structures that do something (turrets, the core). */
  updateActive(dt) {
    this.tickers.forEach(entry => entry.def.onUpdate(dt,
      { game: this.game, mesh: entry.mesh, state: entry.state, index: entry.index }));
  }

  /** A change in one cell also changes how its four neighbours are drawn. */
  refreshArea(cx, cy) {
    const g = this.game.grid;
    this.refresh(cx, cy);
    for (const d of DIR) {
      const nx = cx + d.dx, ny = cy + d.dy;
      if (!g.inBounds(nx, ny)) continue;
      const def = g.def[g.idx(nx, ny)];
      if (def && def.connect) this.refresh(nx, ny);   // only auto-tiled pieces restyle
    }
    this.ghostKey = "";
  }

  /* ---- line building -----------------------------------------------------
   * Hold the place button to anchor a start cell, then walk: the run snaps to
   * whichever axis you moved further along, and releasing builds all of it.
   * Cells that are blocked or unaffordable are skipped, not aborted on. */

  beginLine() {
    if (!this.active || this.game.core.carrying) return false;
    this.line = { cx: this.aim.cx, cy: this.aim.cy };
    this.lineKey = "";
    return true;
  }

  /** Cells from the anchor to the current aim, snapped to one axis. */
  lineCells() {
    if (!this.line) return [];
    const g = this.game.grid;
    let dx = this.aim.cx - this.line.cx, dy = this.aim.cy - this.line.cy;
    if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0;
    const len = Math.min(Math.max(Math.abs(dx), Math.abs(dy)), CONFIG.build.maxLine - 1);
    const stepX = Math.sign(dx), stepY = Math.sign(dy);
    const cells = [];
    for (let i = 0; i <= len; i++) {
      const cx = this.line.cx + stepX * i, cy = this.line.cy + stepY * i;
      if (g.inBounds(cx, cy)) cells.push({ cx, cy });
    }
    return cells;
  }

  _refreshLinePreview() {
    const cells = this.lineCells();
    const def = this.activeDef();
    const key = def.id + ":" + cells.map(c => c.cx + "," + c.cy).join(";");
    if (key === this.lineKey) return;
    this.lineKey = key;

    for (const m of this.lineMeshes) this.game.scene.remove(m);
    this.lineMeshes.length = 0;

    const g = this.game.grid;
    const horizontal = cells.length > 1 && cells[0].cy === cells[1].cy;
    const mask = cells.length > 1 ? (horizontal ? MASK_EW : MASK_NS) : 0;
    let budget = this.game.sandbox ? 999 : this._affordableCount(def);

    for (const c of cells) {
      const mode = this.placementMode(c.cx, c.cy);
      const ok = (mode === "place" || mode === "replace") && budget > 0;
      if (ok) budget--;
      const mesh = def.build(mask, { orient: this._orientFromPlayer() });
      const mat = ok ? this.ghostMats.ok : this.ghostMats.bad;
      mesh.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
      mesh.position.set(g.centerX(c.cx), 0.02, g.centerZ(c.cy));
      this.game.scene.add(mesh);
      this.lineMeshes.push(mesh);
    }
  }

  /** How many copies the player can still pay for. */
  _affordableCount(def) {
    if (def.item) return this.game.economy.inv.count(def.item);
    let n = Infinity;
    for (const k in def.cost) n = Math.min(n, Math.floor(this.game.economy.inv.count(k) / def.cost[k]));
    return isFinite(n) ? n : 0;
  }

  commitLine() {
    const cells = this.lineCells();
    this.cancelLine();
    let built = 0;
    for (const c of cells) {
      const mode = this.placementMode(c.cx, c.cy);
      if (mode === "replace") { this.replaceAt(c.cx, c.cy); built++; continue; }
      if (mode !== "place") continue;
      this.payFor(this.selected);
      if (this.selected.plantsResource) {
        this.game.resources.plantAt(RESOURCES[this.selected.plantsResource], c.cx, c.cy, 0.06);
      } else {
        this.create(c.cx, c.cy, this.selected);
      }
      built++;
    }
    if (built) this.game.ui.toast("Built " + built);
    else this.game.ui.toast("Nothing could be placed there");
  }

  cancelLine() {
    this.line = null;
    this.lineKey = "";
    for (const m of this.lineMeshes) this.game.scene.remove(m);
    this.lineMeshes.length = 0;
  }

  /* ---- placement -------------------------------------------------------- */

  /** Deployables are paid for in carried units, building blocks in materials. */
  canAfford(def) {
    const eco = this.game.economy;
    if (def.isCore) return true;
    if (def.item) return this.game.sandbox || eco.inv.count(def.item) > 0;
    return eco.canAfford(def.cost);
  }

  payFor(def) {
    if (this.game.sandbox || def.isCore) return;
    if (def.item) {
      this.game.economy.spend({ [def.item]: 1 });
      // Spending the last one empties the hand, so the hand-driven UI - the
      // held mesh, the action icon, the ghost - has to be told.
      this.game.equip.changed();
    } else {
      this.game.economy.spend(def.cost);
    }
  }

  /** Choosing a deployable anywhere arms it and opens placement. */
  selectFromBag(id) {
    const panel = this.game.panel;
    this.select(id);
    if (!this.active) this.setActive(true);
    this.game.palette.toggle(false);
    if (panel.isOpen()) panel.toggle();
    this.game.ui.toast(STRUCTURES[id].label + " ready to place");
  }

  /**
   * A deployable is armed because it is in your hand. Once it is not - you
   * ran out, or picked another slot - the preview must not linger.
   */
  syncSelection() {
    const sel = this.selected;
    if (!this.active || !sel || !sel.item) return;
    const hand = this.game.equip.handItem();
    if (hand && hand.kind === "deployable") {
      if (hand.structure !== sel.id) this.select(hand.structure);
      return;
    }
    this.cancelLine();
    this.setActive(false);
    this.game.ui.toast("Out of " + sel.label.toLowerCase());
  }

  /** Carrying the core overrides whatever is selected in the palette. */
  activeDef() { return this.game.core.carrying ? STRUCTURES.core : this.selected; }

  updateGhost() {
    const p = this.game.player;
    if (!p || (!this.active && !this.game.core.carrying)) return;
    this.aimAt(
      p.position.x + Math.sin(p.yaw) * CONFIG.grid.cell * 1.4,
      p.position.z + Math.cos(p.yaw) * CONFIG.grid.cell * 1.4
    );
  }

  aimAt(x, z) {
    const g = this.game.grid, def = this.activeDef();
    const cx = g.cellX(x), cy = g.cellY(z);
    this.aim.cx = cx; this.aim.cy = cy;
    this.aim.valid = this.placementMode(cx, cy) !== "no";
    if (!g.inBounds(cx, cy)) return;

    // The preview is the real mesh with ghost materials, so you see the shape
    // the auto-tiler will pick before spending anything.
    const mask = this.maskAt(cx, cy, def);
    const key = def.id + ":" + mask + ":" + this.aim.valid + ":" + this._orientFromPlayer();
    if (key !== this.ghostKey) {
      this.ghostKey = key;
      if (this.ghost) this.game.scene.remove(this.ghost);
      this.ghost = def.build(mask, { orient: this._orientFromPlayer() });
      const mat = this.aim.valid ? this.ghostMats.ok : this.ghostMats.bad;
      this.ghost.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
      this.game.scene.add(this.ghost);
    }
    this.ghost.position.set(g.centerX(cx), 0.02, g.centerZ(cy));
    this.ghost.visible = (this.active || this.game.core.carrying) && !this.line;
    if (this.line) this._refreshLinePreview();
  }

  /** Default gate axis when no walls are adjacent: perpendicular to the player. */
  _orientFromPlayer() {
    const p = this.game.player;
    if (!p) return 0;
    return Math.abs(Math.sin(p.yaw)) > Math.abs(Math.cos(p.yaw)) ? Math.PI / 2 : 0;
  }

  canPlace(cx, cy) {
    const g = this.game.grid;
    if (!g.inBounds(cx, cy)) return false;
    const i = g.idx(cx, cy);
    if (!g.isFree(i) || g.node[i]) return false;
    if (!this.canAfford(this.activeDef())) return false;
    if (this._occupiedByBody(cx, cy)) return false;
    return true;
  }

  /**
   * A body is wider than the cell it stands in, so testing "is it in this
   * cell" is not enough - dropping a wall on an overlapping cell used to
   * wedge the player in place. Test the circle against the cell rectangle.
   */
  _overlapsCell(pos, radius, cx, cy) {
    const g = this.game.grid, half = g.cell / 2;
    const centreX = g.centerX(cx), centreZ = g.centerZ(cy);
    const dx = Math.max(Math.abs(pos.x - centreX) - half, 0);
    const dz = Math.max(Math.abs(pos.z - centreZ) - half, 0);
    return dx * dx + dz * dz < (radius + 0.06) * (radius + 0.06);
  }

  _occupiedByBody(cx, cy) {
    const p = this.game.player;
    if (p && !p.downed && this._overlapsCell(p.position, CONFIG.player.radius, cx, cy)) return true;
    for (const e of this.game.enemies) {
      if (this._overlapsCell(e.position, e.type.radius, cx, cy)) return true;
    }
    return false;
  }

  /** What a tap on this cell would do with the current selection. */
  placementMode(cx, cy) {
    const g = this.game.grid;
    if (!g.inBounds(cx, cy)) return "no";
    const i = g.idx(cx, cy);
    const current = g.def[i];
    if (!current) return this.canPlace(cx, cy) ? "place" : "no";
    if (current.isCore) return "no";
    const def = this.activeDef();
    if (current === def) return "remove";
    // Different piece on an occupied cell: swap it, refunding the old one.
    return this.canAfford(def) && !this._occupiedByBody(cx, cy) ? "replace" : "no";
  }

  /** Swaps one piece for another in place, paying the difference. */
  replaceAt(cx, cy) {
    const g = this.game.grid;
    const i = g.idx(cx, cy);
    const old = g.def[i];
    const def = this.selected;
    this.lift(i);                       // quiet removal: no collapse, no loss handling
    if (!this.game.sandbox) {
      if (old.item) this.game.economy.add(old.item, 1);
      else if (old.refund) this.game.economy.addAll(old.refund);
    }
    this.payFor(def);
    this.create(cx, cy, def);
    this.game.fx.spawnChips(g.centerX(cx), 0.8, g.centerZ(cy), 5, 0xd9b678);
  }

  placeAtAim() {
    const { cx, cy } = this.aim;
    const g = this.game.grid;
    if (!g.inBounds(cx, cy)) return;
    const i = g.idx(cx, cy);
    const mode = this.placementMode(cx, cy);
    if (mode === "remove") { this.remove(i); return; }
    if (mode === "replace") { this.replaceAt(cx, cy); return; }
    if (!this.canPlace(cx, cy)) {
      const def = this.activeDef();
      if (this.canAfford(def)) this.game.ui.toast("Blocked");
      else if (def.item) this.game.ui.toast("Craft a " + def.label.toLowerCase() + " first");
      else this.game.ui.toast("Need " + costText(def.cost));
      return;
    }
    this.payFor(this.selected);
    if (this.selected.plantsResource) {
      this.game.resources.plantAt(RESOURCES[this.selected.plantsResource], cx, cy, 0.06);
      this.game.stats.planted++;
      this.game.ui.toast("Planted");
      return;
    }
    this.create(cx, cy, this.selected);
  }

  create(cx, cy, def) {
    const g = this.game.grid;
    this.game.stats.built++;
    if (def.trap) g.setTrap(cx, cy, def, def.hp);
    else g.setStructure(cx, cy, def, def.hp);
    this.meta.set(g.idx(cx, cy), { orient: this._orientFromPlayer() });
    this.refreshArea(cx, cy);
    this.game.paths.invalidate();
  }

  /** Deployables are picked back up whole; building blocks yield salvage. */
  remove(i) {
    const def = this.game.grid.def[i];
    this.destroy(i);
    if (!def || this.game.sandbox) return;
    if (def.item) this.game.economy.add(def.item, 1);
    else if (def.refund) this.game.economy.addAll(def.refund);
  }

  destroy(i) {
    const g = this.game.grid;
    const mesh = this.placed.get(i);
    if (mesh) { this.game.fx.playCollapse(mesh); this.placed.delete(i); }
    const wasCore = g.def[i] && g.def[i].isCore;
    this._spillChest(i);
    this._cancelQueue(i);
    this.tickers.delete(i);
    const bar = this.hpBars.get(i);
    if (bar) { this.game.bars.destroy(bar); this.hpBars.delete(i); }
    this.meta.delete(i);
    const cx = i % g.w, cy = (i / g.w) | 0;
    g.clearCell(cx, cy);
    this.game.fx.spawnChips(g.centerX(cx), 0.8, g.centerZ(cy), 8, 0xd9b678);
    this.refreshArea(cx, cy);     // neighbours lose an arm
    this.game.paths.invalidate();
    if (wasCore) this.game.core.lost();
  }

  /* ---- repair -----------------------------------------------------------
   * Restoring a piece to full costs what it cost to build (the core has its
   * own price, since it is never bought). Materials are charged per hit point,
   * with the fractional remainder carried between frames. */

  _pricePerHp(def) {
    if (!def._perHp) {
      const base = def.repairCost || def.cost || {};
      def._perHp = {};
      for (const k in base) def._perHp[k] = base[k] / def.hp;
    }
    return def._perHp;
  }

  /** Nearest damaged piece in range, or null. */
  repairTarget(pos, range) {
    const g = this.game.grid;
    let best = null, bestD = range * range;
    this.placed.forEach((mesh, i) => {
      const def = g.def[i];
      if (!def || g.hp[i] >= def.hp) return;
      if (def.burnRate && g.hp[i] > def.hp * 0.6) return;   // still burning well
      const dx = mesh.position.x - pos.x, dz = mesh.position.z - pos.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = { i, def, mesh }; }
    });
    return best;
  }

  /** Returns true while actually repairing something. */
  repair(dt, pos) {
    const cfg = CONFIG.player.repair;
    const rate = this.game.equip.repairRate;
    if (rate <= 0) return false;              // no hammer, no repairs
    const t = this.repairTarget(pos, cfg.range);
    if (!t) return false;
    const g = this.game.grid, eco = this.game.economy;
    let amount = Math.min(rate * dt, t.def.hp - g.hp[t.i]);
    const perHp = this._pricePerHp(t.def);

    if (!eco.infinite) {
      // Never spend more than is on hand: scale the tick down to what we can
      // pay. Counts come from the backpack itself - the HUD mirror only ever
      // tracked wood and stone, so anything else read as zero.
      for (const k in perHp) {
        const affordable = eco.inv.count(k) + (this.repairDebt[k] || 0);
        if (perHp[k] > 0) amount = Math.min(amount, affordable / perHp[k]);
      }
      if (amount <= 0.001) {
        this._warnRepair(perHp);
        return false;
      }
      for (const k in perHp) {
        this.repairDebt[k] = (this.repairDebt[k] || 0) + perHp[k] * amount;
        const whole = Math.floor(this.repairDebt[k]);
        if (whole > 0) { eco.spend({ [k]: whole }); this.repairDebt[k] -= whole; }
      }
    }

    g.hp[t.i] += amount;                      // picked up by the timed rebuild
    this.game.equip.wearHand(dt * 1.6);        // hammers wear out like anything else
    if (Math.random() < dt * 5) {
      this.game.fx.spawnChips(t.mesh.position.x, t.def.height * 0.7, t.mesh.position.z, 1, 0x9fe0b0);
    }
    return true;
  }

  _warnRepair(perHp) {
    if (this._repairWarn > 0) return;
    this._repairWarn = 2.5;
    this.game.ui.toast("Out of materials to repair");
  }

  /** Removes a piece without collapse, refund or loss handling: it is moving, not dying. */
  lift(i) {
    const g = this.game.grid;
    this._spillChest(i);
    const mesh = this.placed.get(i);
    if (mesh) { this.game.scene.remove(mesh); this.placed.delete(i); }
    const bar = this.hpBars.get(i);
    if (bar) { this.game.bars.destroy(bar); this.hpBars.delete(i); }
    this.tickers.delete(i);
    this.meta.delete(i);
    const hp = g.hp[i];
    const cx = i % g.w, cy = (i / g.w) | 0;
    g.clearCell(cx, cy);
    this.refreshArea(cx, cy);
    this.game.paths.invalidate();
    return hp;
  }

  /** Damage is shown by a floating bar; the mesh keeps its full silhouette. */
  outputAt(i) {
    if (!this.outputs.has(i)) this.outputs.set(i, new BenchOutput(CONFIG.craft.benchOutput));
    return this.outputs.get(i);
  }

  queueAt(i) {
    if (!this.queues.has(i)) {
      const q = new CraftQueue(this.game, this.outputAt(i));
      const def = this.game.grid.def[i];
      q.speed = (def && def.craftSpeed) || 1;
      this.queues.set(i, q);
    }
    return this.queues.get(i);
  }

  /**
   * Runs every bench queue and shows what each is working on as a tinted bar
   * floating over the bench, so an unattended workbench is readable from afar.
   */
  updateQueues(dt) {
    this.queues.forEach((queue, i) => {
      queue.update(dt);
      const mesh = this.placed.get(i);
      let bar = this.queueBars.get(i);
      if (!queue.busy || !mesh) {
        if (bar) { this.game.bars.destroy(bar); this.queueBars.delete(i); }
        return;
      }
      const tint = queue.stalled ? "#ff7a5e" : ITEMS[queue.current.recipe.out].tint;
      if (!bar || bar.tint !== tint) {
        if (bar) this.game.bars.destroy(bar);
        bar = this.game.bars.create(parseInt(tint.slice(1), 16), 1.5);
        bar.tint = tint;
        this.queueBars.set(i, bar);
      }
      const def = this.game.grid.def[i];
      this.game.bars.place(bar, mesh.position.x, (def ? def.height : 1) + 0.85, mesh.position.z);
      this.game.bars.set(bar, queue.stalled ? 1 : Math.max(0.001, queue.progress()));
      bar.group.visible = true;
    });
  }

  /** A broken chest hands what it can back to the player; the rest is lost. */
  _spillChest(i) {
    const chest = this.chests.get(i);
    if (!chest) return;
    let lost = 0;
    for (const entry of chest.slots) {
      if (!entry) continue;
      const left = this.game.economy.inv.add(entry.id, entry.count);
      if (left > 0) lost += left;
    }
    this.chests.delete(i);
    this.game.economy._sync();
    if (lost) this.game.ui.toast("Chest broke - " + lost + " items lost");
    else this.game.ui.toast("Chest emptied into your backpack");
  }

  /** A destroyed bench refunds whatever it had not finished. */
  _cancelQueue(i) {
    const tray = this.outputs.get(i);
    if (tray) {
      let lost = 0;
      tray.slots.forEach(entry => { if (entry && !this.game.economy.inv.putEntry(entry)) lost++; });
      this.outputs.delete(i);
      this.game.economy._sync();
      if (lost) this.game.ui.toast(lost + " finished items lost with the bench");
    }
    const queue = this.queues.get(i);
    if (queue) {
      while (queue.jobs.length) queue.cancel(0) || queue.jobs.shift();
      this.queues.delete(i);
    }
    const bar = this.queueBars.get(i);
    if (bar) { this.game.bars.destroy(bar); this.queueBars.delete(i); }
  }

  updateBars(dt) {
    if (this._repairWarn > 0) this._repairWarn -= dt;
    const g = this.game.grid;
    this.placed.forEach((mesh, i) => {
      const def = g.def[i];
      if (!def || def.noBar) return;
      const k = def.hp > 1 ? clamp(g.hp[i] / def.hp, 0, 1) : 1;
      let bar = this.hpBars.get(i);
      if (k >= 0.999) {
        if (bar) { this.game.bars.destroy(bar); this.hpBars.delete(i); }
        return;
      }
      if (!bar) { bar = this.game.bars.create(0xd6a34a, 1.5); this.hpBars.set(i, bar); }
      this.game.bars.place(bar, mesh.position.x, def.height + 0.5, mesh.position.z);
      this.game.bars.set(bar, k);
    });
  }

  reset() {
    const g = this.game.grid;
    this.placed.forEach((mesh, i) => {
      this.game.scene.remove(mesh);
      g.clearCell(i % g.w, (i / g.w) | 0);
    });
    this.placed.clear();
    this.tickers.clear();
    this.chests.clear();
    this.queues.forEach((q, i) => this._cancelQueue(i));
    this.queues.clear();
    this.outputs.clear();
    this.hpBars.forEach(bar => this.game.bars.destroy(bar));
    this.hpBars.clear();
    this.meta.clear();
    this.ghostKey = "";
  }
}
