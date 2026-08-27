import { CONFIG } from "../data/config.js";

/**
 * Keeps a few animals roaming; they are the only meat on the map. They enter
 * from an edge, amble through four random points and never take an interest
 * in the camp - a boar flees rather than fights.
 */
export class Wildlife {
  constructor(game) {
    this.game = game;
    this.timer = 20;
  }

  update(dt) {
    const alive = this.game.enemies.filter(e => e.mode === "critter").length;
    this.timer -= dt;
    if (this.timer > 0 || alive >= CONFIG.world.critters) return;
    this.timer = 25;
    const g = this.game.grid;
    const edge = (Math.random() - 0.5) * g.w * g.cell * 0.9;
    const side = Math.random() < 0.5 ? -1 : 1;
    const route = [];
    for (let i = 0; i < 4; i++) {
      route.push({ x: (Math.random() - 0.5) * g.w * g.cell * 0.8, z: (Math.random() - 0.5) * g.h * g.cell * 0.8 });
    }
    this.game.spawnEnemy(edge, side * g.h * g.cell * 0.45, CONFIG.enemyTypes.critter,
                         { mode: "critter", route, lifetime: 9999 });
  }
}
