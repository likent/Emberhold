import { ITEMS } from "../data/items.js";
import { paintIcons } from "./icons.js";

/**
 * A cell is the one widget the whole inventory is built from: it draws an
 * item, and it answers a tap, a hold and a drag. Drop targets are found with
 * elementFromPoint, so the hotbar, the bag, a chest and a sack interchange
 * freely without any of them knowing about the others.
 */
export class Cells {
  constructor(game) {
    this.game = game;
    this.ghost = document.getElementById("dragGhost");
    this.drag = null;
  }

  make(entry, extra) {
    const cell = document.createElement("div");
    const def = entry ? ITEMS[entry.id] : null;
    cell.className = "cell" + (entry ? " filled" : "") + (def && def.kind === "gear" ? " gear" : "");
    if (def) {
      const wear = entry.dur !== undefined && def.durability
        ? '<span class="dur"><i style="width:' +
          Math.max(0, Math.min(100, (entry.dur / def.durability) * 100)) + '%"></i></span>'
        : "";
      cell.innerHTML =
        '<span class="glyph" data-icon="' + def.icon + '" style="color:' + def.tint + '"></span>' +
        (extra && extra.name ? '<span class="nm">' + def.label + "</span>" : "") +
        (def.stack > 1 ? '<span class="qty">' + entry.count + "</span>" : "") + wear;
      paintIcons(cell);
    }
    return cell;
  }

  /**
   * One gesture handler per cell: tap on release, hold for the info card,
   * drag past a few pixels to move the stack. Drop targets are found with
   * elementFromPoint, so hotbar and bag interchange freely.
   */
  bind(el, onTap, onHold, slot) {
    let timer = null, held = false, dragging = false, start = null;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };

    el.addEventListener("pointerdown", e => {
      e.preventDefault(); e.stopPropagation();
      held = false; dragging = false;
      start = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      if (onHold) timer = setTimeout(() => { held = true; onHold(); }, 460);
    });

    el.addEventListener("pointermove", e => {
      if (!start || held) return;
      if (!dragging) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 9) return;
        if (slot === undefined || !this._slotHasItem(slot)) return;
        clear();
        dragging = true;
        this._beginDrag(slot, el);
      }
      this._moveDrag(e.clientX, e.clientY);
    });

    const finish = e => {
      clear();
      if (dragging) { this._endDrag(e.clientX, e.clientY); dragging = false; }
      else if (!held && onTap) onTap();
      start = null;
    };
    el.addEventListener("pointerup", e => { e.preventDefault(); e.stopPropagation(); finish(e); });
    el.addEventListener("pointercancel", e => { clear(); this.cancelDrag(); dragging = false; start = null; });
  }

  _slotHasItem(slot) {
    if (slot === "armor") return !!this.game.equip.worn.armor;
    const s = this.game.slots.resolve(slot);
    return !!(s && s.inv.slots[s.index]);
  }

  _beginDrag(slot, el) {
    const s = slot === "armor" ? null : this.game.slots.resolve(slot);
    const entry = slot === "armor" ? this.game.equip.worn.armor : s.inv.slots[s.index];
    const def = ITEMS[entry.id];
    this.drag = { from: slot, el };
    el.classList.add("dragSrc");
    this.ghost.innerHTML = '<span class="glyph" data-icon="' + def.icon +
                           '" style="color:' + def.tint + '"></span>';
    paintIcons(this.ghost);
    this.ghost.classList.add("show");
  }

  _moveDrag(x, y) {
    this.ghost.style.left = x + "px";
    this.ghost.style.top = y + "px";
    const target = this._targetAt(x, y);
    document.querySelectorAll(".dropTarget").forEach(el => el.classList.remove("dropTarget"));
    if (target) target.classList.add("dropTarget");
  }

  _targetAt(x, y) {
    this.ghost.style.display = "none";
    const el = document.elementFromPoint(x, y);
    this.ghost.style.display = "";
    const cell = el && el.closest("[data-slot]");
    return cell && cell !== this.drag.el ? cell : null;
  }

  _endDrag(x, y) {
    const target = this._targetAt(x, y);
    const from = this.drag.from;
    this.cancelDrag();
    if (!target) return;
    this.game.slots.move(from, target.dataset.slot);
  }

  /** Public: the pause screen has to drop a drag that is still in the air. */
  cancelDrag() {
    if (this.drag && this.drag.el) this.drag.el.classList.remove("dragSrc");
    document.querySelectorAll(".dropTarget").forEach(el => el.classList.remove("dropTarget"));
    this.ghost.classList.remove("show");
    this.drag = null;
  }
}
