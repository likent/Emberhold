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

  "a tier fights with its own numbers, not its base's": async assert => {
    const t = await boot();
    t.sim(4);
    t.clearWorld();
    const g = t.grid;
    // Tiers inherit their behaviour from the thing below them, so the only
    // proof that `this` is the variant is what the variant actually does.
    const wood = t.place("spikes", 10, 10);
    const iron = t.place("iron_spikes", 14, 10);
    const woodHp = g.hp[wood], ironHp = g.hp[iron];
    const onWood = t.game.spawnEnemy(g.centerX(10), g.centerZ(10), t.type("raider"));
    const onIron = t.game.spawnEnemy(g.centerX(14), g.centerZ(10), t.type("raider"));
    const full = onWood.hp;
    t.sim(3);

    const woodTook = full - onWood.hp, ironTook = full - onIron.hp;
    assert(woodTook > 0 && ironTook > woodTook, "iron spikes maim harder",
      woodTook.toFixed(1) + " vs " + ironTook.toFixed(1));
    // ...and blunt rather than splinter, so the same fight costs them less.
    const woodWear = woodHp - g.hp[wood], ironWear = ironHp - g.hp[iron];
    assert(woodWear > 0 && ironWear < woodWear, "iron spikes wear slower",
      woodWear.toFixed(1) + " vs " + ironWear.toFixed(1));
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
    t.game.equip.changed();
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
  },

  "a full sack does not swallow what you died holding": async assert => {
    const t = await boot();
    t.sim(4);
    t.clearWorld();
    const p = t.game.player.position;
    // A sack at your feet with every slot taken: the death drop joins whatever
    // is lying within three metres, and used to be discarded when it would not
    // fit rather than starting a second sack.
    const full = t.game.packs.dropItemsAt(p.x, p.z, []);
    full.inv.slots.forEach((s, i) => { full.inv.slots[i] = { id: "stone", count: 99 }; });
    t.game.economy.inv.clear();
    t.game.economy.inv.slots[5] = { id: "iron_blade", count: 1, dur: 460 };

    t.game.player.takeDamage(9999);
    t.sim(4);

    let blade = null;
    for (const pack of t.game.packs.list) {
      for (const s of pack.inv.slots) if (s && s.id === "iron_blade") blade = s;
    }
    assert(!!blade, "the blade is on the ground somewhere");
    assert(blade && blade.dur === 460, "with its condition intact", blade && String(blade.dur));
  },

  "armour dropped on a taken slot stays on your back": async assert => {
    const t = await boot();
    t.sim(4);
    t.clearWorld();
    const { cx, cy } = t.freeCell(10, 10);
    const cell = t.place("chest", cx, cy);
    t.game.player.position.set(t.grid.centerX(cx), 0, t.grid.centerZ(cy) + 2);
    t.sim(2);
    t.game.stations.openChestCell = cell;
    const chest = t.game.build.chests.get(cell);
    chest.slots[0] = { id: "wood_guard", count: 1, dur: 160 };
    t.game.equip.worn.armor = { id: "iron_mail", count: 1, dur: 600 };

    // A refused move must refuse before anything is unequipped.
    t.game.slots.move("armor", "chest:0");
    const worn = t.game.equip.worn.armor;
    assert(worn && worn.id === "iron_mail", "the mail is still worn", JSON.stringify(worn));
    assert(chest.slots[0] && chest.slots[0].id === "wood_guard", "and the chest is untouched");

    // An empty backpack slot is a legal target, and keeps the condition.
    t.game.economy.inv.slots[6] = null;
    t.game.slots.move("armor", "6");
    const moved = t.game.economy.inv.slots[6];
    assert(moved && moved.id === "iron_mail" && moved.dur === 600,
      "and it moves into the bag whole", JSON.stringify(moved));
  },

  "an iron chest keeps every slot it has through a save": async assert => {
    const t = await boot();
    t.sim(4);
    t.clearWorld();
    const { cx, cy } = t.freeCell(12, 12);
    const cell = t.place("iron_chest", cx, cy);
    const chest = t.game.build.chests.get(cell);
    assert(chest.size === 48, "an iron chest is built with its own 48 slots",
      String(chest.size));
    chest.slots[40] = { id: "wood", count: 7 };

    t.game.saves.save(true);
    t.game.saves.load();

    const back = t.game.build.chests.get(cell);
    assert(back && back.size === 48, "and still has them after a reload",
      back && String(back.size));
    // Restored at the base chest's size, the far slots stayed visible and
    // countable while every method that walks by size ignored them.
    assert(back && back.remove("wood", 7) === 7, "with the far slots still reachable");
  },

  "the memory-only save is a snapshot, not a view of the run": async assert => {
    const t = await boot();
    t.sim(4);
    t.game.economy.inv.clear();
    t.game.economy.inv.add("wood", 40);

    const store = t.w.localStorage, real = store.setItem;
    store.setItem = () => { throw new Error("storage unavailable"); };
    t.game.saves.save(true);
    store.setItem = real;

    t.game.economy.inv.remove("wood", 40);
    const saved = t.game.saves._memorySave.inv.filter(Boolean);
    assert(saved.some(e => e.id === "wood" && e.count === 40),
      "the wood is still in the save it was taken from", JSON.stringify(saved));
  },

  "a new run starts on a full belly": async assert => {
    const t = await boot();
    const full = t.game.player.hunger;      // before a frame has drained any
    t.sim(4);
    t.game.player.hunger = 2;
    t.game.player.torchFuel = 30;
    t.game.restart();
    t.sim(2);
    assert(t.game.player.hunger > full * 0.99, "hunger is back to full",
      t.game.player.hunger + " / " + full);
    assert(t.game.player.torchFuel === 0, "and no torch is still burning",
      String(t.game.player.torchFuel));
  },

  "a kill counts whether or not it dropped anything": async assert => {
    const t = await boot();
    t.sim(4);
    t.clearWorld();
    const before = t.game.stats.kills;
    const boar = t.game.spawnEnemy(0, 0, t.type("critter"), { mode: "critter", route: [], lifetime: 99 });
    boar.takeDamage(9999);
    const raider = t.game.spawnEnemy(4, 0, t.type("raider"), {});
    raider.takeDamage(9999);
    assert(t.game.stats.kills === before + 2, "both are counted",
      String(t.game.stats.kills - before));
  },

  "the flow field honours its rebuild interval": async assert => {
    const t = await boot();
    t.sim(4);
    t.clearWorld();
    t.game.spawnEnemy(6, 6, t.type("brute"), {});
    t.game.spawnEnemy(8, 6, t.type("runner"), {});
    let passes = 0;
    for (const id in t.game.paths.fields) {
      const field = t.game.paths.fields[id];
      const real = field.compute.bind(field);
      field.compute = targets => { passes++; return real(targets); };
    }
    // Two seconds of walking at 60fps with three classes warm. The schedule
    // allows one class per frame and one sweep per rebuildInterval; when the
    // freshness check was comparing a version nobody wrote, every single
    // frame looked stale and a sweep ran on all of them.
    for (let i = 0; i < 120; i++) { t.game.input.move.x = 1; t.game._update(1 / 60); }
    t.game.input.move.x = 0;
    assert(passes > 0, "the field is kept warm at all");
    assert(passes <= 30, "and is not swept every frame",
      passes + " sweeps in 120 frames");
  },

  "a paused world does not move": async assert => {
    const t = await boot();
    t.sim(4);
    t.clearWorld();
    t.game.spawnEnemy(6, 6, t.type("raider"), {});

    // Counted rather than compared: 60 synchronous frames carry almost no
    // wall-clock time, so a state comparison would pass whether the gate
    // worked or not. sim() calls _update directly and ignores the pause -
    // this has to drive the real loop.
    let ticks = 0;
    const real = t.game._update.bind(t.game);
    t.game._update = dt => { ticks++; return real(dt); };

    const day = t.game.cycle.t, hunger = t.game.player.hunger;
    const at = t.game.enemies[0].position.x, timer = t.game.saveTimer;

    t.game.menu.open();
    for (let i = 0; i < 60; i++) t.game._loop();
    assert(ticks === 0, "not one frame was counted while paused", String(ticks));
    assert(t.game.cycle.t === day, "the clock did not move");
    assert(t.game.player.hunger === hunger, "hunger did not drain");
    assert(t.game.enemies[0].position.x === at, "the raider did not step");
    assert(t.game.saveTimer === timer, "and the autosave clock stood still");

    t.game.menu.close();
    for (let i = 0; i < 10; i++) t.game._loop();
    assert(ticks === 10, "and every frame counts again after", String(ticks));
  },

  "the pause lets go of whatever was being held": async assert => {
    const t = await boot();
    t.sim(4);
    t.game.input.move.x = 1;
    t.game.input.look.dx = 400;      // a banked look would arrive in one lump
    t.game.player.acting = true;
    t.game.menu.open();
    assert(t.game.input.move.x === 0, "the stick is centred");
    assert(t.game.input.look.dx === 0, "the look is drained");
    assert(!t.game.player.acting, "and the swing is let go of");
  },

  "settings survive a reload": async assert => {
    const store = {};
    const first = await boot({ storage: store });
    first.sim(2);
    const sens = first.game.rig.sens;               // read before it is changed
    first.game.settings.set("look", "high");
    first.game.settings.set("shadows", false);

    const second = await boot({ storage: store });
    second.sim(2);
    assert(second.game.settings.get("look") === "high", "the choice came back",
      second.game.settings.get("look"));
    assert(second.game.rig.sens > sens, "and was applied to the rig",
      second.game.rig.sens + " vs " + sens);
    assert(second.game.renderer.shadowMap.enabled === false,
      "and the shadows are still off at boot");
  },

  "wiping the run keeps the settings": async assert => {
    const store = {};
    const t = await boot({ storage: store });
    t.sim(2);
    t.game.settings.set("quality", "low");
    t.game.saves.wipe();
    assert(!!store["emberhold-settings-v1"], "the settings key is still there",
      Object.keys(store).join(", "));
  },

  "settings that will not parse do not stop the boot": async assert => {
    const t = await boot({ storage: { "emberhold-settings-v1": "{not json" } });
    t.sim(20);
    assert(!!t.game, "the game booted anyway");
    assert(t.game.settings.get("shadows") === true, "on the defaults");
    assert(!t.errors.length, "and runs clean", t.errors[0]);
  }
};
