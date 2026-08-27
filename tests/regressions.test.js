/**
 * Meshes, saves and the UI. Each of these caught a real regression: a mesh
 * built with a number where a material belonged, a corrupt save that stopped
 * the game from booting at all, a tool repaired for free by a chest.
 */
const { boot } = require("./harness");

module.exports = {
  "every structure builds real materials for every auto-tile mask": async assert => {
    const t = await boot();
    t.sim(2);
    const ids = ["fence", "stone_wall", "iron_wall", "steel_wall", "gate",
      "iron_gate", "workbench", "workbench2", "furnace", "blast_furnace",
      "chest", "iron_chest", "spikes", "iron_spikes", "snare", "torch",
      "coal_torch", "campfire", "ballista", "steel_ballista"];
    const bad = [];
    for (const id of ids) {
      t.build.select(id);
      const def = t.build.selected;
      for (const mask of [0, 3, 5, 10, 15]) {
        let mesh;
        try { mesh = def.build(mask, { orient: 0 }); }
        catch (e) { bad.push(id + " threw " + e.message); continue; }
        mesh.traverse(o => {
          if (o.isMesh && (!o.material || typeof o.material.clone !== "function")) {
            bad.push(id + " mask " + mask + " material is " + String(o.material));
          }
        });
      }
    }
    assert(!bad.length, "structure meshes", bad[0]);
  },

  "the game boots whatever nonsense is in the save slot": async assert => {
    const payloads = ["not json", '{"v":1,"cycle":{', "", "null",
      '{"v":1,"structures":"nope"}'];
    for (const raw of payloads) {
      const t = await boot({ storage: { "emberhold-save-v1": raw } });
      assert(!!t.game, "boot with save " + JSON.stringify(raw.slice(0, 12)));
      t.sim(20);
    }
  },

  "a run survives a save and a reload": async assert => {
    const store = {};
    const first = await boot({ storage: store });
    first.sim(4);
    first.game.economy.add("wood", 200);
    first.game.economy.add("stone", 120);
    const { cx, cy } = first.freeCell();
    const cell = first.place("stone_wall", cx + 1, cy);
    first.grid.hp[cell] = 61;
    first.game.cycle.day = 5;
    first.game.player.hunger = 58;
    first.game.saves.save();

    const second = await boot({ storage: store });
    assert(second.game.cycle.day === 5, "day restored", String(second.game.cycle.day));
    assert(Math.round(second.grid.hp[cell]) === 61, "damaged wall restored",
      String(second.grid.hp[cell]));
    assert(Math.round(second.game.player.hunger) === 58, "hunger restored");
    second.sim(200);
    assert(!second.errors.length, "world runs after load", second.errors[0]);
  },

  "moving gear between containers keeps its condition": async assert => {
    const t = await boot();
    t.sim(4);
    t.game.economy.add("wood", 60);
    t.game.economy.add("iron_ingot", 20);
    const { cx, cy } = t.freeCell();
    const cell = t.place("chest", cx + 1, cy);
    t.game.stations.openChestCell = cell;
    t.game.economy.inv.slots[6] = { id: "steel_pick", count: 1, dur: 111 };

    t.game.slots.quickMove("6", t.game.stations.chestInv());
    const stored = t.game.stations.chestInv().slots.find(s => s && s.id === "steel_pick");
    assert(stored && stored.dur === 111, "condition kept going in",
      stored && String(stored.dur));

    const index = t.game.stations.chestInv().slots.indexOf(stored);
    t.game.slots.quickMove("chest:" + index, t.game.stations.chestInv());
    const back = t.game.economy.inv.slots.find(s => s && s.id === "steel_pick");
    assert(back && back.dur === 111, "condition kept coming out",
      back && String(back.dur));
  },

  "a full backpack spills the harvest instead of binning it": async assert => {
    const t = await boot();
    t.sim(4);
    const fillers = ["stone", "iron_ore", "iron_ingot", "steel_ingot", "coal",
      "rope", "leather", "cloth", "fiber", "raw_meat", "cooked_meat", "arrow",
      "seed", "torch", "campfire", "snare"];
    t.game.economy.inv.slots.forEach((s, i) => {
      t.game.economy.inv.slots[i] = { id: fillers[i % fillers.length], count: 99 };
    });
    t.game.economy.inv.slots[1] = { id: "steel_axe", count: 1, dur: 800 };
    t.game.equip.selectHand(1);
    t.game.onLoadoutChanged();
    t.game.economy._sync();

    const tree = t.game.resources.nodes.find(n => n.def.id === "tree" && n.growth > 0.9);
    t.game.player.position.set(tree.position.x - 2.2, 0, tree.position.z);
    t.sim(2);
    t.game.player.acting = true;
    for (let k = 0; k < 400 && !tree.dead; k++) t.game._update(0.05);
    t.game.player.acting = false;
    t.sim(20);

    // One sack, or two: a second node standing in the same swing arc gets
    // felled as well and its spill lands too far away to share the first sack.
    assert(t.game.packs.list.length >= 1, "a sack was left on the ground");
    assert(t.game.packs.list.some(p => p.inv.slots.some(s => s && s.id === "wood")),
      "the wood is in the sack");
  }
};
