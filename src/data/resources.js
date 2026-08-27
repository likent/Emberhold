import { MATS, GEO } from "./materials.js";

/** Harvestable world nodes. Regrow as saplings elsewhere once harvested. */
export const RESOURCES = {
  berrybush: {
    id: "berrybush",
    material: "wood",
    label: "Berry bush",
    hp: 40,
    yield: { berries: 5 },
    growTime: 70,
    blocksMovement: false,
    minScale: 0.3,
    chipColor: 0xc65a7a,
    barColor: 0xc65a7a,
    barY: 1.2,
    build() {
      const g = new THREE.Group();
      for (let n = 0; n < 4; n++) {
        const tuft = new THREE.Mesh(GEO.bushTuft, MATS.scrub);
        const a = (n / 4) * Math.PI * 2 + Math.random();
        tuft.position.set(Math.cos(a) * 0.32, 0.32, Math.sin(a) * 0.32);
        tuft.rotation.set((Math.random() - 0.5) * 0.5, a, (Math.random() - 0.5) * 0.5);
        tuft.castShadow = true;
        g.add(tuft);
      }
      for (let n = 0; n < 6; n++) {
        const berry = new THREE.Mesh(GEO.berry, MATS.berry);
        const a = Math.random() * Math.PI * 2;
        berry.position.set(Math.cos(a) * 0.38, 0.3 + Math.random() * 0.4, Math.sin(a) * 0.38);
        g.add(berry);
      }
      return g;
    }
  },

  bush: {
    id: "bush",
    material: "wood",
    label: "Fibre bush",
    hp: 45,
    yield: { fiber: 4 },
    growTime: 55,            // scrub grows back on its own, unlike timber
    blocksMovement: false,
    minScale: 0.3,
    chipColor: 0x9fbf6a,
    barColor: 0x9fbf6a,
    barY: 1.2,
    build() {
      const g = new THREE.Group();
      for (let n = 0; n < 4; n++) {
        const tuft = new THREE.Mesh(GEO.bushTuft, MATS.scrub);
        const a = (n / 4) * Math.PI * 2 + Math.random();
        tuft.position.set(Math.cos(a) * 0.32, 0.32, Math.sin(a) * 0.32);
        tuft.rotation.set((Math.random() - 0.5) * 0.5, a, (Math.random() - 0.5) * 0.5);
        tuft.castShadow = true;
        g.add(tuft);
      }
      return g;
    }
  },

  tree: {
    id: "tree",
    material: "wood",
    label: "Tree",
    hp: 100,
    yield: { wood: 12 },
    drops: [{ id: "seed", min: 1, max: 2, chance: 0.85 }],
    regrow: false,          // the forest only comes back if you plant it
    growTime: 80,          // seconds from sapling to mature
    blocksMovement: false, // trees are decoration for the pathfinder
    minScale: 0.28,
    chipColor: 0xd9b678,
    barColor: 0x7fc46a,
    barY: 4.1,
    build() {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(GEO.trunk, MATS.trunk);
      trunk.position.y = 1.1;
      const leaf = new THREE.Mesh(GEO.leaf, MATS.leaf);
      leaf.position.y = 2.9;
      trunk.castShadow = true; leaf.castShadow = true;
      g.add(trunk, leaf);
      return g;
    }
  },
  mine: {
    id: "mine",
    material: "ore",
    label: "Iron mine",
    hp: 520,
    yield: { iron_ore: 16 },
    growTime: 1,
    infinite: true,          // never exhausted, just needs time between hauls
    cooldown: 13,
    blocksMovement: true,
    minScale: 1,
    minHarvest: 2,
    chipColor: 0xc08a4a,
    barColor: 0xc08a4a,
    barY: 3.0,
    build() {
      const g = new THREE.Group();
      for (let n = 0; n < 5; n++) {
        const chunk = new THREE.Mesh(GEO.rock, MATS.rock);
        const a = (n / 5) * Math.PI * 2;
        chunk.position.set(Math.cos(a) * 0.75, 0.35 + (n % 2) * 0.6, Math.sin(a) * 0.75);
        chunk.scale.setScalar(0.75 + Math.random() * 0.4);
        chunk.rotation.set(Math.random(), Math.random(), Math.random());
        chunk.castShadow = true; chunk.receiveShadow = true;
        g.add(chunk);
      }
      for (let n = 0; n < 8; n++) {
        const vein = new THREE.Mesh(GEO.oreVein, MATS.ore);
        const a = Math.random() * Math.PI * 2;
        vein.position.set(Math.cos(a) * 0.95, 0.3 + Math.random() * 1.5, Math.sin(a) * 0.95);
        vein.scale.setScalar(1.1 + Math.random() * 0.5);
        vein.rotation.set(Math.random(), Math.random(), Math.random());
        vein.castShadow = true;
        g.add(vein);
      }
      return g;
    }
  },

  ore: {
    id: "ore",
    material: "ore",
    label: "Iron deposit",
    hp: 340,
    yield: { iron_ore: 9 },
    growTime: 260,
    regrow: false,           // what is on the map is all there will ever be
    blocksMovement: true,
    minScale: 0.42,
    minHarvest: 2,          // bare hands and clubs will not crack it
    chipColor: 0xc08a4a,
    barColor: 0xc08a4a,
    barY: 2.0,
    build() {
      const g = new THREE.Group();
      const base = new THREE.Mesh(GEO.rock, MATS.rock);
      base.position.y = 0.5; base.scale.setScalar(0.85);
      base.rotation.set(Math.random(), Math.random(), Math.random());
      base.castShadow = true; base.receiveShadow = true;
      g.add(base);
      for (let n = 0; n < 4; n++) {
        const vein = new THREE.Mesh(GEO.oreVein, MATS.ore);
        const a = Math.random() * Math.PI * 2;
        vein.position.set(Math.cos(a) * 0.62, 0.4 + Math.random() * 0.7, Math.sin(a) * 0.62);
        vein.rotation.set(Math.random(), Math.random(), Math.random());
        vein.castShadow = true;
        g.add(vein);
      }
      return g;
    }
  },

  quarry: {
    id: "quarry",
    material: "stone",
    label: "Stone quarry",
    hp: 420,
    yield: { stone: 22 },
    growTime: 1,
    infinite: true,
    cooldown: 11,
    blocksMovement: true,
    minScale: 1,
    minHarvest: 1,           // a bare fist will not shift it
    chipColor: 0x9aa0a8,
    barColor: 0x9aa0a8,
    barY: 2.8,
    build() {
      const g = new THREE.Group();
      for (let n = 0; n < 6; n++) {
        const slab = new THREE.Mesh(GEO.rock, MATS.rock);
        const a = (n / 6) * Math.PI * 2;
        slab.position.set(Math.cos(a) * 0.8, 0.3 + (n % 3) * 0.5, Math.sin(a) * 0.8);
        slab.scale.set(0.9 + Math.random() * 0.5, 0.55, 0.9 + Math.random() * 0.5);
        slab.rotation.y = Math.random() * Math.PI;
        slab.castShadow = true; slab.receiveShadow = true;
        g.add(slab);
      }
      return g;
    }
  },

  rock: {
    id: "rock",
    material: "stone",
    label: "Rock",
    hp: 200,
    yield: { stone: 10 },
    growTime: 140,
    regrow: false,           // boulders do not grow back either
    blocksMovement: true,  // rocks are impassable, so mining them opens routes
    minScale: 0.34,
    chipColor: 0x9aa0a8,
    barColor: 0x9aa0a8,
    barY: 1.9,
    build() {
      const m = new THREE.Mesh(GEO.rock, MATS.rock);
      m.position.y = 0.55;
      m.rotation.set(Math.random(), Math.random(), Math.random());
      m.castShadow = true; m.receiveShadow = true;
      return m;
    }
  }
};
