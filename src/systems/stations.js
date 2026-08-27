import { CONFIG } from "../data/config.js";

/**
 * Benches, furnaces, campfires and chests: the things you have to stand next
 * to. This owns "what is in reach" - the buttons that appear along the bottom
 * of the screen, and the chest the inventory panel is currently showing.
 */
export class StationSystem {
  constructor(game) {
    this.game = game;
    this.openChestCell = undefined;
    this._btnOn = {};
  }

  /** The best station of a kind in reach - a higher tier always wins. */
  nearest(kind) {
    const p = this.game.player;
    if (!p || p.downed) return null;
    const range = CONFIG.station.range * CONFIG.station.range;
    let best = null, bestD = range, bestTier = -1;
    this.game.build.placed.forEach((mesh, i) => {
      const def = this.game.grid.def[i];
      if (!def || def.station !== kind) return;
      const dx = mesh.position.x - p.position.x, dz = mesh.position.z - p.position.z;
      const d = dx * dx + dz * dz;
      if (d > range) return;
      const tier = def.tier || 1;
      if (tier > bestTier || (tier === bestTier && d < bestD)) {
        bestTier = tier; bestD = d; best = { i, def, mesh, tier };
      }
    });
    return best;
  }

  openChest() {
    const near = this.nearest("storage");
    if (!near) return;
    this.openChestCell = near.i;
    this._openTab("chest");
  }

  openBench() { this._openTab("bench"); }
  openFurnace() { this._openTab("furnace"); }
  openCook() { this._openTab("cook"); }

  chestInv() {
    return this.openChestCell !== undefined ? this.game.build.chests.get(this.openChestCell) : null;
  }

  _openTab(tab) {
    const ui = this.game.ui;
    ui.showTab(tab);
    if (!ui.panel.classList.contains("show")) ui.toggleBackpack();
  }

  /**
   * Walking away from a bench has to close its tab's door: the recipe list
   * is drawn from whatever is in reach, so a stale button would offer a
   * bench that is no longer there.
   */
  update() {
    const nearChest = !!this.nearest("storage");
    if (nearChest !== this._btnOn.storage) {
      this._btnOn.storage = nearChest;
      document.getElementById("chestBtn").classList.toggle("hidden", !nearChest);
    }
    if (!nearChest && this.openChestCell !== undefined) this.openChestCell = undefined;

    this._toggleButton("craft", "benchBtn");
    this._toggleButton("cook", "cookBtn");
    this._toggleButton("smelt", "furnaceBtn");
  }

  _toggleButton(kind, id) {
    const near = !!this.nearest(kind);
    if (near === this._btnOn[kind]) return;
    this._btnOn[kind] = near;
    document.getElementById(id).classList.toggle("hidden", !near);
    if (this.game.ui.panel.classList.contains("show")) this.game.ui.refreshBackpack();
  }
}
