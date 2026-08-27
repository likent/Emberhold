import { clamp, costText } from "../core/util.js";
import { CONFIG } from "../data/config.js";
import { ITEMS, ITEM_DESC, HOTBAR_SIZE, SLOTS, SLOT_LABEL, MATERIAL_LABEL } from "../data/items.js";
import { RECIPES } from "../data/recipes.js";
import { STRUCTURES } from "../data/structures.js";
import { paintIcons } from "./icons.js";

export class UI {
  constructor(game) {
    this.game = game;
    paintIcons();
    this.panel = document.getElementById("invPanel");
    this.equipRow = document.getElementById("equipRow");
    this.invGrid = document.getElementById("invGrid");
    this.craftList = document.getElementById("craftList");
    this.hotbarEl = document.getElementById("hotbar");
    this.paletteOpen = true;
    this.ghost = document.getElementById("dragGhost");
    this.drag = null;
    this.modal = document.getElementById("itemModal");
    this.modal.addEventListener("pointerdown", e => {
      e.preventDefault(); e.stopPropagation();
      this.modal.classList.remove("show");
    });
    this.tab = "bag";
    this.hpFill = document.getElementById("hpFill");
    this.hungerFill = document.getElementById("hungerFill");
    this.hungerPill = document.getElementById("hungerPill");
    this.waveNum = document.getElementById("waveNum");
    this.waveTimer = document.getElementById("waveTimer");
    this.waveCard = document.getElementById("waveCard");
    this.enemyCount = document.getElementById("enemyCount");
    this.buildBtn = document.getElementById("buildBtn");
    this.debugBtn = document.getElementById("debugBtn");
    this.paletteEl = document.getElementById("palette");
    this.toastEl = document.getElementById("toast");
    this.overlay = document.getElementById("overlay");
    this.chips = {};
    this._toastTimer = 0;
    this._buildPalette();
  }

  /**
   * Two levels: the strip holds one chip per category, tapping it opens the
   * variants above. With four wall materials a flat list ran off the screen.
   */
  _buildPalette() {
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
      this.bindCell(el, () => this.openVariants(cat), null);
      this.paletteEl.appendChild(el);
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
      const affordable = this.game.canAffordPlacement(def);
      row.className = "variant" + (affordable ? "" : " poor") +
                      (this.game.build.selected === def ? " on" : "");
      row.innerHTML = '<span class="nm">' + def.label + "</span>" +
                      '<span class="hp">' + def.hp + " hp</span>" +
                      '<span class="cost">' + costText(def.cost) + "</span>";
      this.bindCell(row,
        () => {
          this.game.build.select(def.id);
          sub.classList.remove("show");
          this.openCat = null;
          this.refreshPalette();
          this.togglePalette(false);
        },
        () => this.structureInfo(def));
      sub.appendChild(row);
    }
    sub.classList.add("show");
  }

  closeVariants() {
    document.getElementById("paletteSub").classList.remove("show");
    this.openCat = null;
  }

  setHp(k) { this.hpFill.style.width = (clamp(k, 0, 1) * 100) + "%"; }
  setHunger(k) {
    this.hungerFill.style.width = (clamp(k, 0, 1) * 100) + "%";
    this.hungerPill.classList.toggle("starving", k <= 0.2);
  }
  /* ---- backpack, hotbar and crafting ------------------------------------
   * Cells are drawn from the inventory on demand. Slots 0..3 are the hotbar
   * and are rendered outside the panel, so they stay reachable in a fight. */

  _cell(entry, extra) {
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
  bindCell(el, onTap, onHold, slot) {
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
    el.addEventListener("pointercancel", e => { clear(); this._cancelDrag(); dragging = false; start = null; });
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
    this._cancelDrag();
    if (!target) return;
    this.game.slots.move(from, target.dataset.slot);
  }

  _cancelDrag() {
    if (this.drag && this.drag.el) this.drag.el.classList.remove("dragSrc");
    document.querySelectorAll(".dropTarget").forEach(el => el.classList.remove("dropTarget"));
    this.ghost.classList.remove("show");
    this.drag = null;
  }

  showItemInfo(def, extra) {
    document.getElementById("modalIcon").dataset.icon = def.icon || "gem";
    document.getElementById("modalIcon").style.color = def.tint || "var(--text)";
    paintIcons(document.getElementById("modalIcon").parentElement);
    document.getElementById("modalName").textContent = def.label;
    document.getElementById("modalKind").textContent = (extra && extra.kind) || def.kind || "";
    const stats = document.getElementById("modalStats");
    const chips = (extra && extra.stats) || this._statChips(def);
    if (extra && extra.entry && extra.entry.dur !== undefined) {
      chips.unshift(Math.ceil(extra.entry.dur) + " / " + def.durability + " durability");
    }
    stats.innerHTML = chips
      .map(s => "<span>" + s + "</span>").join("");
    document.getElementById("modalDesc").textContent =
      ((extra && extra.desc) || ITEM_DESC[def.id] || "") +
      (def.durability ? "  " + ITEM_DESC.__wear : "");
    // Anything the player is actually carrying can be put down deliberately.
    const drop = document.getElementById("modalDrop");
    const slot = extra && extra.slot;
    const droppable = slot !== undefined && slot !== null && !String(slot).startsWith("chest:");
    drop.classList.toggle("hidden", !droppable);
    if (droppable) {
      const n = extra.entry && extra.entry.count > 1 ? extra.entry.count + " " : "";
      drop.textContent = "Drop " + n + def.label.toLowerCase();
      this.bindCell(drop, () => { this.game.slots.drop(slot); this.modal.classList.remove("show"); }, null);
    }
    this.modal.classList.add("show");
  }

  _statChips(def) {
    const out = [];
    if (def.damage) out.push(def.damage + " damage");
    if (def.repairRate) out.push(def.repairRate + " hp/s repair");
    if (def.harvest) {
      for (const k in def.harvest) {
        if (def.harvest[k] > 0) out.push("x" + def.harvest[k] + " " + MATERIAL_LABEL[k]);
      }
    }
    if (def.armor) out.push(Math.round(def.armor * 100) + "% damage taken off");
    if (def.speed && def.speed !== 1) out.push(Math.round((1 - def.speed) * 100) + "% slower");
    if (def.stack > 1) out.push("stacks to " + def.stack);
    const recipe = RECIPES.find(r => r.out === def.id);
    if (recipe) out.push("craft: " + costText(recipe.cost));
    return out;
  }

  structureInfo(def) {
    const stats = [def.hp + " hp"];
    if (def.item) stats.push("carried x" + this.game.economy.inv.count(def.item));
    else stats.push("build: " + costText(def.cost));
    if (def.pathCost !== undefined) stats.push("detour value: " + def.pathCost + "s");
    if (def.hp && !def.trap) {
      for (const id in CONFIG.enemyTypes) {
        const t = CONFIG.enemyTypes[id];
        stats.push(t.label + " breaks in " + (def.hp / t.dpsVsStructure).toFixed(1) + "s");
      }
    }
    if (def.blocksPlayer === false) stats.push("you can walk through");
    if (def.range) stats.push("range " + def.range);
    this.showItemInfo(def, { kind: def.trap ? "trap" : def.item ? "deployable" : "building block", stats });
  }

  toggleBackpack() {
    const open = !this.panel.classList.contains("show");
    this.panel.classList.toggle("show", open);
    document.getElementById("bagBtn").classList.toggle("on", open);
    if (open) this.refreshBackpack();
  }

  showTab(name) {
    this.tab = name;
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.dataset.tab === name));
    document.getElementById("tabBag").classList.toggle("hidden", name !== "bag");
    document.getElementById("tabCraft").classList.toggle("hidden", name !== "craft");
    document.getElementById("tabStats").classList.toggle("hidden", name !== "stats");
    document.getElementById("tabBench").classList.toggle("hidden", name !== "bench");
    document.getElementById("tabFurnace").classList.toggle("hidden", name !== "furnace");
    document.getElementById("tabCook").classList.toggle("hidden", name !== "cook");
    document.getElementById("tabChest").classList.toggle("hidden", name !== "chest");
    document.getElementById("tabPack").classList.toggle("hidden", name !== "pack");
    this.refreshBackpack();
  }

  /** Always visible, so it refreshes on every inventory change. */
  /**
   * Left rail: what the player's own hands are busy with.
   * The rows are only rebuilt when the queue itself changes - redrawing this
   * every frame meant minting new SVG nodes sixty times a second, which is
   * exactly the sort of churn a phone runs out of memory over.
   */
  refreshCraftHud() {
    const hud = document.getElementById("craftHud");
    const queue = this.game.handQueue;
    this.game._craftHudShown = queue.busy;
    hud.classList.toggle("show", queue.busy);
    if (!queue.busy) { hud.innerHTML = ""; this._craftHudKey = ""; return; }

    const key = queue.jobs.map(j => j.recipe.out).join(",");
    if (key === this._craftHudKey) {
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
    this._craftHudKey = key;
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
      this.bindCell(row, () => {
        if (this.game.handQueue.cancel(index)) { this.toast("Cancelled"); this.refreshCraftHud(); }
      }, null);
      hud.appendChild(row);
    });
  }

  refreshHotbar() {
    const eq = this.game.equip, inv = this.game.economy.inv;
    this.hotbarEl.innerHTML = "";
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const entry = inv.slots[i];
      const cell = this._cell(entry, null);
      cell.classList.toggle("sel", eq.hand === i);
      cell.dataset.slot = i;
      cell.insertAdjacentHTML("afterbegin", '<span class="key">' + (i + 1) + "</span>");
      this.bindCell(cell,
        () => {
          eq.selectHand(i);
          // A deployable in hand means you intend to put it down.
          const def = entry && ITEMS[entry.id];
          if (def && def.kind === "deployable") this.game.selectBuildingFromBag(def.structure);
        },
        entry ? () => this.showItemInfo(ITEMS[entry.id], { entry, slot: i }) : null,
        i);
      this.hotbarEl.appendChild(cell);
    }
  }

  refreshBackpack() {
    this.refreshHotbar();
    if (!this.panel.classList.contains("show")) return;
    const eco = this.game.economy, eq = this.game.equip;

    // The chest tab only exists while you are standing at one.
    const chest = this.game.stations.chestInv() && this.game.stations.nearest("storage") ? this.game.stations.chestInv() : null;
    document.querySelector('[data-tab="chest"]').classList.toggle("hidden", !chest);
    if (this.tab === "chest" && !chest) { this.showTab("bag"); return; }

    const sack = this.game.packs.nearest() ? this.game.packs.openInv() : null;
    document.querySelector('[data-tab="pack"]').classList.toggle("hidden", !sack);
    if (this.tab === "pack" && !sack) { this.showTab("bag"); return; }

    // The workbench tab exists only while you are standing at one.
    const bench = this.game.stations.nearest("craft");
    document.querySelector('[data-tab="bench"]').classList.toggle("hidden", !bench);
    if (this.tab === "bench" && !bench) { this.showTab("craft"); return; }

    const furnace = this.game.stations.nearest("smelt");
    document.querySelector('[data-tab="furnace"]').classList.toggle("hidden", !furnace);
    if (this.tab === "furnace" && !furnace) { this.showTab("craft"); return; }

    const fire = this.game.stations.nearest("cook");
    document.querySelector('[data-tab="cook"]').classList.toggle("hidden", !fire);
    if (this.tab === "cook" && !fire) { this.showTab("craft"); return; }

    if (this.tab === "craft") { this._renderCraft(eco, eq); return; }
    if (this.tab === "stats") { this._renderStats(eco, eq); return; }
    if (this.tab === "bench") { this._renderStation(eco, eq, bench, "craft", "benchOut", "benchList"); return; }
    if (this.tab === "furnace") { this._renderStation(eco, eq, furnace, "smelt", "furnaceOut", "furnaceList"); return; }
    if (this.tab === "cook") { this._renderStation(eco, eq, fire, "cook", "cookOut", "cookList"); return; }
    if (this.tab === "chest") { this._renderChest(chest); return; }
    if (this.tab === "pack") { this._renderPack(sack); return; }

    this.equipRow.innerHTML = "";

    // The weapon is not a slot any more: it is whatever the hotbar has
    // selected, shown here read-only so the loadout reads at a glance.
    const held = eq.handEntry();
    const handCell = this._cell(held, { name: true });
    handCell.classList.add("gear", "readonly");
    if (!held) handCell.innerHTML = '<span class="slotName">In hand</span>';
    this.bindCell(handCell, null, held ? () => this.showItemInfo(ITEMS[held.id], { entry: held, slot: eq.hand }) : null);
    this.equipRow.appendChild(handCell);

    for (const slot of SLOTS) {
      const entry = eq.worn[slot];
      const id = entry && entry.id;
      const cell = this._cell(entry, { name: true });
      cell.classList.add("gear");
      if (!id) cell.innerHTML = '<span class="slotName">' + SLOT_LABEL[slot] + "</span>";
      cell.dataset.slot = slot;
      this.bindCell(cell,
        () => { if (eq.unequip(slot)) this.refreshBackpack(); },
        entry ? () => this.showItemInfo(ITEMS[entry.id], { entry, slot }) : null,
        slot);
      this.equipRow.appendChild(cell);
    }

    this.invGrid.innerHTML = "";
    for (let index = HOTBAR_SIZE; index < eco.inv.size; index++) {
      const entry = eco.inv.slots[index];
      const cell = this._cell(entry, null);
      cell.dataset.slot = index;
      const def = entry && ITEMS[entry.id];
      // Moving between bag and hotbar is a drag now; tapping only arms a
      // deployable or puts armour on, which are not slot moves.
      this.bindCell(cell,
        entry ? () => {
          if (def.kind === "deployable") this.game.selectBuildingFromBag(def.structure);
          else if (def.slot === "armor" && eq.equipArmor(index)) this.refreshBackpack();
        } : null,
        entry ? () => this.showItemInfo(def, { entry, slot: index }) : null,
        index);
      this.invGrid.appendChild(cell);
    }
  }

  /**
   * Both containers are on screen together, otherwise there is nothing to
   * drag between. A plain tap moves one stack across, which is far easier
   * than dragging on a phone.
   */
  _renderChest(chest) {
    const grid = document.getElementById("chestGrid");
    grid.innerHTML = "";
    chest.slots.forEach((entry, index) => {
      const cell = this._cell(entry, null);
      cell.dataset.slot = "chest:" + index;
      this.bindCell(cell,
        entry ? () => { this.game.slots.quickMove("chest:" + index); } : null,
        entry ? () => this.showItemInfo(ITEMS[entry.id], { entry }) : null,
        "chest:" + index);
      grid.appendChild(cell);
    });

    const bagGrid = document.getElementById("chestBagGrid");
    bagGrid.innerHTML = "";
    this.game.economy.inv.slots.forEach((entry, index) => {
      const cell = this._cell(entry, null);
      cell.dataset.slot = index;
      if (index < HOTBAR_SIZE) cell.insertAdjacentHTML("afterbegin", '<span class="key">' + (index + 1) + "</span>");
      this.bindCell(cell,
        entry ? () => { this.game.slots.quickMove(String(index)); } : null,
        entry ? () => this.showItemInfo(ITEMS[entry.id], { entry }) : null,
        index);
      bagGrid.appendChild(cell);
    });
  }

  /** Craft tab: only what the player can make with their hands. */
  /** Same two-grid layout as the chest, so a sack reads like any container. */
  _renderPack(sack) {
    const grid = document.getElementById("packGrid");
    grid.innerHTML = "";
    sack.slots.forEach((entry, index) => {
      const cell = this._cell(entry, null);
      cell.dataset.slot = "pack:" + index;
      this.bindCell(cell,
        entry ? () => { this.game.slots.quickMove("pack:" + index, sack); this.refreshBackpack(); } : null,
        entry ? () => this.showItemInfo(ITEMS[entry.id], { entry }) : null,
        "pack:" + index);
      grid.appendChild(cell);
    });

    const bagGrid = document.getElementById("packBagGrid");
    bagGrid.innerHTML = "";
    this.game.economy.inv.slots.forEach((entry, index) => {
      const cell = this._cell(entry, null);
      cell.dataset.slot = index;
      if (index < HOTBAR_SIZE) cell.insertAdjacentHTML("afterbegin", '<span class="key">' + (index + 1) + "</span>");
      this.bindCell(cell,
        entry ? () => { this.game.slots.quickMove(String(index), sack); this.refreshBackpack(); } : null,
        entry ? () => this.showItemInfo(ITEMS[entry.id], { entry, slot: index }) : null,
        index);
      bagGrid.appendChild(cell);
    });
  }

  _renderCraft(eco, eq) {
    this._renderRecipes(this.craftList, RECIPES.filter(r => !r.station), eco, eq);
    this._renderQueue(this.game.handQueue, "In your hands", this.craftList);
  }

  /** One renderer for every station: tray on top, its recipes, its queue. */
  _renderStation(eco, eq, station, kind, outId, listId) {
    const bench = station;
    const tray = this.game.build.outputAt(bench.i);
    const queue = this.game.build.queueAt(bench.i);

    const out = document.getElementById(outId);
    out.innerHTML = "";
    tray.slots.forEach((entry, index) => {
      const cell = this._cell(entry, null);
      if (entry) cell.classList.add("ready");
      this.bindCell(cell,
        entry ? () => {
          if (tray.take(index, this.game.economy.inv)) {
            this.game.economy._sync();
            this.game.onLoadoutChanged();
            this.refreshBackpack();
          } else this.toast("Backpack full");
        } : null,
        entry ? () => this.showItemInfo(ITEMS[entry.id], { entry }) : null);
      out.appendChild(cell);
    });

    const list = document.getElementById(listId);
    const tier = station.tier || (station.def && station.def.tier) || 1;
    this._renderRecipes(list, RECIPES.filter(r => r.station === kind && (r.tier || 1) <= tier), eco, eq);
    if (kind === "craft" && tier >= 2) this._renderGearRepair(eco, eq, list);
    if (kind === "craft") this._renderSalvage(eco, list);
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
    this._renderQueue(queue, "Queue", list);
  }

  _renderRecipes(list, recipes, eco, eq) {
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
        "<span>" + this._gearSummary(def) + "</span>";
      paintIcons(row);
      this.bindCell(row,
        () => { if (this.game.economy.craft(recipe)) this.refreshBackpack(); },
        () => this.showItemInfo(def));
      list.appendChild(row);
    }
  }

  /**
   * Everything that actually decides how the run goes: what the current
   * loadout does, and what the run has amounted to so far.
   */
  _renderStats(eco, eq) {
    const list = document.getElementById("statsList");
    const g = this.game;
    list.innerHTML = "";
    const head = t => {
      const h = document.createElement("div");
      h.className = "invBar"; h.textContent = t;
      list.appendChild(h);
    };
    const row = (k, v, weak) => {
      const r = document.createElement("div");
      r.className = "statRow" + (weak ? " weak" : "");
      r.innerHTML = '<span class="k">' + k + '</span><span class="v">' + v + "</span>";
      list.appendChild(r);
    };
    const dur = entry => entry && entry.dur !== undefined
      ? Math.ceil(entry.dur) + " / " + ITEMS[entry.id].durability : "-";

    const hand = eq.handItem(), handEntry = eq.handEntry();
    head("In hand");
    row("Item", hand ? hand.label : "bare hands", !hand);
    row("Damage per swing", eq.damage);
    if (hand && hand.ranged) {
      row("Shot damage", hand.ranged.damage + " at range " + hand.ranged.range);
      row("Arrows", eco.inv.count("arrow"));
    }
    row("Wood / stone / ore", eq.harvestFor("wood") + " / " + eq.harvestFor("stone") + " / " + eq.harvestFor("ore"));
    if (hand && hand.durability) row("Condition", dur(handEntry));

    const armour = eq.item("armor");
    head("Worn");
    row("Armour", armour ? armour.label : "none", !armour);
    row("Damage taken", Math.round((1 - eq.armor) * 100) + "%");
    row("Move speed", (CONFIG.player.speed * eq.speedMul * (g.core.carrying ? CONFIG.core.carrySpeed : 1)).toFixed(1) +
        (g.core.carrying ? " (carrying the core)" : ""));
    if (armour && armour.durability) row("Condition", dur(eq.worn.armor));

    head("Body");
    row("Health", Math.max(0, Math.round(g.player.hp)) + " / " + CONFIG.player.maxHp);
    row("Food", Math.round(g.player.hunger) + " / " + CONFIG.hunger.max);
    row("Reach", CONFIG.player.attack.range);
    row("Repair rate", eq.repairRate ? eq.repairRate + " hp/s" : "no hammer in hand", !eq.repairRate);

    head("Pathfinding");
    row("Raiders target", g.huntPlayer ? "you" : "the core");
    row("Field rebuilds", g._pathStats.rate.toFixed(1) + " / s");
    row("Cost per rebuild", g._pathStats.avg.toFixed(2) + " ms");
    row("Live classes", Object.keys(g.fields).filter(id => g._classActive(id)).length);

    head("Save");
    const saveRow = (label, value, fn) => {
      const r = document.createElement("div");
      r.className = "statRow";
      r.innerHTML = '<span class="k">' + label + '</span><span class="v" style="color:var(--accent)">' + value + "</span>";
      this.bindCell(r, fn, null);
      list.appendChild(r);
    };
    saveRow("Progress", g.saves.has() ? "stored" : "not stored yet", null);
    saveRow("Save now", "save", () => { g.saves.save(); this.refreshBackpack(); });
    saveRow("Start over", "wipe", () => { g.saves.wipe(); g.restart(); this.toggleBackpack(); });

    head("This run");
    row("Day", g.cycle.day + (g.cycle.isNight ? " (night)" : ""));
    row("Raiders killed", g.stats.kills);
    row("Structures placed", g.stats.built);
    row("Trees planted", g.stats.planted);
    row("Times downed", g.stats.deaths);
    const got = g.stats.gathered;
    const keys = Object.keys(got);
    row("Gathered", keys.length ? keys.map(k => got[k] + " " + k).join(", ") : "nothing yet", !keys.length);
  }

  /**
   * Worn gear can be brought back at a reinforced bench, for a share of what
   * it cost to make. Walls have always been repairable; tools never were.
   */
  _renderGearRepair(eco, eq, list) {
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
      this.bindCell(row,
        () => { if (this.game.gear.repair(entry)) this.refreshBackpack(); },
        () => this.showItemInfo(def, { entry }));
      list.appendChild(row);
    }
  }

  /** Anything craftable that you are carrying can be taken apart again. */
  _renderSalvage(eco, list) {
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
      this.bindCell(row,
        () => { if (this.game.gear.salvage(index)) this.refreshBackpack(); },
        () => this.showItemInfo(def, { entry, slot: index }));
      list.appendChild(row);
    }
  }

  /** Shared renderer for both queues; tapping a job cancels it. */
  _renderQueue(queue, title, list) {
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
      this.bindCell(row, () => {
        if (queue.cancel(index)) { this.toast("Cancelled, materials returned"); this.refreshBackpack(); }
      }, null);
      list.appendChild(row);
    });
  }

  _gearSummary(def) {
    const bits = [];
    if (def.damage) bits.push(def.damage + " dmg");
    if (def.repairRate) bits.push(def.repairRate + " hp/s repair");
    if (def.harvest) {
      const best = Object.keys(def.harvest).filter(k => def.harvest[k] >= 1.5)
        .map(k => "x" + def.harvest[k] + " " + MATERIAL_LABEL[k]);
      if (best.length) bits.push(best.join(", "));
    }
    if (def.armor) bits.push(Math.round(def.armor * 100) + "% armor");
    return bits.join(" / ");
  }

  /** The action button wears whatever is in hand, so it reads at a glance. */
  setActionIcon(item) {
    const btn = document.getElementById("actionBtn");
    const icon = item && item.icon ? item.icon : "fist";
    if (btn.dataset.icon === icon) return;
    btn.dataset.icon = icon;
    btn.title = item ? "Use " + item.label : "Bare hands";
    paintIcons(btn.parentElement);
  }

  setCoreButton(mode) {
    const btn = document.getElementById("coreBtn");
    btn.classList.toggle("hidden", !mode);
    btn.classList.toggle("on", mode === "drop");
    if (!mode) return;
    btn.dataset.icon = mode === "drop" ? "coreDown" : "coreLift";
    btn.title = mode === "drop" ? "Set the core down" : "Carry the core";
    paintIcons(btn.parentElement);
  }
  setRespawn(t) {
    this.toastEl.classList.toggle("show", t > 0);
    if (t > 0) this.toastEl.textContent = "Down - respawning in " + Math.ceil(t) + "s";
  }
  setInvulnerable(on) { this.hpFill.style.background = on ? "var(--accent)" : "var(--hp)"; }
  setResources(res, infinite) {
    this.refreshPalette();
    this.refreshHotbar();
  }

  /** Each category chip shows which variant is armed and whether it is affordable. */
  refreshPalette() {
    const selected = this.game.build.selected;
    for (const cat in this.chips) {
      const list = this.categories[cat];
      const mine = list.indexOf(selected) >= 0 ? selected : null;
      const shown = mine || list[0];
      const chip = this.chips[cat];
      chip.querySelector(".sub").textContent = mine ? mine.label : costText(shown.cost);
      chip.classList.toggle("on", !!mine);
      chip.classList.toggle("poor", !list.some(d => this.game.canAffordPlacement(d)));
    }
  }
  setSandbox(on) {
    document.getElementById("sandboxBtn").classList.toggle("on", on);
    document.getElementById("waveBtn").classList.toggle("hidden", !on);
    document.getElementById("hordeBtn").classList.toggle("hidden", !on);
    document.getElementById("debugBtn").classList.toggle("hidden", !on);
  }
  setCycle(day, night, t, paused) {
    this.waveNum.textContent = day;
    const icon = document.getElementById("phaseIcon");
    const want = night ? "moon" : "sun";
    if (icon.dataset.icon !== want) { icon.dataset.icon = want; paintIcons(icon.parentElement); }
    this.waveCard.classList.toggle("paused", !!paused);
    this.waveCard.classList.toggle("night", night);
    if (paused) {
      this.waveTimer.textContent = "paused";
      this.waveCard.classList.remove("imminent");
      return;
    }
    const s = Math.max(0, Math.ceil(t));
    this.waveTimer.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    // Amber as dusk closes in: that is the cue to be behind your walls.
    this.waveCard.classList.toggle("imminent", !night && s <= 25);
  }
  setEnemies(n) { this.enemyCount.textContent = n; }
  setBuildMode(on) {
    this.buildBtn.classList.toggle("on", on);
    document.getElementById("placeBtn").classList.toggle("hidden", !on);
    document.getElementById("pickBtn").classList.toggle("hidden", !on);
    // Entering build mode opens the drawer so there is something to choose
    // from; picking an entry closes it again.
    this.paletteOpen = on;
    if (on) this.refreshPalette(); else this.closeVariants();
    this.paletteEl.classList.toggle("show", on);
    document.getElementById("pickBtn").classList.toggle("on", on && this.paletteOpen);
  }

  /** The picker is a drawer: it opens on demand and closes once you choose. */
  togglePalette(force) {
    this.paletteOpen = force !== undefined ? force : !this.paletteOpen;
    const on = this.game.build.active && this.paletteOpen;
    this.paletteEl.classList.toggle("show", on);
    document.getElementById("pickBtn").classList.toggle("on", on);
    if (on) this.refreshPalette(); else this.closeVariants();
  }
  setSelectedStructure(id) {
    for (const key in this.chips) this.chips[key].classList.toggle("on", key === id);
  }
  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove("show"), 1500);
  }
  showOverlay(show, title, text) {
    if (title) this.overlay.querySelector("h1").textContent = title;
    if (text) this.overlay.querySelector("p").textContent = text;
    this.overlay.classList.toggle("show", show);
  }
}
