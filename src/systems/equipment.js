import { ITEMS, HOTBAR_SIZE, BARE } from "../data/items.js";

/**
 * What the player is wearing and holding. The hand is not a slot of its own:
 * it is whichever hotbar cell is selected, so swapping tools is a tap.
 */
export class Equipment {
  constructor(game) {
    this.game = game;
    this.worn = { armor: null };
    this.hand = 0;
  }
  reset() { this.worn.armor = null; this.hand = 0; }

  /**
   * Called whenever what is worn or held changes, so the visible weapon, the
   * action icon and the armed deployable all match the hand again.
   */
  changed() {
    if (this.game.player) this.game.player.refreshWeaponMesh();
    this.game.ui.refreshBackpack();
    this.game.ui.setActionIcon(this.handItem());
    this.game.build.syncSelection();
  }

  handEntry() { return this.game.economy.inv.slots[this.hand]; }
  handItem() {
    const e = this.handEntry();
    return e ? ITEMS[e.id] : null;
  }
  _held(key) {
    const it = this.handItem();
    return it && it[key] !== undefined ? it[key] : BARE[key];
  }
  item(slot) { return this.worn[slot] ? ITEMS[this.worn[slot].id] : null; }
  _wornStat(key) {
    const it = this.item("armor");
    return it && it[key] !== undefined ? it[key] : BARE[key];
  }

  get damage() { return this._held("damage"); }

  /** Zero unless a hammer is in hand: mending is a deliberate loadout choice. */
  get repairRate() {
    const it = this.handItem();
    return it && it.repairRate ? it.repairRate : 0;
  }

  /** Tools are good at one thing: a pick on ore, an axe on trees. */
  harvestFor(material) {
    const it = this.handItem();
    const table = (it && it.harvest) || BARE.harvest;
    const value = table[material || "wood"];
    return value === undefined ? BARE.harvest[material || "wood"] || 0 : value;
  }
  get armor() { return this._wornStat("armor"); }
  get speedMul() { return this._wornStat("speed"); }

  selectHand(i) {
    if (i < 0 || i >= HOTBAR_SIZE) return;
    this.hand = i;
    this.changed();     // fires even on a re-tap, to resync the UI
  }

  /** Bag tap: armour goes on the body, anything else into the active hand slot. */
  takeFrom(index) {
    const inv = this.game.economy.inv;
    const entry = inv.slots[index];
    if (!entry) return false;
    const def = ITEMS[entry.id];
    if (def.slot === "armor") return this.equipArmor(index);
    inv.swap(index, this.hand);
    this.changed();
    return true;
  }

  equipArmor(index) {
    const inv = this.game.economy.inv;
    const entry = inv.slots[index];
    if (!entry || ITEMS[entry.id].slot !== "armor") return false;
    const previous = this.worn.armor;
    inv.slots[index] = previous || null;      // straight swap keeps durability
    this.worn.armor = entry;
    this.changed();
    return true;
  }

  unequip(slot) {
    const entry = this.worn[slot];
    if (!entry) return false;
    const inv = this.game.economy.inv;
    const free = inv.slots.findIndex((s, i) => !s && i >= HOTBAR_SIZE);
    const target = free >= 0 ? free : inv.slots.findIndex(s => !s);
    if (target < 0) { this.game.ui.toast("Backpack full"); return false; }
    this.worn[slot] = null;
    inv.slots[target] = entry;
    this.changed();
    return true;
  }

  /* ---- wear ------------------------------------------------------------
   * Held gear loses a point per swing, armour loses one per few points of
   * damage it soaked. Nothing is repairable: gear is a consumable. */

  wearHand(amount) {
    const entry = this.handEntry();
    if (!entry || entry.dur === undefined) return;
    entry.dur -= amount;
    if (entry.dur <= 0) {
      this.game.economy.inv.slots[this.hand] = null;
      this.game.ui.toast(ITEMS[entry.id].label + " broke");
      this.changed();
    } else {
      this.game.ui.refreshHotbar();
    }
  }

  wearArmor(amount) {
    const entry = this.worn.armor;
    if (!entry || entry.dur === undefined) return;
    entry.dur -= amount;
    if (entry.dur <= 0) {
      this.worn.armor = null;
      this.game.ui.toast(ITEMS[entry.id].label + " fell apart");
      this.changed();
    }
  }
}
