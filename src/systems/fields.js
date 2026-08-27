import { Pathfinder } from "../core/pathfinder.js";
import { CONFIG } from "../data/config.js";

/**
 * One flow field per enemy class, and the schedule that decides which of them
 * may rebuild this frame. `core/pathfinder.js` owns how a field is computed;
 * this owns when, and towards what.
 *
 * A rebuild is skipped unless its inputs actually changed - the field depends
 * on the target CELLS and on the grid, so a player walking within one cell
 * costs nothing at all.
 */
export class FieldRunner {
  constructor(game) {
    this.game = game;
    this.fields = {};
    for (const id in CONFIG.enemyTypes) {
      this.fields[id] = new Pathfinder(game.grid, CONFIG.enemyTypes[id]);
    }
    this.shown = this.fields.raider;   // the one the heatmap draws
    this.dirty = true;
    this.timer = 0;
    this.queue = [];
    this.stats = { builds: 0, ms: 0, window: 0, rate: 0, avg: 0 };
  }

  /** The world changed under the fields: look at every class again. */
  invalidate() { this.dirty = true; }

  /**
   * The targets themselves changed - hunt mode flipped, or a save was loaded.
   * Clearing the signatures is what stops a field deciding it is still valid.
   */
  invalidateAll() {
    for (const id in this.fields) this.fields[id].sig = "";
    this.dirty = true;
  }

  /** Returns a usable field for a class, rebuilding it if it went cold. */
  field(type) {
    const field = this.fields[type.id];
    if (field && field.stale) { field.stale = false; this.rebuild(field); }
    return field;
  }

  /** Returns true when a pass was actually run. */
  rebuild(field) {
    const targets = this._targets();
    const sig = this.game.grid.version + "|" +
                targets.map(t => t.cx + "," + t.cy + "," + t.bias).join(";");
    if (field.sig === sig) return false;
    field.sig = sig;
    const t0 = performance.now();
    field.compute(targets);
    this.stats.builds++;
    this.stats.ms += performance.now() - t0;
    return true;
  }

  update(dt) {
    const game = this.game;
    this.timer -= dt;
    if (this.timer <= 0 || this.dirty || this.shown.version !== game.grid.version) {
      this.timer = CONFIG.path.rebuildInterval;
      for (const id in this.fields) {
        if (this._classActive(id)) { if (this.queue.indexOf(id) < 0) this.queue.push(id); }
        else this.fields[id].stale = true;
      }
      this.dirty = false;
    }

    // At most one field per frame: three classes rebuilt together was a
    // visible hitch. Fields whose inputs have not changed are skipped outright.
    if (this.queue.length) {
      const id = this.queue.shift();
      const field = this.fields[id];
      field.stale = false;
      if (this.rebuild(field) && game.debug && game.debugClass === id) game.heatmap.refresh();
    }

    // Rolling measure of what the field actually costs, shown on the stats screen.
    const s = this.stats;
    s.window += dt;
    if (s.window >= 2) {
      s.rate = s.builds / s.window;
      s.avg = s.builds ? s.ms / s.builds : 0;
      s.builds = 0; s.ms = 0; s.window = 0;
    }
  }

  /** How many classes are being kept warm - a readout for the stats screen. */
  liveClasses() { return Object.keys(this.fields).filter(id => this._classActive(id)).length; }

  /** Classes with nothing alive (and not on debug display) skip their rebuild. */
  _classActive(id) {
    if (this.game.debug && this.game.debugClass === id) return true;
    if (id === "raider") return true;                 // always warm: waves lead with it
    return this.game.enemies.some(e => e.type.id === id);
  }

  /**
   * The field targets the core only. The player used to be a second source,
   * which meant a full rebuild every time they crossed a cell - a hitch every
   * few frames in a fight. Chasing the player is now local steering inside
   * each class's aggro range, so the field only changes when the world does.
   */
  _targets() {
    const g = this.game.grid, player = this.game.player, core = this.game.core;
    const chase = (this.game.huntPlayer || core.carrying) && !player.downed;
    if (chase) {
      return [{ cx: g.cellX(player.position.x), cy: g.cellY(player.position.z), bias: 0 }];
    }
    if (core.cell >= 0) {
      return [{ cx: core.cell % g.w, cy: (core.cell / g.w) | 0, bias: 0 }];
    }
    return [{ cx: g.w >> 1, cy: g.h >> 1, bias: 0 }];
  }
}
