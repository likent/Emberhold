import { CONFIG } from "../data/config.js";
import { MATS, GEO } from "../data/materials.js";

/**
 * Everything short-lived that exists only to be looked at: wood chips, the
 * topple of a felled wall, ballista bolts in flight and the arc of a swing.
 * None of it is authoritative - a lost effect costs nothing - except the
 * bolts, which carry damage and so tick with the simulation.
 */
export class Fx {
  constructor(game) {
    this.game = game;
    this.particles = [];
    this.effects = [];
    this.bolts = [];
    this.chipMats = {};

    const arcMat = new THREE.MeshBasicMaterial({ color: 0xdff3fb, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    this.arc = new THREE.Mesh(new THREE.RingGeometry(1.4, 3.0, 18, 1, -0.5, 1.1), arcMat);
    this.arc.rotation.x = -Math.PI / 2;
    this.arc.visible = false;
    game.scene.add(this.arc);
    this.arcT = -1;
  }

  spawnChips(x, y, z, count, color) {
    if (!this.chipMats[color]) this.chipMats[color] = new THREE.MeshBasicMaterial({ color });
    const mat = this.chipMats[color];
    for (let i = 0; i < count; i++) {
      if (this.particles.length > 160) break;
      const m = new THREE.Mesh(GEO.chip, mat);
      m.position.set(x, y, z);
      this.game.scene.add(m);
      this.particles.push({
        mesh: m,
        vx: (Math.random() - 0.5) * 3,
        vy: 1.5 + Math.random() * 2.5,
        vz: (Math.random() - 0.5) * 3,
        life: 0.6 + Math.random() * 0.4
      });
    }
  }

  /**
   * Takes an object out of the world and topples it: the whole piece tips
   * over, sinks and fades, instead of scaling down in place. Materials are
   * cloned per collapse so fading one wall never dims the rest.
   */
  playCollapse(object) {
    const mats = [];
    object.traverse(o => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.transparent = true;
      o.castShadow = false;
      mats.push(o.material);
    });
    this.effects.push({
      object, mats, t: 0, life: 0.75,
      spinX: (Math.random() - 0.5) * 3.4,
      spinZ: (Math.random() - 0.5) * 3.4,
      twist: (Math.random() - 0.5) * 2.2
    });
  }

  spawnBolt(x, y, z, target, damage) {
    const mesh = new THREE.Mesh(GEO.bolt, MATS.bolt);
    mesh.position.set(x, y, z);
    this.game.scene.add(mesh);
    this.bolts.push({ mesh, target, damage, life: 2.5 });
  }

  /** Marks a swing on the ground; it fades on its own in a sixth of a second. */
  slash(player) {
    this.arc.position.set(player.position.x, 1.0, player.position.z);
    this.arc.rotation.z = -player.yaw;
    this.arc.visible = true;
    this.arcT = 0;
  }

  /**
   * Bolts tick with the enemies rather than with the rest of the effects,
   * because a hit lands damage: it belongs in the half of the frame where
   * the world is still being decided.
   */
  updateBolts(dt) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      const gone = b.target.dead || b.life <= 0;
      if (!gone) {
        const dx = b.target.position.x - b.mesh.position.x;
        const dy = (b.target.position.y + 0.9) - b.mesh.position.y;
        const dz = b.target.position.z - b.mesh.position.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < 0.7) {
          b.target.takeDamage(b.damage);
          this.spawnChips(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, 2, 0xffe08a);
          this.game.scene.remove(b.mesh); this.bolts.splice(i, 1);
          continue;
        }
        const step = CONFIG.bolt.speed * dt;
        b.mesh.position.x += dx / d * step;
        b.mesh.position.y += dy / d * step;
        b.mesh.position.z += dz / d * step;
        b.mesh.rotation.y = Math.atan2(dx, dz);
      } else {
        this.game.scene.remove(b.mesh); this.bolts.splice(i, 1);
      }
    }
  }

  /** The purely cosmetic half, run at the tail of the frame. */
  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vy -= 12 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += dt * 6;
      if (p.life <= 0 || p.mesh.position.y < 0) { this.game.scene.remove(p.mesh); this.particles.splice(i, 1); }
    }

    if (this.arcT >= 0) {
      this.arcT += dt;
      this.arc.material.opacity = Math.max(0, 0.5 - this.arcT * 3.5);
      if (this.arcT > 0.16) { this.arcT = -1; this.arc.visible = false; }
    }

    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      fx.t += dt;
      const k = fx.t / fx.life;
      fx.object.rotation.x += fx.spinX * dt;
      fx.object.rotation.z += fx.spinZ * dt;
      fx.object.rotation.y += fx.twist * dt;
      fx.object.position.y -= 3.4 * dt * k;
      for (const m of fx.mats) m.opacity = Math.max(0, 1 - k * k);
      if (k >= 1) {
        this.game.scene.remove(fx.object);
        for (const m of fx.mats) m.dispose();
        this.effects.splice(i, 1);
      }
    }
  }

  /** A restart or a load throws the whole world away; nothing may outlive it. */
  clear() {
    for (const p of this.particles) this.game.scene.remove(p.mesh);
    this.particles.length = 0;
    for (const fx of this.effects) this.game.scene.remove(fx.object);
    this.effects.length = 0;
    for (const b of this.bolts) this.game.scene.remove(b.mesh);
    this.bolts.length = 0;
  }
}
