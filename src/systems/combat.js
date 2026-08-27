import { CONFIG } from "../data/config.js";

export class CombatSystem {
  constructor(game) { this.game = game; this._arcBuf = []; }

  nearestEnemy(pos, range) {
    let best = null, bestD = range * range;
    for (const e of this.game.enemies) {
      if (e.dead) continue;
      const dx = e.position.x - pos.x, dz = e.position.z - pos.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  playerSwing(player) {
    const cfg = CONFIG.player.attack;
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    for (const e of this.game.enemies) {
      if (e.dead) continue;
      const dx = e.position.x - player.position.x;
      const dz = e.position.z - player.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > cfg.range) continue;
      if ((dx * fx + dz * fz) / (dist || 1) < Math.cos(cfg.arc / 2)) continue;
      e.takeDamage(this.game.equip.damage);
    }
    {
      this._arcBuf.length = 0;
      this.game.resources.nodesInArc(player.position, player.yaw, cfg.range, cfg.arc, this._arcBuf);
      const equip = this.game.equip;
      for (const n of this._arcBuf) {
        const mul = equip.harvestFor(n.def.material);
        if (mul <= 0 || (n.def.minHarvest && mul < n.def.minHarvest)) { this._warnTool(n.def); continue; }
        n.takeDamage(equip.damage * mul);
      }
    }
    this.game.fx.slash(player);
  }

  /** Throttled nudge when the held item is too crude for the material. */
  _warnTool(def) {
    if (this._toolWarn && performance.now() - this._toolWarn < 2500) return;
    this._toolWarn = performance.now();
    this.game.ui.toast(def.label + " needs a proper tool - try a pick");
  }

  separation(self, radius) {
    let sx = 0, sz = 0;
    for (const other of this.game.enemies) {
      if (other === self || other.dead) continue;
      const dx = self.position.x - other.position.x;
      const dz = self.position.z - other.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > radius * radius || d2 < 1e-5) continue;
      const d = Math.sqrt(d2);
      sx += (dx / d) * (1 - d / radius) * 0.9;
      sz += (dz / d) * (1 - d / radius) * 0.9;
    }
    return { x: sx, z: sz };
  }
}
