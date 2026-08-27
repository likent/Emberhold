import { CONFIG } from "../data/config.js";
import { MATS, GEO } from "../data/materials.js";
import { makeItemEntry } from "../data/recipes.js";
import { Inventory } from "./inventory.js";

/**
 * Sacks on the ground. Dying costs you everything you were carrying, but not
 * permanently: it lies where you fell until you walk back for it. A harvest
 * that will not fit in the backpack spills into one of these too, which is
 * why felling a tree with a full pack no longer bins the wood.
 */
export class PackSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.open = null;         // the sack the pack tab is showing
    this._btnOn = undefined;
  }

  /** Everything the player had, dumped where they fell. */
  dropCarried(x, z) {
    const inv = this.game.economy.inv;
    const carried = [];
    for (let i = 0; i < inv.size; i++) {
      if (inv.slots[i]) { carried.push(inv.slots[i]); inv.slots[i] = null; }
    }
    const worn = this.game.equip.worn;
    if (worn.armor) { carried.push(worn.armor); worn.armor = null; }
    if (!carried.length) return;
    this.dropItemsAt(x, z, carried, "death");
    this.game.economy._sync();
    this.game.equip.changed();
    this.game.ui.toast("You dropped everything you carried");
  }

  /**
   * Hands over what fits and leaves the rest on the ground. Felling a tree
   * with a full pack used to destroy the tree and silently bin the wood.
   */
  giveOrDrop(id, count, x, z) {
    const left = this.game.economy.inv.add(id, count);
    this.game.economy._sync();
    if (left > 0) this.dropItemsAt(x, z, [makeItemEntry(id, left)]);
    return count - left;
  }

  /** Adds to a sack already lying nearby, or starts a new one. */
  dropItemsAt(x, z, entries, kind) {
    let pack = null;
    for (const p of this.list) {
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < 9) { pack = p; break; }
    }
    if (!pack) {
      const mesh = new THREE.Mesh(GEO.bagBody, MATS.hide);
      mesh.position.set(x, 0.45, z);
      mesh.castShadow = true;
      this.game.scene.add(mesh);
      pack = {
        x, z, mesh, bob: Math.random() * 6, kind: kind || "drop",
        inv: new Inventory(CONFIG.station.chestSlots)
      };
      pack.life = kind === "death" ? CONFIG.packs.deathLife : CONFIG.packs.dropLife;
      this.list.push(pack);
    }
    // Anything added keeps the sack around for its full span again.
    if (kind === "death") { pack.kind = "death"; pack.life = CONFIG.packs.deathLife; }
    else pack.life = Math.max(pack.life, CONFIG.packs.dropLife);
    for (const entry of entries) {
      if (!pack.inv.putEntry(entry)) pack.inv.add(entry.id, entry.count);
    }
    return pack;
  }

  nearest() {
    const p = this.game.player;
    if (!p || p.downed) return null;
    let best = null, bestD = CONFIG.station.range * CONFIG.station.range;
    for (const pack of this.list) {
      const d = (pack.x - p.position.x) ** 2 + (pack.z - p.position.z) ** 2;
      if (d < bestD) { bestD = d; best = pack; }
    }
    return best;
  }

  /** Opens the sack at your feet, the same way a chest opens. */
  openNearest() {
    const pack = this.nearest();
    if (!pack) return;
    this.open = pack;
    const ui = this.game.ui;
    ui.showTab("pack");
    if (!ui.panel.classList.contains("show")) ui.toggleBackpack();
  }

  /** The inventory behind the pack tab, or null once the sack is gone. */
  openInv() {
    const pack = this.open;
    return pack && this.list.indexOf(pack) >= 0 ? pack.inv : null;
  }

  /** Empties whatever fits straight into the backpack. */
  recover() {
    const pack = this.open || this.nearest();
    if (!pack) return;
    const inv = this.game.economy.inv;
    let left = 0;
    for (let i = 0; i < pack.inv.size; i++) {
      const entry = pack.inv.slots[i];
      if (!entry) continue;
      if (inv.putEntry(entry)) pack.inv.slots[i] = null;
      else left++;
    }
    this.game.economy._sync();
    this.game.equip.changed();
    this.clearEmpty();
    if (!left) this.game.ui.toast("Sack emptied");
    else this.game.ui.toast(left + " stacks left, sack rots in " + Math.ceil(pack.life) + "s");
    this.game.ui.refreshBackpack();
  }

  clearEmpty() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.inv.slots.some(Boolean)) continue;
      this.game.scene.remove(p.mesh);
      if (this.open === p) this.open = null;
      this.list.splice(i, 1);
    }
  }

  update(dt) {
    const ui = this.game.ui;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const pack = this.list[i];
      pack.bob += dt * 2.2;
      pack.mesh.position.y = 0.45 + Math.sin(pack.bob) * 0.07;
      pack.mesh.rotation.y += dt * 0.5;

      pack.life -= dt;
      if (pack.life <= 0) {
        this.game.fx.playCollapse(pack.mesh);
        this.list.splice(i, 1);
        continue;
      }
      // The last stretch is visible: it shrinks and blinks before it goes.
      if (pack.life < CONFIG.packs.warnAt) {
        const k = pack.life / CONFIG.packs.warnAt;
        pack.mesh.scale.setScalar(0.55 + k * 0.45);
        pack.mesh.visible = pack.life > 12 || Math.sin(pack.life * 9) > -0.3;
      }
    }
    const near = this.nearest();
    if (!!near !== this._btnOn) {
      this._btnOn = !!near;
      document.getElementById("packBtn").classList.toggle("hidden", !near);
      if (ui.panel.classList.contains("show")) ui.refreshBackpack();
    }
    if (near && this.open !== near && !ui.panel.classList.contains("show")) {
      this.open = near;      // the button always opens the closest one
    }
    if (!near) this.open = null;
  }

  /** Rebuilds one sack from a save record. */
  restore(rec) {
    const mesh = new THREE.Mesh(GEO.bagBody, MATS.hide);
    mesh.position.set(rec.x, 0.45, rec.z);
    mesh.castShadow = true;
    this.game.scene.add(mesh);
    const inv = new Inventory(CONFIG.station.chestSlots);
    (rec.items || []).forEach((e, i) => { if (e) { if (i < inv.size) inv.slots[i] = e; else inv.putEntry(e); } });
    this.list.push({
      x: rec.x, z: rec.z, mesh, inv, bob: 0,
      kind: rec.kind || "drop",
      life: rec.life !== undefined ? rec.life
        : (rec.kind === "death" ? CONFIG.packs.deathLife : CONFIG.packs.dropLife)
    });
  }

  /** Takes every sack out of the world: a restart, or a save being loaded. */
  clear() {
    for (const pack of this.list) this.game.scene.remove(pack.mesh);
    this.list.length = 0;
    this.open = null;
  }
}
