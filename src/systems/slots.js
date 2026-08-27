import { ITEMS } from "../data/items.js";

/**
 * Moving item entries between containers - backpack, chest, sack, the worn
 * slot and the ground. Slot ids are strings so every container can share one
 * drag system, and entries are always moved rather than rebuilt from an id:
 * a copy would hand back a fully repaired tool every time.
 */
export class SlotMoves {
  constructor(game) { this.game = game; }

  /**
   * Slot ids are strings so containers can share one drag system:
   * "3" is a backpack slot, "chest:7" a chest slot, "armor" the worn slot.
   */
  resolve(id) {
    if (id === "armor") return null;
    const s = String(id);
    if (s.startsWith("chest:")) {
      const inv = this.game.stations.chestInv();
      return inv ? { inv, index: parseInt(s.slice(6), 10) } : null;
    }
    if (s.startsWith("pack:")) {
      const inv = this.game.packs.openInv();
      return inv ? { inv, index: parseInt(s.slice(5), 10) } : null;
    }
    return { inv: this.game.economy.inv, index: parseInt(s, 10) };
  }

  move(from, to) {
    const eq = this.game.equip;
    if (String(from) === String(to)) return;

    if (to === "armor") {
      const src = this.resolve(from);
      if (src && src.inv === this.game.economy.inv) eq.equipArmor(src.index);
      return;
    }
    if (from === "armor") {
      const dst = this.resolve(to);
      const entry = eq.worn.armor;
      if (!entry || !dst) return;
      const other = dst.inv.slots[dst.index];
      if (other && ITEMS[other.id].slot !== "armor") { this.game.ui.toast("That slot is taken"); return; }
      eq.worn.armor = other && dst.inv === this.game.economy.inv ? other : null;
      if (other && dst.inv !== this.game.economy.inv) { this.game.ui.toast("That slot is taken"); return; }
      dst.inv.slots[dst.index] = entry;
      this.game.equip.changed();
      return;
    }

    const src = this.resolve(from), dst = this.resolve(to);
    if (!src || !dst) return;
    const a = src.inv.slots[src.index], b = dst.inv.slots[dst.index];
    if (!a) return;
    // Same stackable item: top the target up. A full target has nothing to
    // merge into, so fall through to a plain swap rather than doing nothing.
    const room = b && b.id === a.id && ITEMS[a.id].stack > 1 ? ITEMS[a.id].stack - b.count : 0;
    if (room > 0) {
      const moved = Math.min(room, a.count);
      b.count += moved; a.count -= moved;
      if (a.count <= 0) src.inv.slots[src.index] = null;
    } else {
      src.inv.slots[src.index] = b || null;
      dst.inv.slots[dst.index] = a;
    }
    this.game.economy._sync();          // the HUD mirror and build affordability
    this.game.equip.changed();
  }

  /** One tap sends a stack to the other container. */
  quickMove(slotId, other) {
    const box = other || this.game.stations.chestInv();
    if (!box) return;
    const src = this.resolve(slotId);
    if (!src) return;
    const entry = src.inv.slots[src.index];
    if (!entry) return;
    const target = src.inv === box ? this.game.economy.inv : box;
    // Move the entry itself, not a fresh copy: rebuilding it from id and
    // count would hand back a fully repaired tool every time.
    if (target.putEntry(entry)) {
      src.inv.slots[src.index] = null;
    } else {
      const left = target.add(entry.id, entry.count);
      if (left >= entry.count) { this.game.ui.toast("No room"); return; }
      if (left > 0) entry.count = left;
      else src.inv.slots[src.index] = null;
    }
    this.game.economy._sync();
    this.game.equip.changed();
    this.game.packs.clearEmpty();
  }

  /** Sends every material stack in the backpack to the open chest. */
  storeAll() {
    const chest = this.game.stations.chestInv();
    if (!chest) return;
    const inv = this.game.economy.inv;
    let moved = 0;
    for (let i = 0; i < inv.size; i++) {
      const entry = inv.slots[i];
      if (!entry || ITEMS[entry.id].kind !== "material") continue;
      const left = chest.add(entry.id, entry.count);
      moved += entry.count - left;
      if (left <= 0) inv.slots[i] = null;
      else entry.count = left;
    }
    this.game.ui.toast(moved ? "Stored " + moved : "Chest is full");
    this.game.economy._sync();
    this.game.equip.changed();
  }

  /** Puts one slot's contents on the ground in front of the player. */
  drop(slot) {
    let entry = null;
    if (slot === "armor") {
      entry = this.game.equip.worn.armor;
      if (entry) this.game.equip.worn.armor = null;
    } else {
      const s = this.resolve(slot);
      if (!s || s.inv !== this.game.economy.inv) return;
      entry = s.inv.slots[s.index];
      if (entry) s.inv.slots[s.index] = null;
    }
    if (!entry) return;
    const p = this.game.player.position;
    this.game.packs.dropItemsAt(p.x + Math.sin(this.game.player.yaw) * 1.4, p.z + Math.cos(this.game.player.yaw) * 1.4, [entry]);
    this.game.economy._sync();
    this.game.equip.changed();
    this.game.panel.refresh();
    this.game.ui.toast("Dropped " + ITEMS[entry.id].label.toLowerCase());
  }
}
