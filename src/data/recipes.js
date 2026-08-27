import { ITEMS, DEPLOYABLES } from "./items.js";
import { STRUCTURES } from "./structures.js";

/* Structures are built straight from materials - no intermediate part to
 * craft. Only gear goes through the workbench. */
/* Tiering rule: if it is lashed together from wood you can make it in your
 * hands; anything that needs stone shaped or fitted wants a workbench. */
export const RECIPES = [
  { out: "coal",        cost: { wood: 4 }, count: 2,             group: "Smelting", station: "smelt", time: 7 },
  { out: "iron_ingot",  cost: { iron_ore: 2, wood: 1 }, count: 2, group: "Smelting", station: "smelt", time: 12 },
  { out: "steel_ingot", cost: { iron_ingot: 2, coal: 1 },           group: "Smelting", station: "smelt", time: 16 },
  { out: "cooked_meat", cost: { raw_meat: 2 },          group: "Cooking",  station: "cook",  time: 10 },
  { out: "cloth",       cost: { fiber: 4 },           group: "Materials", station: null, time: 3 },
  { out: "rope",        cost: { fiber: 6 },           group: "Materials", station: null, time: 4 },
  { out: "torch",       cost: { wood: 2, cloth: 1 },  group: "Materials", station: null, time: 3 },
  { out: "campfire",    cost: { wood: 10, stone: 6 }, group: "Materials", station: null, time: 6 },
  { out: "coal_torch",  cost: { wood: 2, coal: 1 },   group: "Materials", station: null, time: 3 },
  { out: "club",        cost: { wood: 5 },            group: "Gear",  station: null,    time: 4 },
  { out: "wood_mallet", cost: { wood: 8 },            group: "Gear",  station: null,    time: 5 },
  { out: "wood_guard",  cost: { wood: 14 },           group: "Gear",  station: null,    time: 7 },
  { out: "hand_axe",    cost: { wood: 6, stone: 8 },  group: "Gear",  station: "craft", time: 9 },
  { out: "stone_pick",  cost: { wood: 6, stone: 10 }, group: "Gear",  station: "craft", time: 10 },
  { out: "stone_blade", cost: { wood: 8, stone: 14 }, group: "Gear",  station: "craft", time: 14 },
  { out: "stone_plate", cost: { wood: 8, stone: 22 }, group: "Gear",  station: "craft", time: 18 },
  { out: "leather_vest", cost: { leather: 6, rope: 2 }, group: "Gear", station: "craft", time: 14 },
  { out: "iron_hammer", cost: { wood: 4, iron_ingot: 3 },  group: "Iron", station: "craft", time: 15 },
  { out: "iron_axe",    cost: { wood: 8, iron_ingot: 3 },  group: "Iron", station: "craft", time: 16 },
  { out: "iron_pick",   cost: { wood: 8, iron_ingot: 4 },  group: "Iron", station: "craft", time: 18 },
  { out: "iron_blade",  cost: { wood: 6, iron_ingot: 5 },  group: "Iron", station: "craft", time: 22 },
  { out: "iron_mail",   cost: { wood: 4, iron_ingot: 8 },  group: "Iron", station: "craft", time: 26 },
  { tier: 2, out: "steel_pick",  cost: { rope: 2, steel_ingot: 4 }, group: "Steel", station: "craft", time: 24 },
  { tier: 2, out: "steel_axe",   cost: { rope: 2, steel_ingot: 4 }, group: "Steel", station: "craft", time: 24 },
  { tier: 2, out: "steel_blade", cost: { leather: 2, steel_ingot: 6 }, group: "Steel", station: "craft", time: 30 },
  { tier: 2, out: "steel_hammer", cost: { wood: 4, steel_ingot: 4 }, group: "Steel", station: "craft", time: 26 },
  { tier: 2, out: "steel_mail",  cost: { leather: 4, steel_ingot: 10 }, group: "Steel", station: "craft", time: 36 },
  { out: "iron_spikes", cost: { stone: 4, iron_ingot: 2 }, group: "Deployables", station: "craft", time: 10 },
  { tier: 2, out: "steel_ballista", cost: { steel_ingot: 6, rope: 3 }, group: "Deployables", station: "craft", time: 26 },
  { out: "bow",         cost: { wood: 6, rope: 2, leather: 1 }, group: "Ranged", station: "craft", time: 16 },
  { out: "arrow",       cost: { wood: 3, fiber: 3, iron_ingot: 1 }, count: 8,
    group: "Ranged", station: "craft", time: 9 }
];

/** Deployable recipes share the cost object with their structure. */
function registerDeployableRecipes() {
  for (const id in DEPLOYABLES) {
    RECIPES.push({
      out: id, cost: STRUCTURES[id].cost, group: "Deployables",
      station: STRUCTURES[id].cost.stone ? "craft" : null,
      time: STRUCTURES[id].cost.stone ? 10 : 4
    });
  }
}

export function makeItemEntry(id, count) {
  const def = ITEMS[id];
  const entry = { id, count };
  if (def.durability) entry.dur = def.durability;
  return entry;
}

registerDeployableRecipes();
