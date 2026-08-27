import { HOTBAR_SIZE, ITEMS, SLOTS, SLOT_LABEL } from "../data/items.js";
import { CraftPanel } from "./craft-panel.js";
import { renderStats } from "./stats.js";

/* Tabs with something ticking on them: everything else only changes when the
 * player does something, and repaints itself then. */
const TIMED_TABS = ["craft", "bench", "cook", "furnace", "stats"];

/**
 * The backpack panel and the hotbar under it. Cells are drawn from the
 * inventory on demand: slots 0..3 are the hotbar and are rendered outside the
 * panel, so they stay reachable in a fight.
 *
 * Which tabs exist is decided here every refresh, because most of them belong
 * to something the player is standing next to and stop existing when they
 * walk away.
 */
export class Panel {
  constructor(game) {
    this.game = game;
    this.cells = game.ui.cells;
    this.card = game.ui.card;
    this.craft = new CraftPanel(game);
    this.el = document.getElementById("invPanel");
    this.equipRow = document.getElementById("equipRow");
    this.invGrid = document.getElementById("invGrid");
    this.hotbarEl = document.getElementById("hotbar");
    this.tab = "bag";
  }

  isOpen() { return this.el.classList.contains("show"); }

  /**
   * The panel does not redraw itself. Only a queue in progress changes on its
   * own, so the tabs that show one are repainted four times a second and the
   * rest not at all.
   */
  tick(dt) {
    this.craft.tickHud();
    this._tick = (this._tick || 0) + dt;
    if (this._tick <= 0.25) return;
    this._tick = 0;
    if (TIMED_TABS.indexOf(this.tab) >= 0 && this.isOpen()) this.refresh();
  }

  toggle() {
    const open = !this.isOpen();
    this.el.classList.toggle("show", open);
    document.getElementById("bagBtn").classList.toggle("on", open);
    if (open) this.refresh();
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
    this.refresh();
  }

  refreshHotbar() {
    const eq = this.game.equip, inv = this.game.economy.inv;
    this.hotbarEl.innerHTML = "";
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const entry = inv.slots[i];
      const cell = this.cells.make(entry, null);
      cell.classList.toggle("sel", eq.hand === i);
      cell.dataset.slot = i;
      cell.insertAdjacentHTML("afterbegin", '<span class="key">' + (i + 1) + "</span>");
      this.cells.bind(cell,
        () => {
          eq.selectHand(i);
          // A deployable in hand means you intend to put it down.
          const def = entry && ITEMS[entry.id];
          if (def && def.kind === "deployable") this.game.build.selectFromBag(def.structure);
        },
        entry ? () => this.card.show(ITEMS[entry.id], { entry, slot: i }) : null,
        i);
      this.hotbarEl.appendChild(cell);
    }
  }

  refresh() {
    this.refreshHotbar();
    if (!this.isOpen()) return;
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

    if (this.tab === "craft") { this.craft.renderHand(eco, eq); return; }
    if (this.tab === "stats") { renderStats(this.game); return; }
    if (this.tab === "bench") { this.craft.renderStation(eco, eq, bench, "craft", "benchOut", "benchList"); return; }
    if (this.tab === "furnace") { this.craft.renderStation(eco, eq, furnace, "smelt", "furnaceOut", "furnaceList"); return; }
    if (this.tab === "cook") { this.craft.renderStation(eco, eq, fire, "cook", "cookOut", "cookList"); return; }
    if (this.tab === "chest") { this._renderChest(chest); return; }
    if (this.tab === "pack") { this._renderPack(sack); return; }
    this._renderBag(eco, eq);
  }

  /** The bag tab: what is worn, what is in hand, and the rest of the sack. */
  _renderBag(eco, eq) {
    this.equipRow.innerHTML = "";

    // The weapon is not a slot any more: it is whatever the hotbar has
    // selected, shown here read-only so the loadout reads at a glance.
    const held = eq.handEntry();
    const handCell = this.cells.make(held, { name: true });
    handCell.classList.add("gear", "readonly");
    if (!held) handCell.innerHTML = '<span class="slotName">In hand</span>';
    this.cells.bind(handCell, null, held ? () => this.card.show(ITEMS[held.id], { entry: held, slot: eq.hand }) : null);
    this.equipRow.appendChild(handCell);

    for (const slot of SLOTS) {
      const entry = eq.worn[slot];
      const id = entry && entry.id;
      const cell = this.cells.make(entry, { name: true });
      cell.classList.add("gear");
      if (!id) cell.innerHTML = '<span class="slotName">' + SLOT_LABEL[slot] + "</span>";
      cell.dataset.slot = slot;
      this.cells.bind(cell,
        () => { if (eq.unequip(slot)) this.refresh(); },
        entry ? () => this.card.show(ITEMS[entry.id], { entry, slot }) : null,
        slot);
      this.equipRow.appendChild(cell);
    }

    this.invGrid.innerHTML = "";
    for (let index = HOTBAR_SIZE; index < eco.inv.size; index++) {
      const entry = eco.inv.slots[index];
      const cell = this.cells.make(entry, null);
      cell.dataset.slot = index;
      const def = entry && ITEMS[entry.id];
      // Moving between bag and hotbar is a drag now; tapping only arms a
      // deployable or puts armour on, which are not slot moves.
      this.cells.bind(cell,
        entry ? () => {
          if (def.kind === "deployable") this.game.build.selectFromBag(def.structure);
          else if (def.slot === "armor" && eq.equipArmor(index)) this.refresh();
        } : null,
        entry ? () => this.card.show(def, { entry, slot: index }) : null,
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
      const cell = this.cells.make(entry, null);
      cell.dataset.slot = "chest:" + index;
      this.cells.bind(cell,
        entry ? () => { this.game.slots.quickMove("chest:" + index); } : null,
        entry ? () => this.card.show(ITEMS[entry.id], { entry }) : null,
        "chest:" + index);
      grid.appendChild(cell);
    });

    const bagGrid = document.getElementById("chestBagGrid");
    bagGrid.innerHTML = "";
    this.game.economy.inv.slots.forEach((entry, index) => {
      const cell = this.cells.make(entry, null);
      cell.dataset.slot = index;
      if (index < HOTBAR_SIZE) cell.insertAdjacentHTML("afterbegin", '<span class="key">' + (index + 1) + "</span>");
      this.cells.bind(cell,
        entry ? () => { this.game.slots.quickMove(String(index)); } : null,
        entry ? () => this.card.show(ITEMS[entry.id], { entry }) : null,
        index);
      bagGrid.appendChild(cell);
    });
  }

  /** Same two-grid layout as the chest, so a sack reads like any container. */
  _renderPack(sack) {
    const grid = document.getElementById("packGrid");
    grid.innerHTML = "";
    sack.slots.forEach((entry, index) => {
      const cell = this.cells.make(entry, null);
      cell.dataset.slot = "pack:" + index;
      this.cells.bind(cell,
        entry ? () => { this.game.slots.quickMove("pack:" + index, sack); this.refresh(); } : null,
        entry ? () => this.card.show(ITEMS[entry.id], { entry }) : null,
        "pack:" + index);
      grid.appendChild(cell);
    });

    const bagGrid = document.getElementById("packBagGrid");
    bagGrid.innerHTML = "";
    this.game.economy.inv.slots.forEach((entry, index) => {
      const cell = this.cells.make(entry, null);
      cell.dataset.slot = index;
      if (index < HOTBAR_SIZE) cell.insertAdjacentHTML("afterbegin", '<span class="key">' + (index + 1) + "</span>");
      this.cells.bind(cell,
        entry ? () => { this.game.slots.quickMove(String(index), sack); this.refresh(); } : null,
        entry ? () => this.card.show(ITEMS[entry.id], { entry, slot: index }) : null,
        index);
      bagGrid.appendChild(cell);
    });
  }
}
