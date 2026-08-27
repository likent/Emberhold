import { addArms, gateOrientation } from "../core/autotile.js";
import { clamp, lerpAngle } from "../core/util.js";
import { CONFIG } from "./config.js";
import { MATS, GEO } from "./materials.js";

/** Buildable structures. Everything the base needs is described here. */
export const STRUCTURES = {
  fence: {
    id: "fence",
    category: "wall",
    label: "Wood fence",
    cost: { wood: 5 },
    refund: { wood: 2 },
    hp: 200,
    height: 1.5,
    blocksPlayer: true,
    connect: "wall",
    build(mask) {
      const g = new THREE.Group();
      addArms(g, mask, GEO.fenceArm, GEO.fencePost, GEO.fenceBrace, MATS.wood, 0.75, 0.86);
      return g;
    }
  },
  stone_wall: {
    id: "stone_wall",
    category: "wall",
    label: "Stone wall",
    cost: { stone: 8 },
    refund: { stone: 3 },
    hp: 750,
    height: 2.1,
    blocksPlayer: true,
    connect: "wall",
    build(mask) {
      const g = new THREE.Group();
      addArms(g, mask, GEO.stoneArm, GEO.stonePost, GEO.stoneBrace, MATS.stone, 1.05, 1.1);
      return g;
    }
  },
  /* The objective. Enemies path to it, it cannot be built or demolished, and
   * losing it ends the run. Mechanically it is an ordinary structure, which is
   * why the flow field needs no notion of "targets" beyond a cost source. */
  core: {
    id: "core",
    label: "Core",
    cost: {},
    repairCost: { wood: 45, stone: 65 },   // price of restoring it from zero
    hp: CONFIG.core.hp,
    height: 2.4,
    blocksPlayer: true,
    hidden: true,          // never shown in the build palette
    isCore: true,
    build() {
      const g = new THREE.Group();
      const base = new THREE.Mesh(GEO.coreBase, MATS.stone);
      base.position.y = 0.25; base.castShadow = true; base.receiveShadow = true;
      const crystal = new THREE.Mesh(GEO.coreCrystal, MATS.core);
      crystal.position.y = 1.35; crystal.castShadow = true;
      g.add(base, crystal);
      g.userData.crystal = crystal;
      return g;
    },
    onUpdate(dt, ctx) {
      const c = ctx.mesh.userData.crystal;
      c.rotation.y += dt * 0.8;
      c.position.y = 1.35 + Math.sin(ctx.state.t += dt) * 0.09;
    }
  },

  ballista: {
    id: "ballista",
    item: "ballista",
    label: "Ballista",
    cost: { wood: 20, stone: 10, rope: 3 },
    refund: { wood: 8, stone: 4 },
    hp: 240,
    height: 2.0,
    blocksPlayer: true,
    range: 9.5,
    damage: 26,
    fireCooldown: 1.6,
    build() {
      const g = new THREE.Group();
      const base = new THREE.Mesh(GEO.turretBase, MATS.wood);
      base.position.y = 0.42; base.castShadow = true; base.receiveShadow = true;
      const head = new THREE.Group();
      head.position.y = 1.1;
      const frame = new THREE.Mesh(GEO.turretHead, MATS.wood);
      const arm = new THREE.Mesh(GEO.ballistaArm, MATS.wood);
      arm.position.z = 0.3;
      const shaft = new THREE.Mesh(GEO.turretBarrel, MATS.wood);
      shaft.position.z = 0.7;
      frame.castShadow = true; arm.castShadow = true; shaft.castShadow = true;
      head.add(frame, arm, shaft);
      g.add(base, head);
      g.userData.head = head;
      return g;
    },
    onUpdate(dt, ctx) {
      const s = ctx.state;
      s.cd -= dt;
      const target = ctx.game.combat.nearestEnemy(ctx.mesh.position, this.range);
      if (!target) return;
      const head = ctx.mesh.userData.head;
      const dx = target.position.x - ctx.mesh.position.x;
      const dz = target.position.z - ctx.mesh.position.z;
      head.rotation.y = lerpAngle(head.rotation.y, Math.atan2(dx, dz), clamp(6 * dt, 0, 1));
      if (s.cd <= 0) {
        s.cd = this.fireCooldown;
        ctx.game.fx.spawnBolt(ctx.mesh.position.x, 1.35, ctx.mesh.position.z, target, this.damage);
      }
    }
  },

  /* Traps sit in walkable cells. Their only pathfinding weight is pathCost:
   * the seconds of detour the danger is judged to be worth. Visible spikes
   * are worth avoiding; a concealed snare is not priced at all. */
  spikes: {
    id: "spikes",
    item: "spikes",
    label: "Wooden spikes",
    cost: { wood: 6 },
    refund: { wood: 2 },
    hp: 300,               // durability, worn down as it maims
    height: 0.7,
    trap: true,
    pathCost: 2.2,         // plainly visible, so it is routed around when cheap
    dps: 30,
    build() {
      const g = new THREE.Group();
      for (let n = 0; n < 5; n++) {
        const spike = new THREE.Mesh(GEO.spike, MATS.wood);
        const a = (n / 5) * Math.PI * 2;
        spike.position.set(Math.cos(a) * 0.45, 0.35, Math.sin(a) * 0.45);
        spike.rotation.set((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3);
        spike.castShadow = true;
        g.add(spike);
      }
      return g;
    },
    onEnemy(dt, enemy, i, game) {
      enemy.takeDamage(this.dps * dt);
      if (game.grid.damageStructure(i, this.dps * dt)) game.build.destroy(i);
      if (Math.random() < dt * 6) game.fx.spawnChips(enemy.position.x, 0.4, enemy.position.z, 1, 0xb5563f);
    }
  },

  snare: {
    id: "snare",
    item: "snare",
    label: "Snare trap",
    cost: { wood: 5, stone: 4, rope: 1 },
    refund: { wood: 2 },
    hp: 1,                 // one bite
    height: 0.35,
    trap: true,
    pathCost: 0,           // concealed: the flow field sees an ordinary cell
    damage: 50,
    rootTime: 2.5,
    build() {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(GEO.snareRing, MATS.metal);
      ring.position.y = 0.06; ring.receiveShadow = true;
      const jawA = new THREE.Mesh(GEO.snareJaw, MATS.metal);
      jawA.position.set(0, 0.16, -0.32); jawA.rotation.x = 0.5;
      const jawB = jawA.clone(); jawB.position.z = 0.32; jawB.rotation.x = -0.5;
      jawA.castShadow = true; jawB.castShadow = true;
      g.add(ring, jawA, jawB);
      return g;
    },
    onEnemy(dt, enemy, i, game) {
      enemy.takeDamage(this.damage);
      enemy.rooted = this.rootTime;
      game.fx.spawnChips(enemy.position.x, 0.5, enemy.position.z, 6, 0xb5563f);
      game.build.destroy(i);
    }
  },

  /* Stations are plain building blocks so the crafting loop can start:
   * you cannot need a workbench in order to build the first workbench. */
  workbench: {
    id: "workbench",
    category: "station",
    label: "Workbench",
    cost: { wood: 25, stone: 10 },
    refund: { wood: 10, stone: 4 },
    hp: 200,
    height: 1.1,
    blocksPlayer: true,
    station: "craft",
    tier: 1,
    build() {
      const g = new THREE.Group();
      const top = new THREE.Mesh(GEO.benchTop, MATS.wood);
      top.position.y = 0.95; top.castShadow = true; top.receiveShadow = true;
      g.add(top);
      for (const [dx, dz] of [[-0.62, -0.42], [0.62, -0.42], [-0.62, 0.42], [0.62, 0.42]]) {
        const leg = new THREE.Mesh(GEO.benchLeg, MATS.wood);
        leg.position.set(dx, 0.45, dz); leg.castShadow = true;
        g.add(leg);
      }
      const vice = new THREE.Mesh(GEO.benchVice, MATS.stone);
      vice.position.set(0.45, 1.12, 0); vice.castShadow = true;
      g.add(vice);
      return g;
    }
  },

  furnace: {
    id: "furnace",
    category: "station",
    label: "Furnace",
    cost: { stone: 30, wood: 10 },
    refund: { stone: 12, wood: 4 },
    hp: 260,
    height: 1.8,
    blocksPlayer: true,
    station: "smelt",
    build() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(GEO.furnaceBody, MATS.stone);
      body.position.y = 0.68; body.castShadow = true; body.receiveShadow = true;
      const cap = new THREE.Mesh(GEO.furnaceCap, MATS.stone);
      cap.position.y = 1.52; cap.castShadow = true;
      const mouth = new THREE.Mesh(GEO.furnaceMouth, MATS.ember.clone());
      mouth.position.set(0, 0.55, 0.78);
      const light = new THREE.PointLight(0xff8a3c, 0, 7.5, 2);
      light.position.set(0, 0.9, 0.5);
      g.add(body, cap, mouth, light);
      g.userData.mouth = mouth;
      g.userData.light = light;
      mouth.visible = false;
      return g;
    },
    /** Lit only while it is actually smelting; the flicker is a slow sine. */
    onUpdate(dt, ctx) {
      const queue = ctx.game.build.queues.get(ctx.index);
      const burning = !!(queue && queue.busy && !queue.stalled);
      const mouth = ctx.mesh.userData.mouth, light = ctx.mesh.userData.light;
      ctx.state.t += dt;
      mouth.visible = burning;
      if (!burning) { light.intensity = 0; return; }
      const flicker = 0.75 + Math.sin(ctx.state.t * 7.3) * 0.12 + Math.sin(ctx.state.t * 3.1) * 0.08;
      light.intensity = 2.6 * flicker;
      mouth.material.color.setRGB(1, 0.45 + flicker * 0.18, 0.18 * flicker);
      mouth.scale.setScalar(0.94 + flicker * 0.09);
    }
  },

  /* Not a structure at all: placing it hands the cell to the resource system.
   * It rides the build flow purely to reuse aiming, the ghost and the line tool. */
  sapling: {
    id: "sapling",
    item: "seed",
    label: "Sapling",
    cost: {},
    hp: 1,
    height: 1.2,
    plantsResource: "tree",
    build() {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(GEO.trunk, MATS.trunk);
      trunk.position.y = 0.5; trunk.scale.setScalar(0.4);
      const leaf = new THREE.Mesh(GEO.leaf, MATS.leaf);
      leaf.position.y = 1.1; leaf.scale.setScalar(0.4);
      g.add(trunk, leaf);
      return g;
    }
  },

  /* Walkable like a trap, but with no bite: it just burns. Its hit points
   * are its fuel, which is why feeding it uses the repair action. */
  torch: {
    id: "torch",
    item: "torch",
    label: "Torch",
    cost: { wood: 2, cloth: 1 },
    hp: 300,                 // seconds of light
    height: 1.6,
    trap: true,
    pathCost: 0,
    noBar: true,
    burnRate: 1,
    build() {
      const g = new THREE.Group();
      const post = new THREE.Mesh(GEO.torchPost, MATS.wood);
      post.position.y = 0.75; post.castShadow = true;
      const head = new THREE.Mesh(GEO.torchHead, MATS.flame.clone());
      head.position.y = 1.6;
      const light = new THREE.PointLight(0xffa348, 0, 11, 2);
      light.position.y = 1.7;
      g.add(post, head, light);
      g.userData.head = head;
      g.userData.light = light;
      return g;
    },
    onUpdate(dt, ctx) {
      const g = ctx.game.grid;
      const fuel = g.hp[ctx.index];
      if (fuel <= 0) { ctx.game.build.destroy(ctx.index); return; }
      g.hp[ctx.index] = fuel - this.burnRate * dt;

      ctx.state.t += dt;
      // Brighter at night, and guttering as the fuel runs low.
      const night = 1 - ctx.game.cycle.daylight();
      const low = clamp(fuel / 60, 0.35, 1);
      const flicker = 0.82 + Math.sin(ctx.state.t * 8.4) * 0.11 + Math.sin(ctx.state.t * 3.7) * 0.07;
      const head = ctx.mesh.userData.head, light = ctx.mesh.userData.light;
      light.intensity = (0.5 + night * 1.9) * flicker * low;
      light.distance = 9 + night * 4;
      head.scale.setScalar((0.85 + flicker * 0.3) * low);
      head.material.color.setRGB(1, 0.55 + flicker * 0.2, 0.2 * flicker);
    }
  },

  /* The big brother of the torch: far more light, fed with firewood, and
   * hot enough that anything walking through it regrets the shortcut. */
  campfire: {
    id: "campfire",
    item: "campfire",
    label: "Campfire",
    cost: { wood: 10, stone: 6 },
    hp: 900,                 // seconds of burn
    height: 1.2,
    trap: true,
    station: "cook",
    pathCost: 3,             // plainly a fire; they would rather walk around
    noBar: true,
    burnRate: 1,
    dps: 14,
    build() {
      const g = new THREE.Group();
      for (let n = 0; n < 8; n++) {
        const stone = new THREE.Mesh(GEO.fireStone, MATS.rock);
        const a = (n / 8) * Math.PI * 2;
        stone.position.set(Math.cos(a) * 0.72, 0.12, Math.sin(a) * 0.72);
        stone.rotation.set(Math.random(), Math.random(), Math.random());
        stone.castShadow = true; stone.receiveShadow = true;
        g.add(stone);
      }
      for (let n = 0; n < 3; n++) {
        const log = new THREE.Mesh(GEO.fireLog, MATS.wood);
        log.position.y = 0.2;
        log.rotation.set(Math.PI / 2.4, (n / 3) * Math.PI * 2, 0);
        log.castShadow = true;
        g.add(log);
      }
      const flame = new THREE.Mesh(GEO.fireFlame, MATS.flame.clone());
      flame.position.y = 0.72;
      const light = new THREE.PointLight(0xff9a3c, 0, 18, 2);
      light.position.y = 1.1;
      g.add(flame, light);
      g.userData.flame = flame;
      g.userData.light = light;
      return g;
    },
    onUpdate(dt, ctx) {
      const grid = ctx.game.grid;
      const fuel = grid.hp[ctx.index];
      if (fuel <= 0) { ctx.game.build.destroy(ctx.index); return; }
      grid.hp[ctx.index] = fuel - this.burnRate * dt;

      ctx.state.t += dt;
      const night = 1 - ctx.game.cycle.daylight();
      const low = clamp(fuel / 120, 0.3, 1);
      const flicker = 0.85 + Math.sin(ctx.state.t * 6.1) * 0.1 + Math.sin(ctx.state.t * 2.4) * 0.06;
      const flame = ctx.mesh.userData.flame, light = ctx.mesh.userData.light;
      light.intensity = (0.8 + night * 2.6) * flicker * low;
      light.distance = 13 + night * 9;
      flame.scale.set(0.9 + flicker * 0.2, (0.8 + flicker * 0.4) * low, 0.9 + flicker * 0.2);
      flame.rotation.y += dt * 1.6;
      flame.material.color.setRGB(1, 0.45 + flicker * 0.25, 0.15 * flicker);
    },
    onEnemy(dt, enemy, i, game) {
      enemy.takeDamage(this.dps * dt);
      if (Math.random() < dt * 4) game.fx.spawnChips(enemy.position.x, 0.7, enemy.position.z, 1, 0xffb257);
    }
  },

  workbench2: {
    id: "workbench2",
    category: "station",
    label: "Reinforced bench",
    cost: { wood: 30, stone: 20, steel_ingot: 4 },
    refund: { wood: 12, stone: 8, steel_ingot: 2 },
    hp: 340,
    height: 1.2,
    blocksPlayer: true,
    station: "craft",
    tier: 2,
    build() {
      const g = new THREE.Group();
      const top = new THREE.Mesh(GEO.benchTop, MATS.wood);
      top.position.y = 1.0; top.castShadow = true; top.receiveShadow = true;
      g.add(top);
      for (const [dx, dz] of [[-0.62, -0.42], [0.62, -0.42], [-0.62, 0.42], [0.62, 0.42]]) {
        const leg = new THREE.Mesh(GEO.benchLeg, MATS.steel);
        leg.position.set(dx, 0.48, dz); leg.castShadow = true;
        g.add(leg);
      }
      const vice = new THREE.Mesh(GEO.benchVice, MATS.steel);
      vice.position.set(0.45, 1.17, 0); vice.castShadow = true;
      const anvil = new THREE.Mesh(GEO.benchVice, MATS.iron);
      anvil.position.set(-0.4, 1.15, 0); anvil.scale.set(1.4, 1.2, 1.6); anvil.castShadow = true;
      g.add(vice, anvil);
      return g;
    }
  },

  coal_torch: {
    id: "coal_torch",
    item: "coal_torch",
    label: "Coal torch",
    cost: { wood: 2, coal: 1 },
    hp: 900,
    height: 1.6,
    trap: true,
    pathCost: 0,
    noBar: true,
    burnRate: 1,
    build() { return STRUCTURES.torch.build(); },
    onUpdate(dt, ctx) { STRUCTURES.torch.onUpdate.call(this, dt, ctx); }
  },

  iron_spikes: {
    id: "iron_spikes",
    item: "iron_spikes",
    label: "Iron spikes",
    cost: { stone: 4, iron_ingot: 2 },
    refund: { stone: 1 },
    hp: 700,
    height: 0.8,
    trap: true,
    pathCost: 3.4,
    dps: 68,
    build() {
      const g = new THREE.Group();
      for (let n = 0; n < 5; n++) {
        const spike = new THREE.Mesh(GEO.spike, MATS.iron);
        const a = (n / 5) * Math.PI * 2;
        spike.position.set(Math.cos(a) * 0.45, 0.4, Math.sin(a) * 0.45);
        spike.scale.setScalar(1.15);
        spike.rotation.set((Math.random() - 0.5) * 0.25, 0, (Math.random() - 0.5) * 0.25);
        spike.castShadow = true;
        g.add(spike);
      }
      return g;
    },
    onEnemy(dt, enemy, i, game) {
      enemy.takeDamage(this.dps * dt);
      if (game.grid.damageStructure(i, this.dps * dt * 0.35)) game.build.destroy(i);
      if (Math.random() < dt * 6) game.fx.spawnChips(enemy.position.x, 0.4, enemy.position.z, 1, 0xb5563f);
    }
  },

  steel_ballista: {
    id: "steel_ballista",
    item: "steel_ballista",
    label: "Steel ballista",
    cost: { steel_ingot: 6, rope: 3 },
    refund: { steel_ingot: 3, rope: 1 },
    hp: 520,
    height: 2.2,
    blocksPlayer: true,
    range: 13.5,
    damage: 58,
    fireCooldown: 1.05,
    build() {
      const g = STRUCTURES.ballista.build();
      g.traverse(o => { if (o.isMesh) o.material = MATS.steel; });
      return g;
    },
    onUpdate(dt, ctx) { STRUCTURES.ballista.onUpdate.call(this, dt, ctx); }
  },

  blast_furnace: {
    id: "blast_furnace",
    category: "station",
    label: "Blast furnace",
    cost: { stone: 50, iron_ingot: 6 },
    refund: { stone: 20, iron_ingot: 3 },
    hp: 420,
    height: 2.1,
    blocksPlayer: true,
    station: "smelt",
    tier: 2,
    craftSpeed: 2,
    build() {
      const g = STRUCTURES.furnace.build();
      g.scale.setScalar(1.18);
      const band = new THREE.Mesh(GEO.chestBand, MATS.iron);
      band.position.y = 1.05; band.castShadow = true;
      g.add(band);
      return g;
    },
    onUpdate(dt, ctx) { STRUCTURES.furnace.onUpdate.call(this, dt, ctx); }
  },

  iron_chest: {
    id: "iron_chest",
    category: "station",
    label: "Iron chest",
    cost: { wood: 20, iron_ingot: 6 },
    refund: { wood: 8, iron_ingot: 3 },
    hp: 480,
    height: 1.0,
    blocksPlayer: true,
    station: "storage",
    slots: 48,
    build() {
      const g = STRUCTURES.chest.build();
      g.traverse(o => { if (o.isMesh && o.material === MATS.wood) o.material = MATS.iron; });
      return g;
    }
  },

  chest: {
    id: "chest",
    category: "station",
    label: "Chest",
    cost: { wood: 20 },
    refund: { wood: 8 },
    hp: 150,
    height: 1.0,
    blocksPlayer: true,
    station: "storage",
    build() {
      const g = new THREE.Group();
      const box = new THREE.Mesh(GEO.chestBox, MATS.wood);
      box.position.y = 0.34; box.castShadow = true; box.receiveShadow = true;
      const lid = new THREE.Mesh(GEO.chestLid, MATS.wood);
      lid.position.y = 0.76; lid.castShadow = true;
      const band = new THREE.Mesh(GEO.chestBand, MATS.metal);
      band.position.y = 0.55; band.castShadow = true;
      g.add(box, lid, band);
      return g;
    }
  },

  iron_wall: {
    id: "iron_wall",
    label: "Iron wall",
    category: "wall",
    cost: { stone: 6, iron_ingot: 3 },
    refund: { stone: 2, iron_ingot: 1 },
    hp: 2200,
    height: 2.2,
    blocksPlayer: true,
    connect: "wall",
    build(mask) {
      const g = new THREE.Group();
      addArms(g, mask, GEO.stoneArm, GEO.stonePost, GEO.stoneBrace, MATS.iron, 1.1, 1.15);
      return g;
    }
  },

  steel_wall: {
    id: "steel_wall",
    label: "Steel wall",
    category: "wall",
    cost: { stone: 6, steel_ingot: 3 },
    refund: { stone: 2, steel_ingot: 1 },
    hp: 5200,
    height: 2.3,
    blocksPlayer: true,
    connect: "wall",
    build(mask) {
      const g = new THREE.Group();
      addArms(g, mask, GEO.stoneArm, GEO.stonePost, GEO.stoneBrace, MATS.steel, 1.15, 1.2);
      return g;
    }
  },

  iron_gate: {
    id: "iron_gate",
    label: "Iron gate",
    category: "gate",
    cost: { iron_ingot: 4, rope: 2 },
    refund: { iron_ingot: 2 },
    hp: 1600,
    height: 1.9,
    blocksPlayer: false,
    connect: "wall",
    build(mask, meta) {
      const g = new THREE.Group();
      const half = CONFIG.grid.cell / 2 - 0.16;
      const left = new THREE.Mesh(GEO.gatePost, MATS.iron);
      left.position.set(-half, 0.95, 0);
      const right = left.clone(); right.position.x = half;
      const bar = new THREE.Mesh(GEO.gateBar, MATS.iron);
      bar.position.y = 1.7;
      const plank = new THREE.Mesh(GEO.gatePlank, MATS.iron);
      plank.position.y = 0.66;
      [left, right, bar, plank].forEach(m => { m.castShadow = true; });
      g.add(left, right, bar, plank);
      const auto = gateOrientation(mask);
      g.rotation.y = auto !== null ? auto : (meta ? meta.orient : 0);
      return g;
    }
  },

  gate: {
    id: "gate",
    category: "gate",
    label: "Gate",
    cost: { wood: 8, stone: 2 },
    refund: { wood: 3 },
    hp: 150,
    height: 1.8,
    blocksPlayer: false,   // you walk through it, the enemies have to chew it
    connect: "wall",
    build(mask, meta) {
      const g = new THREE.Group();
      const half = CONFIG.grid.cell / 2 - 0.16;
      const left = new THREE.Mesh(GEO.gatePost, MATS.wood);
      left.position.set(-half, 0.9, 0);
      const right = left.clone(); right.position.x = half;
      const bar = new THREE.Mesh(GEO.gateBar, MATS.wood);
      bar.position.y = 1.62;
      const plank = new THREE.Mesh(GEO.gatePlank, MATS.wood);
      plank.position.y = 0.62;
      left.castShadow = true; right.castShadow = true;
      bar.castShadow = true; plank.castShadow = true;
      g.add(left, right, bar, plank);
      const auto = gateOrientation(mask);
      g.rotation.y = auto !== null ? auto : (meta ? meta.orient : 0);
      return g;
    }
  }
};
