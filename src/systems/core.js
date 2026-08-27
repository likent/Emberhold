import { CONFIG } from "../data/config.js";
import { STRUCTURES } from "../data/structures.js";

/**
 * The core, and the one thing you can do with it: pick it up and walk.
 *
 * While it is on your back the core is not a cell any more, so raiders have
 * nothing to besiege but you: the path field collapses to a single source at
 * the player. Moving the base is a deliberate risk, not a free relocation.
 */
export class CoreSystem {
  constructor(game) {
    this.game = game;
    this.cell = -1;
    this.carrying = false;
    this.carriedHp = CONFIG.core.hp;
    this.carriedMesh = null;
    this._btnMode = undefined;
  }

  /** Drops a fresh core in the middle of the map: where a run begins. */
  spawn() {
    const g = this.game.grid;
    const cx = g.w >> 1, cy = g.h >> 1;
    this.game.build.create(cx, cy, STRUCTURES.core);
    this.cell = g.idx(cx, cy);
  }

  position() {
    const g = this.game.grid;
    if (this.carrying) return { x: this.game.player.position.x, z: this.game.player.position.z };
    if (this.cell < 0) return { x: 0, z: 0 };
    return { x: g.centerX(this.cell % g.w), z: g.centerZ((this.cell / g.w) | 0) };
  }

  lift() {
    if (this.carrying || this.cell < 0) return;
    const cp = this.position();
    const player = this.game.player;
    if (Math.hypot(player.position.x - cp.x, player.position.z - cp.z) > CONFIG.core.liftRange) {
      this.game.ui.toast("Step closer to the core");
      return;
    }
    this.carriedHp = this.game.build.lift(this.cell);
    this.cell = -1;
    this.carrying = true;
    this._shoulder();
    this.game.build.ghostKey = "";
    this.game.path.dirty = true;
    this.game.ui.toast("Core lifted - they are coming for you now");
  }

  setDown() {
    if (!this.carrying) return;
    const { cx, cy } = this.game.build.aim;
    if (!this.game.build.canPlace(cx, cy)) { this.game.ui.toast("No room for the core there"); return; }
    this._plant(cx, cy);
    this.game.ui.toast("Core anchored");
  }

  /** Forced drop: finds the closest free cell outward from a point. */
  dropNear(x, z) {
    if (!this.carrying) return;
    const g = this.game.grid;
    const ox = g.cellX(x), oy = g.cellY(z);
    for (let r = 0; r < 12; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const cx = ox + dx, cy = oy + dy;
          if (!g.inBounds(cx, cy)) continue;
          if (!g.isFree(g.idx(cx, cy)) || g.node[g.idx(cx, cy)]) continue;
          this._plant(cx, cy);
          return;
        }
      }
    }
  }

  _plant(cx, cy) {
    const g = this.game.grid;
    this.game.build.create(cx, cy, STRUCTURES.core);
    this.cell = g.idx(cx, cy);
    g.hp[this.cell] = this.carriedHp;      // damage travels with it
    this.stow();
    this.game.build.ghostKey = "";
    this.game.path.dirty = true;
  }

  /** Puts the core back on the player's back after a load. */
  liftSilently(hp) {
    this.carrying = true;
    this.carriedHp = hp;
    this._shoulder();
  }

  _shoulder() {
    this.carriedMesh = STRUCTURES.core.build();
    this.carriedMesh.scale.setScalar(0.55);
    this.carriedMesh.position.set(0, 2.15, 0);
    this.game.player.object.add(this.carriedMesh);
  }

  /** Leaves the core where it stands and empties your hands. */
  stow() {
    if (this.carriedMesh) {
      this.game.player.object.remove(this.carriedMesh);
      this.carriedMesh = null;
    }
    this.carrying = false;
  }

  /** A new run: back to a full core in the middle of an empty map. */
  reset() {
    this.stow();
    this.carriedHp = CONFIG.core.hp;
    this._btnMode = undefined;
    this.spawn();
  }

  lost() {
    this.game.saves.wipe();   // the run is over; there is nothing to come back to
    this.cell = -1;
    this.game.gameOver("The core fell", "Raiders reached the heart of the camp. Walls slow them down; turrets and a shorter perimeter finish the job.");
  }

  update(dt) {
    if (this.carrying && this.carriedMesh) {
      this.carriedMesh.userData.crystal.rotation.y += dt * 1.4;
    }
    let mode = null;
    if (this.carrying) mode = "drop";
    else if (this.cell >= 0 && !this.game.player.downed) {
      const cp = this.position();
      const p = this.game.player.position;
      if (Math.hypot(p.x - cp.x, p.z - cp.z) <= CONFIG.core.liftRange) {
        mode = "lift";
      }
    }
    if (mode !== this._btnMode) {
      this._btnMode = mode;
      this.game.ui.setCoreButton(mode);
    }
  }
}
