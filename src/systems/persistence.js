import { CONFIG } from "../data/config.js";
import { RECIPES } from "../data/recipes.js";
import { RESOURCES } from "../data/resources.js";
import { STRUCTURES } from "../data/structures.js";
import { Inventory } from "./inventory.js";
import { reportError } from "../core/report-error.js";

/**
 * The world is small enough to write out whole: the grid, what stands on it,
 * what is growing, what you carry and what time it is. Raiders and animals
 * are deliberately left out - they come back on their own.
 */
export class Persistence {
  constructor(game) {
    this.game = game;
    this._memorySave = null;    // the fallback when localStorage refuses us
  }

  snapshot() {
    const g = this.game.grid, b = this.game.build;
    const structures = [];
    b.placed.forEach((mesh, i) => {
      const def = g.def[i];
      if (!def) return;
      const rec = { i, id: def.id, hp: g.hp[i] };
      const meta = b.meta.get(i);
      if (meta) rec.orient = meta.orient;
      const chest = b.chests.get(i);
      if (chest) rec.chest = chest.slots;
      const tray = b.outputs.get(i);
      if (tray && tray.count) rec.tray = tray.slots;
      const queue = b.queues.get(i);
      if (queue && queue.jobs.length) rec.jobs = queue.jobs.map(j => ({ out: j.recipe.out, left: j.left }));
      structures.push(rec);
    });

    return {
      v: 1,
      cycle: { day: this.game.cycle.day, t: this.game.cycle.t, raided: this.game.cycle.raidLaunched },
      player: {
        x: this.game.player.position.x, z: this.game.player.position.z, yaw: this.game.player.yaw,
        hp: this.game.player.hp, hunger: this.game.player.hunger, torch: this.game.player.torchFuel
      },
      inv: this.game.economy.inv.slots,
      armor: this.game.equip.worn.armor,
      hand: this.game.equip.hand,
      core: { cell: this.game.core.cell, carrying: this.game.core.carrying, carriedHp: this.game.core.carriedHp },
      structures,
      nodes: this.game.resources.nodes.map(n => ({
        id: n.def.id, cx: n.cx, cy: n.cy, growth: n.growth, hp: n.hp, cd: n.cooldown
      })),
      packs: this.game.packs.list.map(p => ({ x: p.x, z: p.z, items: p.inv.slots, life: p.life, kind: p.kind })),
      handJobs: this.game.handQueue.jobs.map(j => ({ out: j.recipe.out, left: j.left })),
      stats: this.game.stats
    };
  }

  restore(s) {
    if (!s || s.v !== 1) return false;
    const g = this.game.grid, b = this.game.build;

    // Wipe the world without any farewell animations.
    for (const e of this.game.enemies) e.dispose();
    this.game.enemies.length = 0;
    this.game.fx.clear();
    this.game.packs.clear();
    for (const n of this.game.resources.nodes) n.dispose(true);
    this.game.resources.nodes.length = 0;
    b.reset();
    this.game.bars.clear();
    this.game.core.stow();

    for (const rec of s.structures) {
      const def = STRUCTURES[rec.id];
      if (!def) continue;
      const cx = rec.i % g.w, cy = (rec.i / g.w) | 0;
      if (rec.orient !== undefined) b.meta.set(rec.i, { orient: rec.orient });
      b.create(cx, cy, def);
      g.hp[rec.i] = rec.hp;
      if (rec.chest) b.outputAt && b.chests.set(rec.i, Object.assign(new Inventory(CONFIG.station.chestSlots), { slots: rec.chest }));
      if (rec.tray) b.outputAt(rec.i).slots = rec.tray;
      if (rec.jobs) {
        const q = b.queueAt(rec.i);
        q.jobs = rec.jobs.map(j => this._job(j));
      }
    }
    b.placed.forEach((mesh, i) => b.refresh(i % g.w, (i / g.w) | 0));

    for (const rec of s.nodes) {
      const def = RESOURCES[rec.id];
      if (!def) continue;
      const node = this.game.resources.plantAt(def, rec.cx, rec.cy, rec.growth);
      if (node) { node.hp = rec.hp; node.cooldown = rec.cd || 0; }
    }

    this.game.economy.inv.slots = s.inv.map(e => e || null);
    this.game.equip.worn.armor = s.armor || null;
    this.game.equip.hand = s.hand || 0;
    this.game.handQueue.jobs = (s.handJobs || []).map(j => this._job(j));

    this.game.core.cell = s.core.cell;
    this.game.core.carriedHp = s.core.carriedHp;
    if (s.core.carrying) { this.game.core.cell = -1; this.game.core.liftSilently(s.core.carriedHp); }

    for (const rec of s.packs || []) this.game.packs.restore(rec);

    this.game.player.position.set(s.player.x, 0, s.player.z);
    this.game.player.yaw = s.player.yaw;
    this.game.player.hp = s.player.hp;
    this.game.player.hunger = s.player.hunger;
    this.game.player.torchFuel = s.player.torch || 0;
    this.game.player.downed = false;
    this.game.player.object.visible = true;
    this.game.cycle.day = s.cycle.day;
    this.game.cycle.t = s.cycle.t;
    this.game.cycle.raidLaunched = s.cycle.raided;
    this.game.cycle.lastLight = -1;
    this.game.stats = s.stats || this.game.stats;

    this.game.path.dirty = true;
    for (const id in this.game.fields) this.game.fields[id].sig = "";
    this.game.economy._sync();
    this.game.onLoadoutChanged();
    this.game.ui.setHp(this.game.player.hp / CONFIG.player.maxHp);
    this.game.running = true;
    this.game.ui.showOverlay(false);
    return true;
  }

  _job(rec) {
    const recipe = RECIPES.find(r => r.out === rec.out) || RECIPES[0];
    return { recipe, left: rec.left, total: recipe.time, done: rec.left <= 0 };
  }

  /* ---- storage ---------------------------------------------------------- */

  save(quiet) {
    try {
      localStorage.setItem(CONFIG.save.key, JSON.stringify(this.snapshot()));
      if (!quiet) this.game.ui.toast("Saved");
      return true;
    } catch (e) {
      // Private mode, a full quota, or a sandboxed page: keep it in memory so
      // the run at least survives a restart within this session.
      this._memorySave = this.snapshot();
      if (!quiet) this.game.ui.toast("Saved in memory only - storage unavailable");
      return false;
    }
  }

  /**
   * Nothing here may throw. A half-written or corrupt save used to take the
   * whole boot down with it - the parse sat outside the guard - and the game
   * simply never appeared.
   */
  load() {
    let data = null;
    try {
      const raw = localStorage.getItem(CONFIG.save.key) ||
                  localStorage.getItem(CONFIG.save.legacyKey);
      data = raw ? JSON.parse(raw) : this._memorySave;
    } catch (e) {
      this.wipe();
      this.game.ui.toast("Saved game was unreadable - starting fresh");
      return false;
    }
    if (!data) return false;
    try { return this.restore(data); }
    catch (e) {
      reportError(e);
      this.wipe();
      this.game.ui.toast("Saved game could not be restored - starting fresh");
      return false;
    }
  }

  has() {
    try {
      return !!(localStorage.getItem(CONFIG.save.key) ||
                localStorage.getItem(CONFIG.save.legacyKey));
    } catch (e) { return !!this._memorySave; }
  }

  wipe() {
    try {
      localStorage.removeItem(CONFIG.save.key);
      localStorage.removeItem(CONFIG.save.legacyKey);
    } catch (e) {}
    this._memorySave = null;
  }
}
