import { ITEMS } from "../data/items.js";
import { makeItemEntry } from "../data/recipes.js";

/**
 * A workbench output tray. Finished goods always land here - never in a
 * distant backpack - and the bench stalls once it is full, so an unattended
 * workbench can only run so far ahead.
 */
export class BenchOutput {
  constructor(size) { this.slots = new Array(size).fill(null); }
  get full() { return this.slots.every(Boolean); }
  get count() { return this.slots.filter(Boolean).length; }
  /** Stacks onto a matching slot first; a full tray is what stalls the queue. */
  tryPut(id) {
    const def = ITEMS[id];
    if (def.stack > 1) {
      for (const entry of this.slots) {
        if (entry && entry.id === id && entry.count < def.stack) { entry.count++; return true; }
      }
    }
    const i = this.slots.indexOf(null);
    if (i < 0) return false;
    this.slots[i] = makeItemEntry(id, 1);
    return true;
  }
  take(index, inv) {
    const entry = this.slots[index];
    if (!entry) return false;
    if (inv.putEntry(entry)) { this.slots[index] = null; return true; }
    // No room for the whole stack: hand over as much as fits.
    if (entry.count > 1) {
      const before = entry.count;
      const left = inv.add(entry.id, entry.count);
      if (left < before) { entry.count = left; if (!left) this.slots[index] = null; return true; }
    }
    return false;
  }
}

/**
 * A craft queue. Materials are taken when the job is queued, the item arrives
 * when the timer runs out. The player carries one queue in their hands; every
 * workbench has its own, which keeps running while you are away.
 */
export class CraftQueue {
  constructor(game, sink) {
    this.game = game;
    this.jobs = [];
    this.sink = sink || null;      // null = straight into the player's hands
  }
  get stalled() {
    const job = this.jobs[0];
    return !!(job && job.done);
  }
  get busy() { return this.jobs.length > 0; }
  get current() { return this.jobs[0] || null; }

  enqueue(recipe) {
    this.jobs.push({ recipe, left: recipe.time, total: recipe.time, done: false });
  }

  /** Cancel refunds in full: nothing has been consumed but time. */
  cancel(index) {
    const job = this.jobs[index];
    if (!job || job.done) return false;
    this.jobs.splice(index, 1);
    this.game.economy.addAll(job.recipe.cost);
    return true;
  }

  update(dt) {
    const job = this.jobs[0];
    if (!job) return;
    if (!job.done) {
      job.left -= dt * (this.speed || 1);
      if (job.left <= 0) { job.left = 0; job.done = true; }
    }
    if (job.done && this._deliver(job)) this.jobs.shift();
  }

  /** Finished goods wait in the queue until the sink accepts them. */
  _deliver(job) {
    const id = job.recipe.out;
    const batch = job.recipe.count || 1;
    if (this.sink) {
      for (let n = 0; n < batch; n++) if (!this.sink.tryPut(id)) return false;   // tray full: it waits
      return true;
    }
    const inv = this.game.economy.inv;
    if (!inv.hasRoom(id)) return false;
    inv.add(id, batch);
    this.game.economy._sync();
    this.game.ui.toast("Crafted " + ITEMS[id].label);
    return true;
  }

  progress() {
    const job = this.jobs[0];
    return job ? 1 - job.left / job.total : 0;
  }
}
