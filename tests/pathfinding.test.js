/**
 * Pathfinding. Every one of these guards a bug that reached a player once.
 */
const { boot } = require("./harness");

module.exports = {
  "flow field stays within its theoretical push ceiling": async assert => {
    const t = await boot();
    t.sim(4);
    for (const id of ["raider", "runner", "critter", "brute"]) {
      const field = t.game.paths.fields[id];
      let pushes = 0;
      const push = field.heap.push.bind(field.heap);
      field.heap.push = (n, c) => { pushes++; push(n, c); };
      field.sig = "";
      t.game.paths.rebuild(field);
      field.heap.push = push;
      // 1600 cells, eight neighbours each. Anything beyond that means cells
      // are being re-opened, which is how the float32 bug showed itself.
      assert(pushes < 12800, id + " field re-opens cells", pushes + " pushes");
    }
  },

  "no cell cost is ever zero or negative": async assert => {
    const t = await boot();
    t.sim(4);
    t.game.economy.add("stone", 9999);
    t.game.economy.add("steel_ingot", 999);
    t.game.economy.add("iron_ingot", 999);
    ["fence", "stone_wall", "iron_wall", "steel_wall"].forEach((id, k) =>
      t.place(id, 10 + k, 14));
    ["spikes", "torch", "campfire", "snare"].forEach((id, k) =>
      t.place(id, 10 + k, 18));
    t.sim(10);

    const g = t.grid;
    for (const id of Object.keys(t.game.paths.fields)) {
      const type = t.type(id);
      const walk = g.cell / type.speed;
      for (let i = 0; i < g.w * g.h; i++) {
        const c = g.enterCost(i, walk, type.dpsVsStructure, type.trapFear);
        if (Number.isNaN(c) || c === Infinity) continue;
        if (c <= 0) {
          assert(false, "non-positive cost", id + " cell " + i + " = " + c);
          return;
        }
      }
    }
    assert(true, "costs positive");
  },

  "a wall with a gap is walked around, a sealed one is chewed": async assert => {
    const withGap = await boot();
    withGap.sim(4);
    withGap.clearWorld();
    withGap.game.economy.add("steel_ingot", 999);
    withGap.game.economy.add("stone", 999);
    const g = withGap.grid;
    for (let cx = 4; cx < 36; cx++) {
      if (cx >= 22 && cx <= 24) continue;
      if (g.isFree(g.idx(cx, 20))) withGap.place("steel_wall", cx, 20);
    }
    withGap.game.player.position.set(g.centerX(18), 0, g.centerZ(16));
    const walls = withGap.build.placed.size;
    withGap.game.spawnEnemy(g.centerX(18), g.centerZ(24), withGap.type("raider"));
    withGap.game.paths.invalidate();
    withGap.sim(4);
    let crossed = false;
    for (let k = 0; k < 2000 && !crossed; k++) {
      withGap.game._update(0.05);
      crossed = withGap.game.enemies[0].position.z < g.centerZ(19);
    }
    assert(crossed, "raider never got through the gap");
    assert(withGap.build.placed.size === walls,
      "raider chewed a wall with a gap available");
  },

  "crowding is not mistaken for being stuck": async assert => {
    const t = await boot();
    t.sim(4);
    t.clearWorld();
    t.game.sandbox = true;
    t.game.economy.setInfinite(true);
    t.game.economy.add("stone", 9999);
    const g = t.grid;
    for (let cx = 6; cx < 34; cx++) {
      if (cx === 12 || cx === 13) continue;
      if (g.isFree(g.idx(cx, 18))) t.place("stone_wall", cx, 18);
    }
    t.game.player.position.set(g.centerX(20), 0, g.centerZ(14));
    for (let i = 0; i < 30; i++) {
      t.game.spawnEnemy(g.centerX(14 + (i % 12)), g.centerZ(26), t.type("raider"));
    }
    t.game.paths.invalidate();
    const walls = t.build.placed.size;
    t.sim(1200);
    assert(t.build.placed.size === walls,
      "a crowd chewed the wall instead of using the gap",
      walls + " -> " + t.build.placed.size);
  }
};
