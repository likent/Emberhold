import { ITEMS, HOTBAR_SIZE } from "../data/items.js";
import { makeItemEntry } from "../data/recipes.js";

/** Fixed-slot container with stacking. Slots 0..3 double as the hotbar. */
export class Inventory {
  constructor(size, hotbarAware) {
    this.size = size;
    this.hotbarAware = !!hotbarAware;   // chests have no hotbar to protect
    this.slots = new Array(size).fill(null);
  }
  clear() { this.slots.fill(null); }

  /**
   * Existing stacks are topped up first, wherever they sit - berries you are
   * holding should grow as you pick more. Only a brand new stack prefers the
   * bag, because the quick slots are the player's to arrange.
   */
  add(id, count) {
    const def = ITEMS[id];
    if (!def) return count;
    let left = count;

    for (let i = 0; i < this.size && left > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < def.stack) {
        const put = Math.min(def.stack - s.count, left);
        s.count += put; left -= put;
      }
    }

    const ranges = this.hotbarAware
      ? [[HOTBAR_SIZE, this.size], [0, HOTBAR_SIZE]]   // bag first, hotbar as overflow
      : [[0, this.size]];
    for (const [from, to] of ranges) {
      for (let i = from; i < to && left > 0; i++) {
        if (this.slots[i]) continue;
        const put = Math.min(def.stack, left);
        this.slots[i] = this.makeEntry(id, put);
        left -= put;
      }
    }
    return left;
  }

  makeEntry(id, count) { return makeItemEntry(id, count); }

  /** Files an existing entry (keeping its durability) into the first fit. */
  putEntry(entry) {
    const def = ITEMS[entry.id];
    for (let i = 0; i < this.size; i++) {
      const s = this.slots[i];
      if (s && s.id === entry.id && def.stack > 1 && s.count + entry.count <= def.stack) {
        s.count += entry.count;
        return true;
      }
    }
    const ranges = this.hotbarAware ? [[HOTBAR_SIZE, this.size], [0, HOTBAR_SIZE]] : [[0, this.size]];
    for (const [from, to] of ranges) {
      for (let i = from; i < to; i++) {
        if (!this.slots[i]) { this.slots[i] = entry; return true; }
      }
    }
    return false;
  }

  remove(id, count) {
    let left = count;
    for (let i = 0; i < this.size && left > 0; i++) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const take = Math.min(s.count, left);
      s.count -= take; left -= take;
      if (s.count <= 0) this.slots[i] = null;
    }
    return count - left;
  }

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }
  hasRoom(id) {
    const def = ITEMS[id];
    for (const s of this.slots) {
      if (!s) return true;
      if (s.id === id && s.count < def.stack) return true;
    }
    return false;
  }
  swap(a, b) {
    const t = this.slots[a]; this.slots[a] = this.slots[b]; this.slots[b] = t;
  }
}
