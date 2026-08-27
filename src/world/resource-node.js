import { clamp, costText } from "../core/util.js";
import { CONFIG } from "../data/config.js";
import { RESOURCES } from "../data/resources.js";

class ResourceNode {
  constructor(game, def, cx, cy, growth) {
    this.game = game;
    this.def = def;
    this.cx = cx; this.cy = cy;
    this.growth = clamp(growth, 0.05, 1);
    this.hp = this.maxHp;
    this.dead = false;
    this.hitFlash = 0;
    this.cooldown = 0;
    this.spent = false;
    this.bar = null;

    this.object = def.build();
    this.object.position.set(game.grid.centerX(cx), 0, game.grid.centerZ(cy));
    this._applyScale();
    game.scene.add(this.object);

    if (def.blocksMovement) game.grid.setBlocker(cx, cy, this);
    else game.grid.node[game.grid.idx(cx, cy)] = this;
  }

  get maxHp() { return this.def.hp * (0.3 + 0.7 * this.growth); }
  get position() { return this.object.position; }
  get mature() { return this.growth >= 1; }

  _applyScale() {
    const s = this.def.minScale + (1 - this.def.minScale) * this.growth;
    this.object.scale.setScalar(s);
  }

  update(dt) {
    // An endless seam is an ordinary node that grows its own rock back: the
    // bar refills in place instead of the thing locking itself out.
    if (this.def.infinite) {
      if (this.hp < this.maxHp) {
        this.hp = Math.min(this.maxHp, this.hp + (this.def.hp / this.def.cooldown) * dt);
        if (!this.bar) this.bar = this.game.bars.create(this.def.barColor, 1.15);
        if (this.hp >= this.maxHp) this.spent = false;
      }
      if (this.bar) {
        this.game.bars.place(this.bar, this.position.x, this.def.barY, this.position.z);
        this.game.bars.set(this.bar, this.hp / this.maxHp);
      }
      if (this.hitFlash > 0) {
        this.hitFlash -= dt;
        this.object.rotation.z = this.hitFlash > 0 ? Math.sin(this.hitFlash * 60) * 0.06 : 0;
      }
      return;
    }
    if (this.growth < 1) {
      this.growth = Math.min(1, this.growth + dt / this.def.growTime);
      this.hp = Math.min(this.hp + dt * (this.def.hp / this.def.growTime), this.maxHp);
      this._applyScale();
    }
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      this.object.rotation.z = this.hitFlash > 0 ? Math.sin(this.hitFlash * 60) * 0.06 : 0;
    }
    if (this.bar) {
      const s = this.object.scale.x;
      this.game.bars.place(this.bar, this.position.x, this.def.barY * s, this.position.z);
      this.game.bars.set(this.bar, this.hp / this.maxHp);
    }
  }

  takeDamage(amount) {
    // A stripped seam gives nothing until the rock has fully built back,
    // otherwise you could stand there and cash in on every single swing.
    if (this.spent || this.hp <= 0) return;
    this.hp -= amount;
    this.hitFlash = 0.16;
    if (!this.bar) this.bar = this.game.bars.create(this.def.barColor, 1.15);
    if (this.hp > 0) return;
    if (this.def.infinite) {
      // Never used up: it pays out, and the rock builds back on its own.
      this.hp = 0;
      this.spent = true;
      this.game.resources.payout(this);
      return;
    }
    if (!this.dead) {
      this.dead = true;
      this.game.resources.onHarvested(this);
    }
  }

  dispose(silent) {
    if (this.bar) { this.game.bars.destroy(this.bar); this.bar = null; }
    if (silent) this.game.scene.remove(this.object);
    else this.game.fx.playCollapse(this.object);
    const g = this.game.grid;
    if (g.node[g.idx(this.cx, this.cy)] === this) g.node[g.idx(this.cx, this.cy)] = null;
    if (this.def.blocksMovement) g.clearCell(this.cx, this.cy);
  }
}

/** Owns all harvestables and the regrowth cycle. */
export class ResourceSystem {
  constructor(game) {
    this.game = game;
    this.nodes = [];
  }

  populate() {
    for (let n = 0; n < CONFIG.world.trees; n++) this.plant(RESOURCES.tree, 1);
    for (let n = 0; n < CONFIG.world.bushes; n++) this.plant(RESOURCES.bush, 1);
    for (let n = 0; n < CONFIG.world.berries; n++) this.plant(RESOURCES.berrybush, 1);
    for (let n = 0; n < CONFIG.world.rocks; n++) this.plant(RESOURCES.rock, 1);
    for (let n = 0; n < CONFIG.world.ore; n++) this.plant(RESOURCES.ore, 1);
    for (let n = 0; n < CONFIG.world.mines; n++) this.plant(RESOURCES.mine, 1, CONFIG.world.siteMinDistance);
    for (let n = 0; n < CONFIG.world.quarries; n++) this.plant(RESOURCES.quarry, 1, CONFIG.world.siteMinDistance);
  }

  /** Puts a node on a specific cell, for planting by hand. */
  plantAt(def, cx, cy, growth) {
    const g = this.game.grid;
    if (!g.inBounds(cx, cy) || !g.isFree(g.idx(cx, cy)) || g.node[g.idx(cx, cy)]) return null;
    const node = new ResourceNode(this.game, def, cx, cy, growth);
    this.nodes.push(node);
    this.game.paths.invalidate();
    return node;
  }

  /** Finds a free cell away from the player and drops a node there. */
  plant(def, growth, minFromCentre) {
    const g = this.game.grid;
    for (let attempt = 0; attempt < 200; attempt++) {
      const cx = Math.floor(Math.random() * g.w);
      const cy = Math.floor(Math.random() * g.h);
      const i = g.idx(cx, cy);
      if (!g.isFree(i) || g.node[i]) continue;
      const x = g.centerX(cx), z = g.centerZ(cy);
      // Mines sit well away from the middle, so where you settle is a choice.
      if (minFromCentre && Math.hypot(x, z) < minFromCentre) continue;
      const p = this.game.player;
      if (p && Math.hypot(x - p.position.x, z - p.position.z) < 6) continue;
      if (!p && Math.hypot(x, z) < 8) continue;
      this.nodes.push(new ResourceNode(this.game, def, cx, cy, growth));
      return true;
    }
    return false;
  }

  /** Hands over what the node is worth, without touching its lifecycle. */
  payout(node) {
    const y = node.def.yield;
    const scale = 0.3 + 0.7 * node.growth;     // saplings pay out less
    const x = node.position.x, z = node.position.z;
    const gained = {}, spilled = {};
    const award = (key, amount) => {
      const took = this.game.packs.giveOrDrop(key, amount, x, z);
      if (took > 0) gained[key] = took;
      if (amount > took) spilled[key] = amount - took;
      const tally = this.game.stats.gathered;
      tally[key] = (tally[key] || 0) + amount;
    };
    for (const key in y) award(key, Math.max(1, Math.round(y[key] * scale)));
    // Extra drops, rolled per harvest and scaled by how grown the node was.
    for (const drop of node.def.drops || []) {
      if (Math.random() > drop.chance * node.growth) continue;
      award(drop.id, drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1)));
    }
    this.game.fx.spawnChips(x, 0.9, z, 7, node.def.chipColor);
    const took = Object.keys(gained).length ? "+" + costText(gained) : "";
    const left = Object.keys(spilled).length ? "dropped " + costText(spilled) + " - pack full" : "";
    this.game.ui.toast([took, left].filter(Boolean).join(", "));
  }

  onHarvested(node) {
    this.payout(node);
    // Wood and stone come back somewhere else; iron on the map does not.
    if (node.def.regrow !== false) this.plant(node.def, 0.06);
  }

  nearestNode(pos, range) {
    let best = null, bestD = range * range;
    for (const n of this.nodes) {
      if (n.dead || n.growth < CONFIG.player.minHarvestGrowth) continue;
      const dx = n.position.x - pos.x, dz = n.position.z - pos.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  nodesInArc(pos, yaw, range, arc, out) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    for (const n of this.nodes) {
      if (n.dead || n.growth < CONFIG.player.minHarvestGrowth) continue;
      const dx = n.position.x - pos.x, dz = n.position.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + 0.6) continue;
      if ((dx * fx + dz * fz) / (dist || 1) < Math.cos(arc / 2)) continue;
      out.push(n);
    }
    return out;
  }

  update(dt) {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      n.update(dt);
      if (n.dead) { n.dispose(); this.nodes.splice(i, 1); this.game.paths.invalidate(); }
    }
  }

  reset() {
    for (const n of this.nodes) n.dispose(true);   // no farewell animation for a wiped world
    this.nodes.length = 0;
    this.populate();
  }
}
