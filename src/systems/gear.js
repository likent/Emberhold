import { ITEMS } from "../data/items.js";
import { RECIPES } from "../data/recipes.js";
import { costText } from "../core/util.js";

/**
 * Keeping tools alive, and letting go of the ones you have outgrown. Both
 * prices are read off the recipe that made the item, so a new tier needs no
 * numbers of its own here.
 */
export class GearSystem {
  constructor(game) { this.game = game; }

  /**
   * Breaking gear down returns half the recipe, scaled by what is left of it.
   * Outgrown tools stop being dead weight and become the next tier's wood.
   */
  salvagePrice(entry) {
    const def = ITEMS[entry.id];
    const recipe = RECIPES.find(r => r.out === entry.id);
    const out = {};
    if (!recipe) return out;
    const condition = def.durability ? 0.4 + 0.6 * (entry.dur / def.durability) : 1;
    for (const k in recipe.cost) {
      const n = Math.floor(recipe.cost[k] * 0.5 * condition / (recipe.count || 1));
      if (n > 0) out[k] = n;
    }
    return out;
  }

  salvage(slot) {
    const s = this.game.slots.resolve(slot);
    if (!s || s.inv !== this.game.economy.inv) return false;
    const entry = s.inv.slots[s.index];
    if (!entry) return false;
    const parts = this.salvagePrice(entry);
    s.inv.slots[s.index] = null;
    for (const k in parts) this.game.packs.giveOrDrop(k, parts[k], this.game.player.position.x, this.game.player.position.z);
    this.game.economy._sync();
    this.game.onLoadoutChanged();
    this.game.ui.toast(Object.keys(parts).length
      ? "Broke it down: +" + costText(parts)
      : "Broke it down, nothing usable left");
    return true;
  }

  /** Restoring gear costs 70% of the recipe, scaled to how worn it is. */
  repairPrice(entry) {
    const def = ITEMS[entry.id];
    const recipe = RECIPES.find(r => r.out === entry.id);
    const missing = 1 - entry.dur / def.durability;
    const price = {};
    if (!recipe) return price;
    for (const k in recipe.cost) {
      const n = Math.ceil(recipe.cost[k] * missing * 0.7);
      if (n > 0) price[k] = n;
    }
    return price;
  }

  repair(entry) {
    const def = ITEMS[entry.id];
    const price = this.repairPrice(entry);
    if (!this.game.economy.canAfford(price)) { this.game.ui.toast("Not enough materials"); return false; }
    this.game.economy.spend(price);
    entry.dur = def.durability;
    this.game.onLoadoutChanged();
    this.game.ui.toast(def.label + " restored");
    return true;
  }
}
