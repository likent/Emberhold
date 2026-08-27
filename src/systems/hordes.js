import { CONFIG } from "../data/config.js";

/**
 * Sends bands across the map at irregular intervals. They enter from one
 * edge, dawdle at a couple of points and leave by another - the core means
 * nothing to them, but you might.
 */
export class HordeSystem {
  constructor(game) { this.game = game; this.reset(); }

  reset() { this.timer = this._gap(); }

  _gap() {
    const c = CONFIG.hordes;
    return c.minGap + Math.random() * (c.maxGap - c.minGap);
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this._gap();
    this.spawnHorde();
  }

  /** A point on a random edge of the map. */
  _edgePoint(side) {
    const g = this.game.grid;
    const w = g.w * g.cell / 2 - 2, h = g.h * g.cell / 2 - 2;
    const t = (Math.random() - 0.5) * 2;
    if (side === 0) return { x: t * w, z: -h };
    if (side === 1) return { x: w, z: t * h };
    if (side === 2) return { x: t * w, z: h };
    return { x: -w, z: t * h };
  }

  spawnHorde() {
    const c = CONFIG.hordes, g = this.game.grid;
    if (this.game.enemies.length >= CONFIG.enemy.maxAlive - 10) return;

    const side = Math.floor(Math.random() * 4);
    const entry = this._edgePoint(side);
    const exit = this._edgePoint((side + 2) % 4);
    const stops = c.stops[0] + Math.floor(Math.random() * (c.stops[1] - c.stops[0] + 1));
    const route = [];
    for (let i = 0; i < stops; i++) {
      route.push({
        x: (Math.random() - 0.5) * g.w * g.cell * 0.8,
        z: (Math.random() - 0.5) * g.h * g.cell * 0.8
      });
    }
    route.push(exit);

    const size = c.minSize + Math.floor(Math.random() * (c.maxSize - c.minSize + 1));
    for (let i = 0; i < size; i++) {
      const type = this._rollType();
      this.game.spawnEnemy(
        entry.x + (Math.random() - 0.5) * 4,
        entry.z + (Math.random() - 0.5) * 4,
        type,
        { mode: "wander", route: route.slice(), lifetime: c.lifetime }
      );
    }
    this.game.ui.toast("A band is crossing the valley");
  }

  _rollType() {
    const mix = CONFIG.hordes.mix;
    let total = 0;
    for (const id in mix) total += mix[id];
    let roll = Math.random() * total;
    for (const id in mix) {
      roll -= mix[id];
      if (roll <= 0) return CONFIG.enemyTypes[id];
    }
    return CONFIG.enemyTypes.raider;
  }
}
