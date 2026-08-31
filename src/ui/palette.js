import { costText } from "../core/util.js";
import { STRUCTURES } from "../data/structures.js";

/**
 * The build picker: a drawer of category chips along the bottom, with the
 * variants of one category above it. It opens when build mode does and closes
 * once you choose, so a thumb never has to hunt for it.
 */
export class Palette {
  constructor(game) {
    this.game = game;
    this.cells = game.ui.cells;
    this.el = document.getElementById("palette");
    this.buildBtn = document.getElementById("buildBtn");
    this.chips = {};
    this.open = true;
    this._build();
  }

  /**
   * Two levels: the strip holds one chip per category, tapping it opens the
   * variants above. With four wall materials a flat list ran off the screen.
   */
  _build() {
    this.categories = {};
    for (const id in STRUCTURES) {
      const def = STRUCTURES[id];
      // Only building blocks live here. Deployables are chosen from the
      // backpack or the hotbar, like anything else you carry.
      if (def.hidden || def.item) continue;
      const cat = def.category || "other";
      (this.categories[cat] = this.categories[cat] || []).push(def);
    }
    const labels = { wall: "Walls", gate: "Gates", station: "Stations", other: "Other" };
    for (const cat in this.categories) {
      const el = document.createElement("div");
      el.className = "chip";
      el.dataset.cat = cat;
      el.innerHTML = labels[cat] + '<span class="sub">-</span>';
      this.cells.bind(el, () => this.openVariants(cat), null);
      this.el.appendChild(el);
      this.chips[cat] = el;
    }
  }

  openVariants(cat) {
    const sub = document.getElementById("paletteSub");
    if (this.openCat === cat && sub.classList.contains("show")) {
      sub.classList.remove("show"); this.openCat = null; return;
    }
    this.openCat = cat;
    sub.innerHTML = "";
    for (const def of this.categories[cat]) {
      const row = document.createElement("div");
      const affordable = this.game.build.canAfford(def);
      row.className = "variant" + (affordable ? "" : " poor") +
                      (this.game.build.selected === def ? " on" : "");
      row.innerHTML = '<span class="nm">' + def.label + "</span>" +
                      '<span class="hp">' + def.hp + " hp</span>" +
                      '<span class="cost">' + costText(def.cost) + "</span>";
      this.cells.bind(row,
        () => {
          this.game.build.select(def.id);
          sub.classList.remove("show");
          this.openCat = null;
          this.refresh();
          this.toggle(false);
        },
        () => this.game.ui.card.structure(def));
      sub.appendChild(row);
    }
    sub.classList.add("show");
  }

  closeVariants() {
    document.getElementById("paletteSub").classList.remove("show");
    this.openCat = null;
  }

  /** Each category chip shows which variant is armed and whether it is affordable. */
  refresh() {
    const selected = this.game.build.selected;
    for (const cat in this.chips) {
      const list = this.categories[cat];
      const mine = list.indexOf(selected) >= 0 ? selected : null;
      const shown = mine || list[0];
      const chip = this.chips[cat];
      chip.querySelector(".sub").textContent = mine ? mine.label : costText(shown.cost);
      chip.classList.toggle("on", !!mine);
      chip.classList.toggle("poor", !list.some(d => this.game.build.canAfford(d)));
    }
  }

  setBuildMode(on) {
    this.buildBtn.classList.toggle("on", on);
    document.getElementById("placeBtn").classList.toggle("hidden", !on);
    document.getElementById("pickBtn").classList.toggle("hidden", !on);
    // Entering build mode opens the drawer so there is something to choose
    // from; picking an entry closes it again.
    this.open = on;
    if (on) this.refresh(); else this.closeVariants();
    this.el.classList.toggle("show", on);
    document.getElementById("pickBtn").classList.toggle("on", on && this.open);
  }

  /** The picker is a drawer: it opens on demand and closes once you choose. */
  toggle(force) {
    this.open = force !== undefined ? force : !this.open;
    const on = this.game.build.active && this.open;
    this.el.classList.toggle("show", on);
    document.getElementById("pickBtn").classList.toggle("on", on);
    if (on) this.refresh(); else this.closeVariants();
  }
  /** Chips are keyed by category, so a structure id has to be resolved first. */
  setSelected(id) {
    const def = STRUCTURES[id];
    const cat = def ? def.category || "other" : null;
    for (const key in this.chips) this.chips[key].classList.toggle("on", key === cat);
  }
}
