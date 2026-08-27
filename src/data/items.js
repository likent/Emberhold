/* --------------------------------------------------------------------------
 * Items and equipment
 * Everything the player can hold is one entry here. Gear declares the slot it
 * fills and the stats it contributes; nothing else in the game hardcodes an
 * item name, so a new axe or breastplate is a catalog entry plus a recipe.
 * ------------------------------------------------------------------------ */

export const ITEMS = {
  wood:        { id: "wood",  label: "Wood",  kind: "material", stack: 99, icon: "wood",  tint: "#b58a55" },
  stone:       { id: "stone", label: "Stone", kind: "material", stack: 99, icon: "stone", tint: "#9aa0a8" },
  berries:     { id: "berries", label: "Berries", kind: "material", stack: 40,
                 food: 12, icon: "berry", tint: "#c65a7a" },
  raw_meat:    { id: "raw_meat", label: "Raw meat", kind: "material", stack: 20,
                 food: 8, icon: "meat", tint: "#c2705f" },
  cooked_meat: { id: "cooked_meat", label: "Cooked meat", kind: "material", stack: 20,
                 food: 46, icon: "meat", tint: "#e0a06a" },
  fiber:       { id: "fiber", label: "Plant fibre", kind: "material", stack: 99, icon: "fiber", tint: "#9fbf6a" },
  cloth:       { id: "cloth", label: "Cloth", kind: "material", stack: 99, icon: "cloth", tint: "#d8cfae" },
  iron_ore:    { id: "iron_ore",    label: "Iron ore",  kind: "material", stack: 99, icon: "ore",   tint: "#c08a4a" },
  coal:        { id: "coal", label: "Charcoal", kind: "material", stack: 99, icon: "coal", tint: "#5c5f66" },
  rope:        { id: "rope", label: "Rope", kind: "material", stack: 60, icon: "rope", tint: "#c2a86a" },
  leather:     { id: "leather", label: "Hide", kind: "material", stack: 60, icon: "cloth", tint: "#a98358" },
  steel_ingot: { id: "steel_ingot", label: "Steel ingot", kind: "material", stack: 99, icon: "ingot", tint: "#8fa8c8" },
  iron_ingot:  { id: "iron_ingot",  label: "Iron ingot", kind: "material", stack: 99, icon: "ingot", tint: "#c3ccd8" },

  // Held gear: whatever is in the selected hotbar slot is what you swing.
  // damage drives combat, harvest drives gathering - an axe is both, badly and well.
  club:        { id: "club",        label: "Wooden club", kind: "gear", hand: true, stack: 1,
                 damage: 34, harvest: { wood: 0.7, stone: 0.5, ore: 0 }, durability: 140,
                 icon: "club",  tint: "#b58a55",
                 hold: { mat: "wood",  len: 0.85, head: false } },
  stone_blade: { id: "stone_blade", label: "Stone blade", kind: "gear", hand: true, stack: 1,
                 damage: 58, harvest: { wood: 0.5, stone: 0.3, ore: 0 }, durability: 260,
                 icon: "sword", tint: "#c8d4dc",
                 hold: { mat: "stone", len: 1.15, head: false } },
  hand_axe:    { id: "hand_axe",    label: "Stone axe",   kind: "gear", hand: true, stack: 1,
                 damage: 22, harvest: { wood: 2.4, stone: 1.0, ore: 0.6 }, durability: 220,
                 icon: "axe",   tint: "#9aa0a8",
                 hold: { mat: "wood",  len: 0.55, head: true } },
  stone_pick:  { id: "stone_pick",  label: "Stone pick",  kind: "gear", hand: true, stack: 1,
                 damage: 20, harvest: { wood: 0.8, stone: 2.4, ore: 2.0 }, durability: 240,
                 icon: "pick",  tint: "#9aa0a8",
                 hold: { mat: "wood",  len: 0.6, head: true, pick: true } },
  iron_pick:   { id: "iron_pick",   label: "Iron pick",   kind: "gear", hand: true, stack: 1,
                 damage: 30, harvest: { wood: 1.0, stone: 3.4, ore: 3.2 }, durability: 520,
                 icon: "pick",  tint: "#c3ccd8",
                 hold: { mat: "iron",  len: 0.65, head: true, pick: true } },

  // Worn gear: the only slot left on the body.
  iron_axe:    { id: "iron_axe",    label: "Iron axe",   kind: "gear", hand: true, stack: 1,
                 damage: 34, harvest: { wood: 3.6, stone: 1.4, ore: 0.9 }, durability: 420,
                 icon: "axe",   tint: "#c3ccd8",
                 hold: { mat: "iron", len: 0.6, head: true } },
  iron_blade:  { id: "iron_blade",  label: "Iron blade", kind: "gear", hand: true, stack: 1,
                 damage: 84, harvest: { wood: 0.6, stone: 0.4, ore: 0 }, durability: 460,
                 icon: "sword", tint: "#dde5ee",
                 hold: { mat: "iron", len: 1.25, head: false } },

  arrow:       { id: "arrow", label: "Arrows", kind: "material", stack: 80, icon: "arrow", tint: "#c2a86a" },
  bow:         { id: "bow", label: "Hunting bow", kind: "gear", hand: true, stack: 1,
                 damage: 12, harvest: { wood: 0.4, stone: 0.3, ore: 0 }, durability: 320,
                 ranged: { damage: 52, range: 21, cooldown: 0.9 },
                 icon: "bow", tint: "#c2a86a", hold: { mat: "wood", len: 0.35, head: false, bow: true } },
  wood_mallet: { id: "wood_mallet", label: "Wooden mallet", kind: "gear", hand: true, stack: 1,
                 damage: 24, harvest: { wood: 0.6, stone: 0.6, ore: 0 }, durability: 160,
                 repairRate: 70, icon: "hammer", tint: "#b58a55",
                 hold: { mat: "wood", len: 0.5, head: true } },
  iron_hammer: { id: "iron_hammer", label: "Iron hammer", kind: "gear", hand: true, stack: 1,
                 damage: 40, harvest: { wood: 0.8, stone: 1.1, ore: 0.5 }, durability: 520,
                 repairRate: 170, icon: "hammer", tint: "#c3ccd8",
                 hold: { mat: "iron", len: 0.55, head: true } },
  steel_hammer:{ id: "steel_hammer", label: "Steel hammer", kind: "gear", hand: true, stack: 1,
                 damage: 58, harvest: { wood: 1.0, stone: 1.4, ore: 0.7 }, durability: 950,
                 repairRate: 290, icon: "hammer", tint: "#8fa8c8",
                 hold: { mat: "iron", len: 0.6, head: true } },
  steel_pick:  { id: "steel_pick",  label: "Steel pick",  kind: "gear", hand: true, stack: 1,
                 damage: 44, harvest: { wood: 1.4, stone: 4.6, ore: 4.4 }, durability: 900,
                 icon: "pick",  tint: "#8fa8c8",
                 hold: { mat: "iron", len: 0.7, head: true, pick: true } },
  steel_axe:   { id: "steel_axe",   label: "Steel axe",   kind: "gear", hand: true, stack: 1,
                 damage: 48, harvest: { wood: 4.8, stone: 1.8, ore: 1.2 }, durability: 820,
                 icon: "axe",   tint: "#8fa8c8",
                 hold: { mat: "iron", len: 0.68, head: true } },
  steel_blade: { id: "steel_blade", label: "Steel blade", kind: "gear", hand: true, stack: 1,
                 damage: 122, harvest: { wood: 0.7, stone: 0.5, ore: 0 }, durability: 780,
                 icon: "sword", tint: "#c8dcf0",
                 hold: { mat: "iron", len: 1.4, head: false } },
  wood_guard:  { id: "wood_guard",  label: "Bark guard", kind: "gear", slot: "armor", stack: 1,
                 armor: 0.15, speed: 1, durability: 160, icon: "shield", tint: "#b58a55" },
  stone_plate: { id: "stone_plate", label: "Stone plate", kind: "gear", slot: "armor", stack: 1,
                 armor: 0.35, speed: 0.88, durability: 340, icon: "plate", tint: "#9aa0a8" },
  iron_mail:   { id: "iron_mail",   label: "Iron mail", kind: "gear", slot: "armor", stack: 1,
                 armor: 0.52, speed: 0.93, durability: 600, icon: "plate", tint: "#c3ccd8" },
  leather_vest:{ id: "leather_vest", label: "Hide vest", kind: "gear", slot: "armor", stack: 1,
                 armor: 0.26, speed: 1, durability: 320, icon: "shield", tint: "#a98358" },
  steel_mail:  { id: "steel_mail",  label: "Steel mail", kind: "gear", slot: "armor", stack: 1,
                 armor: 0.66, speed: 0.95, durability: 1100, icon: "plate", tint: "#8fa8c8" }
};

/* Rust's split: walls and gates are built straight from materials in build
 * mode, while turrets and traps are crafted, carried and deployed. Every one
 * of them is an item too, and they are all the same item - so each line says
 * only what makes it different and the loop below fills in the rest. */
export const DEPLOYABLES = {
  ballista:       { label: "Ballista",       icon: "route",  tint: "#c8d4dc" },
  spikes:         { label: "Wooden spikes",  icon: "spikes", tint: "#b58a55" },
  iron_spikes:    { label: "Iron spikes",    icon: "spikes", tint: "#a8b0bb" },
  snare:          { label: "Snare trap",     icon: "snare",  tint: "#9aa0a8" },
  campfire:       { label: "Campfire",       icon: "fire",   tint: "#ff8a3c", stack: 5 },
  steel_ballista: { label: "Steel ballista", icon: "route",  tint: "#8fa8c8", stack: 5 },
  // A torch is the one deployable you hold lit, so it carries a hand mesh.
  torch:          { label: "Torch",          icon: "torch",  tint: "#ffb257",
                    lightsHand: true, burnTime: 300,
                    hold: { mat: "wood", len: 0.5, head: false } },
  coal_torch:     { label: "Coal torch",     icon: "torch",  tint: "#ffd08a",
                    lightsHand: true, burnTime: 900,
                    hold: { mat: "wood", len: 0.5, head: false } },
  // The one whose item is not named after the structure it plants.
  seed:           { label: "Tree seed",      icon: "seed",   tint: "#7fc46a",
                    stack: 40, structure: "sapling" }
};
for (const id in DEPLOYABLES) {
  ITEMS[id] = Object.assign({ id, kind: "deployable", stack: 20, structure: id },
                            DEPLOYABLES[id]);
}

export const ITEM_DESC = {
  __wear: "Gear wears out with use and cannot be repaired - craft a fresh one.",
  berries: "A quick handful. Keeps the edge off, no more.",
  raw_meat: "Edible at a pinch. Worth far more once it has seen a fire.",
  cooked_meat: "A proper meal. Cook it on a campfire.",
  fiber: "Stripped from scrub. Twisted together it makes cloth.",
  cloth: "Four handfuls of fibre, worked into something that will hold a flame.",
  coal_torch: "Charcoal burns slow: fifteen minutes to a wooden torch's five.",
  iron_spikes: "Iron teeth. Four times the bite of sharpened stakes, and they last.",
  steel_ballista: "Longer reach, heavier stone, faster reload.",
  blast_furnace: "Twice the draught, twice the speed. Everything smelts in half the time.",
  iron_chest: "Forty-eight slots, banded with iron.",
  campfire: "Fifteen minutes of real light, and it scorches anything that walks through it. Feed it firewood.",
  torch: "Burns for about five minutes, in your hand or planted in the ground.",
  __torchOld: "Burns for about five minutes. Stand by it with cloth to feed the flame.",
  seed: "Shaken out of a felled tree. Plant it and a new one grows in about a minute.",
  quarry: "A shelf of workable stone. Endless, but each load takes a while to cut free.",
  workbench2: "Anvil and steel vices. Nothing made of steel can be worked without one.",
  iron_wall: "Nine hundred hit points. Brutes need fifteen seconds a panel.",
  steel_wall: "Twice the iron again. Little short of a cliff face.",
  iron_gate: "A gate you can actually rely on.",
  mine: "An exposed seam. It never runs dry, but a haul takes time to work loose.",
  bow: "Reaches far further than any swing, and needs an arrow for every shot. Poor as a club.",
  arrow: "Shaft, fletching and an iron head. Spent on release.",
  coal: "Wood burnt down in a sealed furnace. Hot enough to make steel.",
  rope: "Six handfuls of fibre twisted together. Everything that has to hold uses it.",
  leather: "Cut from a boar. Tougher than cloth, lighter than plate.",
  steel_ingot: "Iron and charcoal, worked together. The best metal you can make here.",
  iron_ore: "Chipped out of a deposit. Useless until a furnace melts it down.",
  iron_ingot: "Smelted iron. The workbench turns it into the best gear you can make.",
  wood_mallet: "Knocks a wall back together. Nothing gets repaired without a hammer in hand.",
  iron_hammer: "Twice the mending speed of a mallet, and it lasts.",
  steel_hammer: "Patches a steel panel back to full in seconds.",
  stone_pick: "Bites into stone and iron deposits. Poor at everything else.",
  iron_pick: "The only sensible way to work a deposit. Lasts a long time.",
  iron_axe: "Fells anything, and hits harder than a stone axe on the way home.",
  iron_blade: "The heaviest hitter. Slow to make, worth the wait.",
  steel_pick: "Cuts stone and ore faster than anything else, and hits like a hammer.",
  steel_axe: "Fells a tree in two swings.",
  steel_blade: "Well over a hundred damage a swing. Nothing here survives many.",
  leather_vest: "Real protection with no weight penalty at all.",
  steel_mail: "Two thirds of everything, turned aside.",
  iron_mail: "Halves what reaches you, and barely slows you down.",
  wood: "Cut from trees. Pays for walls, gates and every repair.",
  stone: "Mined from boulders. Heavier structures and better gear.",
  club: "Starter weapon. Swings fast enough, chops badly.",
  stone_blade: "Best damage per swing, but a poor tool for gathering.",
  hand_axe: "Fells trees and boulders quickly. A weak weapon in a fight.",
  wood_guard: "Light protection with no penalty to movement.",
  stone_plate: "Heavy protection. You move noticeably slower in it.",
  ballista: "Throws a stone at the nearest raider in range. Blocks movement.",
  spikes: "Walkable but painful. Raiders route around it when a detour is cheap.",
  snare: "Concealed, so the pathfinder ignores it. One bite, then it is spent."
};

export const HOTBAR_SIZE = 4;
export const SLOTS = ["armor"];
export const SLOT_LABEL = { armor: "Armor" };

/** Empty hand / holding a rock: the baseline every stat falls back to. */
export const BARE = { damage: 14, harvest: { wood: 0.6, stone: 0.35, ore: 0 }, armor: 0, speed: 1 };

/** What each harvestable is made of, and the tool column that applies. */
export const MATERIAL_LABEL = { wood: "wood", stone: "stone", ore: "ore" };
