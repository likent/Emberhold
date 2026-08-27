/**
 * The catalogs check each other. Adding content means one line in a table and
 * one entry in another, so the mistakes are always the same two: an id that
 * points at nothing, and a price that drifted from the thing it prices.
 *
 * No browser here. The tables need no canvas to exist, so this links the data
 * modules and runs them with a stubbed THREE - which also proves the catalog
 * has not quietly grown a dependency on the game.
 */
const path = require("path");
const vm = require("vm");
const { link } = require("./link.js");

const ROOT = path.join(__dirname, "..");

/** Evaluates data/recipes.js and everything it pulls in, and hands back the tables. */
function catalog() {
  const code = link(path.join(ROOT, "src", "data", "recipes.js"));
  const THREE = new Proxy({}, { get: () => function () { return {}; } });
  const ctx = vm.createContext({ THREE, Math, Object, JSON });
  return vm.runInContext(code + "\n;({ ITEMS, DEPLOYABLES, RECIPES, STRUCTURES })", ctx);
}

let tables = null, loadError = null;
try { tables = catalog(); } catch (e) { loadError = e.message; }
const { ITEMS = {}, DEPLOYABLES = {}, RECIPES = [], STRUCTURES = {} } = tables || {};

exports["the catalog evaluates at all"] = assert => {
  // An id that points at nothing usually fails here first, as a throw while
  // the tables are still being built - which is also how it fails in a browser.
  assert(loadError === null, "the data modules load", loadError);
};

exports["every deployable is an item that names a real structure"] = assert => {
  if (!tables) return;
  for (const id in DEPLOYABLES) {
    const item = ITEMS[id];
    assert(!!item, "deployable has an item", id);
    if (!item) continue;
    assert(item.kind === "deployable", id + " is kind deployable", item.kind);
    assert(!!STRUCTURES[item.structure], id + " places a real structure", item.structure);
  }
};

exports["a structure you carry and its item point at each other"] = assert => {
  if (!tables) return;
  for (const id in STRUCTURES) {
    const def = STRUCTURES[id];
    if (!def.item) continue;
    const item = ITEMS[def.item];
    assert(!!item, id + " has the item it is placed from", def.item);
    // Without the round trip a deployable can be crafted and never placed:
    // the hand arms `item.structure`, not the structure that named the item.
    if (item) assert(item.structure === id, def.item + " places " + id, item.structure);
  }
};

exports["every recipe makes something the item catalog knows"] = assert => {
  for (const r of RECIPES) {
    assert(!!ITEMS[r.out], "recipe output exists", r.out);
    assert(typeof r.time === "number" && r.time > 0, r.out + " takes time", String(r.time));
    for (const k in r.cost) assert(!!ITEMS[k], r.out + " is paid for in real items", k);
  }
};

exports["a deployable is priced by its own structure"] = assert => {
  for (const r of RECIPES) {
    const item = ITEMS[r.out];
    if (!item || item.kind !== "deployable") continue;
    const def = STRUCTURES[item.structure];
    // Same object, not a copy: crafting one and building one must never be
    // two different prices for the same thing.
    const same = JSON.stringify(r.cost) === JSON.stringify(def.cost);
    assert(r.cost === def.cost, r.out + " costs what its structure costs",
      same ? "the same numbers, but a copy of them"
           : JSON.stringify(r.cost) + " vs " + JSON.stringify(def.cost));
  }
};

exports["nothing is craftable for free"] = assert => {
  for (const r of RECIPES) {
    assert(Object.keys(r.cost).length > 0, r.out + " costs something");
  }
};
