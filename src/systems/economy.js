import { CONFIG } from "../data/config.js";
import { Inventory } from "./inventory.js";

/**
 * Materials live in the backpack; this is the spending view over it, so build
 * costs, repairs and crafting all draw from the same slots the player sees.
 */
export class Economy {
  constructor(game) {
    this.game = game;
    this.inv = new Inventory(CONFIG.inventory.slots, true);
    this.infinite = CONFIG.sandbox.enabled;    // mirrors game.sandbox
  }
  /**
   * What a run starts with: bare hands and a little wood. The club costs five
   * wood and four seconds by hand, so the first thing you do is make your own
   * - a free starter weapon skipped that step and never wore out, since it was
   * built without a durability entry at all.
   */
  reset() {
    this.inv.clear();
    this.inv.add("wood", CONFIG.economy.startWood);
    this.inv.add("stone", CONFIG.economy.startStone);
    this.game.equip.hand = 0;
    this._sync();
    this.game.equip.changed();
  }
  add(key, n) {
    if (n <= 0) return;
    const left = this.inv.add(key, n);
    if (left > 0) this.game.ui.toast("Backpack full - " + left + " " + key + " lost");
    this._sync();
  }
  addAll(cost) { for (const k in cost) this.add(k, cost[k]); }
  canAfford(cost) {
    if (this.infinite) return true;
    for (const k in cost) if (this.inv.count(k) < cost[k]) return false;
    return true;
  }
  spend(cost) {
    if (this.infinite) return;
    for (const k in cost) this.inv.remove(k, cost[k]);
    this._sync();
  }
  craft(recipe) {
    const station = recipe.station ? this.game.stations.nearest(recipe.station) : null;
    if (recipe.station && !station) { this.game.ui.toast("Needs a workbench"); return false; }
    if (station && (recipe.tier || 1) > (station.tier || station.def.tier || 1)) {
      this.game.ui.toast("Needs a reinforced bench");
      return false;
    }
    if (!this.canAfford(recipe.cost)) { this.game.ui.toast("Not enough materials"); return false; }
    const queue = station ? this.game.build.queueAt(station.i) : this.game.handQueue;
    if (queue.jobs.length >= CONFIG.craft.maxQueue) { this.game.ui.toast("Queue is full"); return false; }
    this.spend(recipe.cost);
    queue.enqueue(recipe);
    return true;
  }
  setInfinite(on) { this.infinite = on; this._sync(); }
  /** The bag changed: what you can afford to build, and what the bag shows. */
  _sync() {
    this.game.palette.refresh();
    this.game.panel.refresh();
  }
}
