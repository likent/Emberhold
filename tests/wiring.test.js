/**
 * The panel is hand-rolled DOM and every button is bound by element id, so a
 * method that moved out of Game fails at the moment the button is pressed and
 * nowhere earlier. This presses all of them, walks every tab, and runs the
 * handful of flows that reach across systems - carrying the core, dying,
 * salvaging - because those are the seams where a rename goes unnoticed.
 */
const { boot } = require("./harness");

const BUTTONS = ["buildBtn", "debugBtn", "huntBtn", "sandboxBtn", "waveCard",
  "coreBtn", "pickBtn", "bagBtn", "benchBtn", "furnaceBtn", "packBtn", "takeAll",
  "cookBtn", "chestBtn", "storeAll", "invClose", "waveBtn", "hordeBtn",
  "placeBtn", "actionBtn", "restart"];

const TABS = ["craft", "bench", "cook", "furnace", "stats", "chest", "pack"];

module.exports = {
  "every button reaches a live method": async assert => {
    const t = await boot();
    t.sim(4);
    for (const id of BUTTONS) {
      const el = t.$(id);
      assert(!!el, "button exists", id);
      if (!el) continue;
      const before = t.errors.length;
      t.tap(el);
      t.sim(2);
      assert(t.errors.length === before, "pressing " + id + " throws nothing",
        t.errors[before]);
    }
  },

  "every tab of the panel renders": async assert => {
    const t = await boot();
    t.sim(4);
    for (const tab of TABS) {
      const before = t.errors.length;
      t.game.panel.showTab(tab);
      t.game.panel.refresh();
      assert(t.errors.length === before, "tab " + tab + " renders", t.errors[before]);
    }
  },

  "every station tab renders what is in reach": async assert => {
    const t = await boot();
    t.sim(4);
    t.clearWorld();
    t.game.economy.add("wood", 400);
    t.game.economy.add("stone", 400);
    t.game.economy.add("iron_ingot", 40);
    const g = t.grid;
    const p = t.game.player.position;
    const cx = g.cellX(p.x), cy = g.cellY(p.z);
    // Each station has to be standing next to the player for its tab to exist.
    const stations = [["workbench", "bench", "benchList"], ["furnace", "furnace", "furnaceList"],
      ["campfire", "cook", "cookList"], ["chest", "chest", "chestBagGrid"]];
    stations.forEach(([id], i) => t.place(id, cx + 1, cy - 1 + i));
    t.sim(4);
    t.game.panel.toggle();
    for (const [id, tab, listId] of stations) {
      const before = t.errors.length;
      // A chest is opened rather than tabbed to: the tab only exists once one
      // is actually in front of you.
      if (tab === "chest") t.game.stations.openChest();
      else t.game.panel.showTab(tab);
      assert(t.game.panel.tab === tab, "the " + id + " tab opened", t.game.panel.tab);
      assert(t.errors.length === before, "the " + id + " tab renders", t.errors[before]);
      assert(t.$(listId).children.length > 0, "the " + id + " tab has rows in it");
    }
  },

  "the core can be carried, dropped and lost": async assert => {
    const t = await boot();
    t.sim(4);
    const home = t.game.core.position();
    t.game.player.position.set(home.x + 1.5, 0, home.z);
    t.sim(2);

    t.game.core.lift();
    assert(t.game.core.carrying, "lifted");
    t.sim(5);
    t.game.core.setDown();
    assert(!t.game.core.carrying, "set down");
    assert(t.game.core.cell >= 0, "anchored again", String(t.game.core.cell));

    // Dying while carrying has to leave the core somewhere reachable.
    t.game.core.lift();
    assert(t.game.core.carrying, "lifted again");
    t.game.player.takeDamage(9999);
    t.sim(10);
    assert(!t.game.core.carrying, "a downed player is not still holding it");
    assert(t.game.core.cell >= 0, "the core was planted where they fell");
    assert(t.game.packs.list.length > 0, "and the pack is on the ground");
    assert(!t.errors.length, "no errors", t.errors[0]);
  },

  "a tap on the ground builds where you pointed": async assert => {
    const t = await boot();
    t.sim(4);
    t.clearWorld();                       // no tree may stand where the tap lands
    t.game.economy.add("wood", 200);
    t.game.build.setActive(true);
    t.game.build.select("fence");
    const before = t.game.build.placed.size;
    t.worldTap(512, 700);                 // low on the screen: ground near the player
    assert(t.game.build.placed.size === before + 1, "a fence went up",
      before + " -> " + t.game.build.placed.size);
    assert(!t.errors.length, "no errors", t.errors[0]);
  },

  "gear can be priced, repaired and broken down": async assert => {
    const t = await boot();
    t.sim(4);
    t.game.economy.add("wood", 200);
    t.game.economy.add("stone", 200);
    t.game.economy.inv.slots[3] = { id: "club", count: 1, dur: 10 };

    const entry = t.game.economy.inv.slots[3];
    const price = t.game.gear.repairPrice(entry);
    assert(Object.keys(price).length > 0, "a worn club costs something to fix");
    assert(t.game.gear.repair(entry), "repaired");
    assert(entry.dur > 10, "condition restored", String(entry.dur));

    t.game.economy.inv.slots[3] = { id: "club", count: 1, dur: 10 };
    assert(t.game.gear.salvage("3"), "broken down");
    assert(!t.game.economy.inv.slots[3], "the slot is empty afterwards");
    assert(!t.errors.length, "no errors", t.errors[0]);
  }
};
