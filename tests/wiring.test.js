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
  "placeBtn", "actionBtn", "restart", "menuBtn", "menuClose", "menuResume"];

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
  },

  "a wall's card quotes only what can actually break it": async assert => {
    const t = await boot();
    t.sim(4);
    t.game.build.select("stone_wall");
    t.game.ui.card.structure(t.game.build.selected);
    const chips = t.$("modalStats").textContent;
    assert(chips.indexOf("Raider breaks in") >= 0, "the raider is quoted a time", chips);
    // A boar has no dps against structures, and hp/0 read as "Infinitys".
    assert(chips.indexOf("Infinity") < 0, "and nothing that cannot chew is", chips);
  },

  "a recipe list heads each group once": async assert => {
    const t = await boot();
    t.sim(4);
    t.clearWorld();
    t.game.economy.add("wood", 400);
    t.game.economy.add("stone", 400);
    const g = t.grid, p = t.game.player.position;
    t.place("workbench", g.cellX(p.x) + 1, g.cellY(p.z));
    t.sim(4);
    t.game.panel.toggle();
    t.game.stations.openBench();
    // Deployable recipes are appended to the catalog after the rest, so the
    // rows do not arrive in group order.
    const heads = Array.prototype.map.call(
      t.$("benchList").querySelectorAll(".invBar"), el => el.textContent);
    assert(heads.length > 0, "the bench lists something at all");
    assert(heads.length === new Set(heads).size, "no group is headed twice",
      heads.join(" | "));
  },

  "the palette chip lights up for whatever is selected": async assert => {
    const t = await boot();
    t.sim(4);
    t.game.build.setActive(true);
    // Chips are keyed by category; select() hands them a structure id.
    t.game.build.select("iron_wall");
    const chips = t.game.palette.chips;
    assert(chips.wall.classList.contains("on"), "the wall chip is lit");
    assert(!chips.station.classList.contains("on"), "and the station chip is not");
  },

  "the debug switches moved out of the HUD and into the menu": async assert => {
    const t = await boot();
    t.sim(4);
    assert(t.$("utils") === null, "the HUD row is gone");
    assert(!!t.$("menuBtn"), "and one button took its corner");
    // They keep their ids, which is why nothing that reaches for them by id
    // - the wiring list above, the keyboard - had to change.
    for (const id of ["huntBtn", "sandboxBtn", "waveBtn", "hordeBtn", "debugBtn"]) {
      const el = t.$(id);
      assert(!!el && t.$("menu").contains(el), id + " lives in the menu now");
    }
    t.game.toggleSandbox();
    assert(t.$("sandboxBtn").classList.contains("on"), "the sandbox row lights up");
    assert(!t.$("waveBtn").classList.contains("hidden"), "and the sandbox-only rows appear");
    t.game.toggleSandbox();
    assert(t.$("waveBtn").classList.contains("hidden"), "and go away again");
  },

  "the pause menu opens, presses and closes": async assert => {
    const t = await boot();
    t.sim(4);
    t.tap(t.$("menuBtn"));
    assert(t.$("menu").classList.contains("show"), "the menu is showing");
    assert(t.game.paused, "and the world is paused");

    // The debug section starts collapsed, so a test that did not open it would
    // be pressing rows no thumb could reach.
    const head = Array.prototype.filter.call(
      t.$("menuList").querySelectorAll(".invBar.tap"), el => /Debug/.test(el.textContent))[0];
    assert(!!head, "the debug section has a heading to open");
    t.tap(head);
    assert(!t.$("debugBtn").closest(".section").classList.contains("hidden"),
      "and it opens");

    // Every row is rebuilt on each press, so the list has to be asked again
    // between taps rather than held on to.
    const tappable = () => Array.prototype.slice.call(
      t.$("menuList").querySelectorAll(".statRow.tap:not(.danger), .choice .btn"));
    const count = tappable().length;
    assert(count > 10, "there is something in every section", String(count));
    for (let i = 0; i < count; i++) {
      const el = tappable()[i];
      if (!el) continue;
      const before = t.errors.length;
      t.tap(el);
      assert(t.errors.length === before, "row " + i + " presses cleanly", t.errors[before]);
    }

    t.tap(t.$("menuResume"));
    assert(!t.$("menu").classList.contains("show"), "it closes");
    assert(!t.game.paused, "and the world runs again");
  },

  "starting a new run from the menu takes two taps": async assert => {
    const t = await boot();
    t.sim(4);
    t.game.menu.open();
    const danger = () => t.$("menuList").querySelector(".statRow.danger");
    t.game.cycle.day = 6;
    t.tap(danger());
    assert(t.game.cycle.day === 6, "one tap changes nothing");
    t.tap(danger());
    assert(t.game.cycle.day === 1, "the second one starts over", String(t.game.cycle.day));
    assert(!t.game.paused, "and the pause is lifted with it");
    assert(!t.errors.length, "no errors", t.errors[0]);
  }
};
