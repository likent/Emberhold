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
    this.res = { wood: 0, stone: 0 };          // read-only mirror for the HUD
    this.infinite = CONFIG.sandbox.enabled;    // mirrors game.sandbox
  }
  reset() {
    this.inv.clear();
    this.inv.add("wood", CONFIG.economy.startWood);
    this.inv.add("stone", CONFIG.economy.startStone);
    this._sync();
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
  _sync() {
    this.res.wood = this.inv.count("wood");
    this.res.stone = this.inv.count("stone");
    this.game.ui.setResources(this.res, this.infinite);
    this.game.ui.refreshBackpack();
  }
}
