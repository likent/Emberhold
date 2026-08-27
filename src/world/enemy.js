import { resolveMove, blocked } from "../core/collision.js";
import { CELL_STRUCT, CELL_TRAP } from "../core/grid.js";
import { clamp, lerpAngle, costText } from "../core/util.js";
import { CONFIG } from "../data/config.js";
import { Entity } from "./entity.js";

export class Enemy extends Entity {
  dispose() {
    if (this.bar) { this.game.bars.destroy(this.bar); this.bar = null; }
    if (!this.leaving) this.game.scene.remove(this.object);   // already handed to the fade
  }

  constructor(game, x, z, type, opts) {
    super(game);
    this.type = type || CONFIG.enemyTypes.raider;
    this.mode = (opts && opts.mode) || "siege";
    this.route = (opts && opts.route) || null;
    this.routeIndex = 0;
    this.idleT = 0;
    this.life = (opts && opts.lifetime) || 0;
    this.sidestep = 0;
    this.hp = this.type.hp;
    this.attackCd = Math.random() * 0.5;
    this.hitFlash = 0;
    this.stuck = 0;
    this.rooted = 0;
    this.bar = null;
    this.object.position.set(x, 0, z);

    const t = this.type, b = t.body;
    this.material = new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), this.material);
    body.position.y = b.h / 2 + 0.1; body.castShadow = true;
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(b.w * 0.62, b.w * 0.56, b.d * 0.83),
      new THREE.MeshStandardMaterial({ color: t.headColor, roughness: 0.9 })
    );
    head.position.y = b.h + 0.42; head.castShadow = true;
    this.object.add(body, head);
    game.scene.add(this.object);
  }

  get position() { return this.object.position; }

  update(dt) {
    const game = this.game, grid = game.grid, player = game.player;
    const path = game.paths.field(this.type);
    if (!player || !path) return;

    this.attackCd -= dt;
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      this.material.color.setHex(this.hitFlash > 0 ? this.type.hitColor : this.type.color);
    }
    if (this.bar) {
      this.game.bars.place(this.bar, this.position.x, this.type.body.h + 1.1, this.position.z);
      this.game.bars.set(this.bar, this.hp / this.type.hp);
    }

    // Standing on a trap hurts regardless of what the route says.
    const tcx = grid.cellX(this.position.x), tcy = grid.cellY(this.position.z);
    if (grid.inBounds(tcx, tcy)) {
      const ti = grid.idx(tcx, tcy);
      if (grid.type[ti] === CELL_TRAP && grid.def[ti].onEnemy) grid.def[ti].onEnemy(dt, this, ti, game);
      if (this.dead) return;
    }

    if (this.rooted > 0) {          // caught: it can neither move nor swing
      this.rooted -= dt;
      this.object.rotation.z = Math.sin(this.rooted * 40) * 0.12;
      return;
    }
    this.object.rotation.z = 0;

    const dxp = player.position.x - this.position.x;
    const dzp = player.position.z - this.position.z;

    if (!player.downed && Math.hypot(dxp, dzp) <= CONFIG.enemy.attackRange) {
      this._face(dxp, dzp, dt);
      if (this.attackCd <= 0) {
        this.attackCd = this.type.attackCooldown;
        player.takeDamage(this.type.damage);
      }
      return;
    }

    // Close enough to smell you AND with a clear run at you: charge. If
    // anything solid is in the way the route decides instead - otherwise a
    // body would gnaw through a steel wall with an open gate three cells off.
    if (!player.downed && Math.hypot(dxp, dzp) <= this.type.aggroRange &&
        !grid.lineBlocked(this.position.x, this.position.z, player.position.x, player.position.z)) {
      this._steer(dxp, dzp, dt);
      if (this.stuck > 0.6) this._chewAdjacent(dt);
      return;
    }

    if (this.mode === "critter") { this._graze(dt); return; }
    if (this.mode === "wander") { this._wander(dt); return; }

    const cx = grid.cellX(this.position.x), cy = grid.cellY(this.position.z);
    if (!grid.inBounds(cx, cy)) { this._steer(dxp, dzp, dt); return; }
    const i = grid.idx(cx, cy);

    // Safety net: if this body has stopped making progress for any reason,
    // it stops trusting the route and attacks whatever it is leaning on.
    if (this.stuck > 0.6 && this._chewAdjacent(dt)) return;

    let dirX, dirZ;
    if (path.hasRoute(i)) {
      const step = path.stepFrom(cx, cy);
      if (!step) { dirX = dxp; dirZ = dzp; }
      else {
        const fx = step.dx, fy = step.dy;
        const ni = grid.idx(cx + fx, cy + fy);
        if (grid.type[ni] === CELL_STRUCT) {
          // The field already priced breaking in below walking around.
          this._face(fx, fy, dt);
          if (grid.damageStructure(ni, this.type.dpsVsStructure * dt)) game.build.destroy(ni);
          game.fx.spawnChips(grid.centerX(cx + fx), 0.8, grid.centerZ(cy + fy), 1, 0xd9b678);
          return;
        }
        dirX = grid.centerX(cx + fx) - this.position.x;
        dirZ = grid.centerZ(cy + fy) - this.position.z;
      }
    } else {
      dirX = dxp; dirZ = dzp;
    }
    this._steer(dirX, dirZ, dt);
  }

  /** Game, not raiders: they mind their own business and bolt when seen. */
  _graze(dt) {
    const player = this.game.player;
    const dx = this.position.x - player.position.x, dz = this.position.z - player.position.z;
    const dist = Math.hypot(dx, dz);
    if (!player.downed && dist < this.type.fleeRange) {
      this._steer(dx, dz, dt);              // away, not towards
      if (this.stuck > 0.5) { this.sidestep = 0.7; this.stuck = 0; }
      return;
    }
    this._wander(dt);
  }

  /**
   * No flow field for these: they walk straight at their next waypoint and
   * break whatever is in the way, which is exactly the behaviour wanted.
   * Rocks cannot be broken, so a body pinned against one sidesteps instead.
   */
  _wander(dt) {
    this.life -= dt;
    if (this.life <= 0) { this._leave(); return; }

    if (this.idleT > 0) {
      this.idleT -= dt;
      this.object.rotation.y += dt * 0.6;      // looking around
      return;
    }

    const goal = this.route[this.routeIndex];
    if (!goal) { this._leave(); return; }
    const dx = goal.x - this.position.x, dz = goal.z - this.position.z;
    if (Math.hypot(dx, dz) < 1.6) {
      this.routeIndex++;
      if (this.routeIndex >= this.route.length) { this._leave(); return; }
      const idle = CONFIG.hordes.idle;
      this.idleT = idle[0] + Math.random() * (idle[1] - idle[0]);
      return;
    }

    if (this.sidestep > 0) {
      this.sidestep -= dt;
      this._steer(-dz, dx, dt);               // perpendicular shuffle
      return;
    }
    this._steer(dx, dz, dt);

    if (this.stuck > 0.5) {
      // Something is in the way: break it if it can be broken, walk round it if not.
      if (!this._chewAdjacent(dt, true)) { this.sidestep = 0.8; this.stuck = 0; }
    }
  }

  /** Wanderers fade out when their business is done. */
  _leave() {
    if (this.dead) return;
    this.dead = true;
    if (this.bar) { this.game.bars.destroy(this.bar); this.bar = null; }
    this.game.fx.playCollapse(this.object);
    this.leaving = true;
  }

  _steer(dirX, dirZ, dt) {
    const len = Math.hypot(dirX, dirZ) || 1;
    dirX /= len; dirZ /= len;
    const sep = this.game.combat.separation(this, CONFIG.enemy.separation);
    dirX += sep.x; dirZ += sep.z;
    const l2 = Math.hypot(dirX, dirZ) || 1;
    dirX /= l2; dirZ /= l2;
    const speed = this.type.speed;
    const beforeX = this.position.x, beforeZ = this.position.z;
    const wantX = this.position.x + dirX * speed * dt;
    const wantZ = this.position.z + dirZ * speed * dt;
    resolveMove(this.game.grid, this.position, wantX, wantZ, this.type.radius, false);

    const moved = Math.hypot(this.position.x - beforeX, this.position.z - beforeZ);
    // Only geometry counts as being stuck. Being jostled by the crowd in a
    // corridor is not a reason to start eating the wall - and once one body
    // started chewing, standing still kept proving itself stuck for ever.
    const walled = blocked(this.game.grid, wantX, wantZ, this.type.radius, false);
    if (moved < speed * dt * 0.4 && walled) this.stuck += dt;
    else this.stuck = Math.max(0, this.stuck - dt * 3);
    this._face(dirX, dirZ, dt);
  }

  /** Attacks the adjacent structure that best shortens the route. */
  _chewAdjacent(dt, sparingCore) {
    const g = this.game.grid, path = this.game.paths.fields[this.type.id];
    const cx = g.cellX(this.position.x), cy = g.cellY(this.position.z);
    let best = -1, bestDist = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx, ny = cy + dy;
        if (!g.inBounds(nx, ny)) continue;
        const ni = g.idx(nx, ny);
        if (g.type[ni] !== CELL_STRUCT) continue;
        if (sparingCore && g.def[ni] && g.def[ni].isCore) continue;
        const d = path && path.hasRoute(ni) ? path.dist[ni] : g.hp[ni];
        if (d < bestDist) { bestDist = d; best = ni; }
      }
    }
    if (best < 0) return false;
    // Chewing does not move you, so the stuck timer would never clear. Let it
    // lapse periodically and give walking another try.
    this.chewT = (this.chewT || 0) + dt;
    if (this.chewT > 2) { this.chewT = 0; this.stuck = 0; this.sidestep = 0.5; return false; }
    const bx = best % g.w, by = (best / g.w) | 0;
    this._face(bx - cx, by - cy, dt);
    if (g.damageStructure(best, this.type.dpsVsStructure * dt)) {
      this.game.build.destroy(best);
      this.stuck = 0;
    }
    this.game.fx.spawnChips(g.centerX(bx), 0.8, g.centerZ(by), 1, 0xd9b678);
    return true;
  }

  _face(dx, dz, dt) {
    this.object.rotation.y = lerpAngle(this.object.rotation.y, Math.atan2(dx, dz), clamp(10 * dt, 0, 1));
  }

  takeDamage(amount) {
    this.hp -= amount;
    this.hitFlash = 0.12;
    if (!this.bar) this.bar = this.game.bars.create(0xe2564a, 0.85 + this.type.radius);
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      if (this.type.drops) {
        const gained = {}, spilled = {};
        for (const id in this.type.drops) {
          const want = this.type.drops[id];
          const took = this.game.packs.giveOrDrop(id, want, this.position.x, this.position.z);
          if (took > 0) gained[id] = took;
          if (want > took) spilled[id] = want - took;
        }
        const a = Object.keys(gained).length ? "+" + costText(gained) : "";
        const b = Object.keys(spilled).length ? "dropped " + costText(spilled) + " - pack full" : "";
        this.game.ui.toast([a, b].filter(Boolean).join(", "));
      } else this.game.stats.kills++;
      // No loot from corpses by design: resources come from the world only.
      this.game.fx.spawnChips(this.position.x, 0.9, this.position.z, 6, 0xb5563f);
    }
  }
}
