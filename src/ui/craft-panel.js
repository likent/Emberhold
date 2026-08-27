import { costText } from "../core/util.js";
import { ITEMS } from "../data/items.js";
import { RECIPES } from "../data/recipes.js";
import { paintIcons } from "./icons.js";

/**
 * Everything being made: the recipe lists, the station trays, both queues and
 * the rail of jobs in the corner. Repair and salvage live here too - they are
 * priced off the same recipes, and they are offered at the same bench.
 */
export class CraftPanel {
  constructor(game) {
    this.game = game;
    this.cells = game.ui.cells;
    this.card = game.ui.card;
    this.list = document.getElementById("craftList");
  }

  /** The rail only redraws while there is something to show on it. */
  tickHud() {
    if (this.game.handQueue.busy || this._hudShown) this.refreshHud();
  }

  /**
   * Left rail: what the player's own hands are busy with.
   * The rows are only rebuilt when the queue itself changes - redrawing this
   * every frame meant minting new SVG nodes sixty times a second, which is
   * exactly the sort of churn a phone runs out of memory over.
   */
  refreshHud() {
    const hud = document.getElementById("craftHud");
    const queue = this.game.handQueue;
    this._hudShown = queue.busy;
    hud.classList.toggle("show", queue.busy);
    if (!queue.busy) { hud.innerHTML = ""; this._hudKey = ""; return; }

    const key = queue.jobs.map(j => j.recipe.out).join(",");
    if (key === this._hudKey) {
      // Same jobs: just move the bar and the countdown.
      const job = queue.jobs[0], first = hud.firstChild;
      if (job && first) {
        const meter = first.querySelector(".meter > i");
        if (meter) meter.style.width = ((1 - job.left / job.total) * 100).toFixed(0) + "%";
        const secs = first.querySelector(".secs");
        if (secs) secs.textContent = Math.ceil(job.left) + "s";
      }
      return;
    }
    this._hudKey = key;
    hud.innerHTML = "";
    queue.jobs.forEach((job, index) => {
      const def = ITEMS[job.recipe.out];
      const row = document.createElement("div");
      row.className = "job" + (index ? " pending" : "");
      const pct = index === 0 ? (1 - job.left / job.total) * 100 : 0;
      row.innerHTML =
        '<span class="glyph" data-icon="' + def.icon + '" style="color:' + def.tint + '"></span>' +
        (index === 0
          ? '<span class="meter"><i style="width:' + pct.toFixed(0) + '%"></i></span>' +
            '<span class="secs">' + Math.ceil(job.left) + "s</span>"
          : '<span class="queued">queued</span>');
      paintIcons(row);
      this.cells.bind(row, () => {
        if (this.game.handQueue.cancel(index)) { this.game.ui.toast("Cancelled"); this.refreshHud(); }
      }, null);
      hud.appendChild(row);
    });
  }

  /** Craft tab: only what the player can make with their hands. */
  renderHand(eco, eq) {
    this._recipes(this.list, RECIPES.filter(r => !r.station), eco, eq);
    this._queue(this.game.handQueue, "In your hands", this.list);
  }

  /** One renderer for every station: tray on top, its recipes, its queue. */
  renderStation(eco, eq, station, kind, outId, listId) {
    const bench = station;
    const tray = this.game.build.outputAt(bench.i);
    const queue = this.game.build.queueAt(bench.i);

    const out = document.getElementById(outId);
    out.innerHTML = "";
    tray.slots.forEach((entry, index) => {
      const cell = this.cells.make(entry, null);
      if (entry) cell.classList.add("ready");
      this.cells.bind(cell,
        entry ? () => {
          if (tray.take(index, this.game.economy.inv)) {
            this.game.economy._sync();
            this.game.equip.changed();
            this.game.panel.refresh();
          } else this.game.ui.toast("Backpack full");
        } : null,
        entry ? () => this.card.show(ITEMS[entry.id], { entry }) : null);
      out.appendChild(cell);
    });

    const list = document.getElementById(listId);
    const tier = station.tier || (station.def && station.def.tier) || 1;
    this._recipes(list, RECIPES.filter(r => r.station === kind && (r.tier || 1) <= tier), eco, eq);
    if (kind === "craft" && tier >= 2) this._repair(eco, eq, list);
    if (kind === "craft") this._salvage(eco, list);
    if (kind === "craft" && tier < 2 && RECIPES.some(r => r.station === kind && (r.tier || 1) > tier)) {
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = "Steel work needs a reinforced bench.";
      list.insertBefore(note, list.firstChild);
    }
    if (queue.stalled) {
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = "Output tray is full - take something out to restart the bench.";
      list.insertBefore(note, list.firstChild);
    }
    this._queue(queue, "Queue", list);
  }

  _recipes(list, recipes, eco, eq) {
    list.innerHTML = "";
    let group = null;
    for (const recipe of recipes) {
      if (recipe.group !== group) {
        group = recipe.group;
        const head = document.createElement("div");
        head.className = "invBar";
        head.textContent = group;
        list.appendChild(head);
      }
      const def = ITEMS[recipe.out];
      const row = document.createElement("div");
      const affordable = eco.canAfford(recipe.cost);
      const worn = def.slot && eq.worn[def.slot] && eq.worn[def.slot].id === def.id;
      row.className = "recipe" + (affordable ? "" : " poor") + (worn ? " worn" : "");
      row.innerHTML =
        '<span class="glyph" data-icon="' + def.icon + '" style="color:' + def.tint + '"></span>' +
        "<span style=\"flex:1\">" + def.label + (recipe.count ? " x" + recipe.count : "") +
        '<span class="cost"> - ' + costText(recipe.cost) + " - " + recipe.time + "s</span></span>" +
        "<span>" + this.card.summary(def) + "</span>";
      paintIcons(row);
      this.cells.bind(row,
        () => { if (this.game.economy.craft(recipe)) this.game.panel.refresh(); },
        () => this.card.show(def));
      list.appendChild(row);
    }
  }

  /**
   * Worn gear can be brought back at a reinforced bench, for a share of what
   * it cost to make. Walls have always been repairable; tools never were.
   */
  _repair(eco, eq, list) {
    const damaged = [];
    eco.inv.slots.forEach((entry, index) => {
      if (entry && entry.dur !== undefined && entry.dur < ITEMS[entry.id].durability) {
        damaged.push({ entry, where: "bag" });
      }
    });
    const worn = eq.worn.armor;
    if (worn && worn.dur !== undefined && worn.dur < ITEMS[worn.id].durability) {
      damaged.push({ entry: worn, where: "worn" });
    }
    if (!damaged.length) return;

    const head = document.createElement("div");
    head.className = "invBar";
    head.textContent = "Repair";
    list.appendChild(head);

    for (const { entry, where } of damaged) {
      const def = ITEMS[entry.id];
      const price = this.game.gear.repairPrice(entry);
      const row = document.createElement("div");
      const affordable = eco.canAfford(price);
      row.className = "recipe" + (affordable ? "" : " poor");
      row.innerHTML =
        '<span class="glyph" data-icon="' + def.icon + '" style="color:' + def.tint + '"></span>' +
        '<span style="flex:1">' + def.label + (where === "worn" ? " (worn)" : "") +
        '<span class="cost"> - ' + Math.ceil(entry.dur) + " / " + def.durability + "</span></span>" +
        "<span>" + (Object.keys(price).length ? costText(price) : "free") + "</span>";
      paintIcons(row);
      this.cells.bind(row,
        () => { if (this.game.gear.repair(entry)) this.game.panel.refresh(); },
        () => this.card.show(def, { entry }));
      list.appendChild(row);
    }
  }

  /** Anything craftable that you are carrying can be taken apart again. */
  _salvage(eco, list) {
    const rows = [];
    eco.inv.slots.forEach((entry, index) => {
      if (!entry) return;
      const def = ITEMS[entry.id];
      if (def.kind !== "gear" || !RECIPES.some(r => r.out === entry.id)) return;
      rows.push({ entry, index, def });
    });
    if (!rows.length) return;

    const head = document.createElement("div");
    head.className = "invBar";
    head.textContent = "Break down";
    list.appendChild(head);

    for (const { entry, index, def } of rows) {
      const parts = this.game.gear.salvagePrice(entry);
      const row = document.createElement("div");
      row.className = "recipe";
      row.innerHTML =
        '<span class="glyph" data-icon="' + def.icon + '" style="color:' + def.tint + '"></span>' +
        '<span style="flex:1">' + def.label +
        (entry.dur !== undefined ? '<span class="cost"> - ' + Math.ceil(entry.dur) + " / " + def.durability + "</span>" : "") +
        "</span><span>" + (Object.keys(parts).length ? "+" + costText(parts) : "nothing") + "</span>";
      paintIcons(row);
      this.cells.bind(row,
        () => { if (this.game.gear.salvage(index)) this.game.panel.refresh(); },
        () => this.card.show(def, { entry, slot: index }));
      list.appendChild(row);
    }
  }

  /** Shared renderer for both queues; tapping a job cancels it. */
  _queue(queue, title, list) {
    if (!queue.busy) return;
    const head = document.createElement("div");
    head.className = "invBar";
    head.textContent = title;
    list.appendChild(head);
    queue.jobs.forEach((job, index) => {
      const def = ITEMS[job.recipe.out];
      const row = document.createElement("div");
      row.className = "recipe";
      const pct = index === 0 ? (1 - job.left / job.total) * 100 : 0;
      row.innerHTML =
        '<span class="glyph" data-icon="' + def.icon + '" style="color:' + def.tint + '"></span>' +
        "<span style=\"flex:1\">" + def.label +
        '<span class="cost"> - ' + (index === 0 ? Math.ceil(job.left) + "s left" : "queued") + "</span></span>" +
        '<span class="meter"><i style="width:' + pct.toFixed(0) + '%"></i></span>';
      paintIcons(row);
      this.cells.bind(row, () => {
        if (queue.cancel(index)) { this.game.ui.toast("Cancelled, materials returned"); this.game.panel.refresh(); }
      }, null);
      list.appendChild(row);
    });
  }
}
