import { clamp, lerpAngle } from "../core/util.js";
import { CONFIG } from "../data/config.js";
import { ITEMS } from "../data/items.js";
import { MATS, GEO } from "../data/materials.js";
import { Entity } from "./entity.js";

export class Player extends Entity {
  constructor(game) {
    super(game);
    this.hp = CONFIG.player.maxHp;
    this.yaw = 0;
    this.swingT = -1;
    this.attackCd = 0;
    this.moving = false;
    this.downed = false;
    this.respawnT = 0;
    this.acting = false;
    this.hunger = CONFIG.hunger.max;
    this.eatCd = 0;
    this.torchFuel = 0;
    this._buildMesh();
    game.scene.add(this.object);
  }

  _buildMesh() {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.5, 1.25, 10),
      new THREE.MeshStandardMaterial({ color: 0x5b8fb0, roughness: 0.75 })
    );
    body.position.y = 0.85; body.castShadow = true;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.33, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0xd8c3a2, roughness: 0.85 })
    );
    head.position.y = 1.72; head.castShadow = true;

    this.armPivot = new THREE.Group();
    this.armPivot.position.set(0.42, 1.15, 0);
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.16, 1.85),
      new THREE.MeshStandardMaterial({ color: 0xc8d4dc, metalness: 0.6, roughness: 0.35 })
    );
    blade.position.set(0, 0, 0.95); blade.castShadow = true;
    const hilt = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.1, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 })
    );
    const bow = new THREE.Group();
    const stave = new THREE.Mesh(GEO.bowStave, MATS.wood);
    stave.rotation.z = Math.PI * 0.375;
    const string = new THREE.Mesh(GEO.bowString, MATS.bolt);
    bow.add(stave, string);
    bow.position.set(0, 0, 0.5);
    bow.rotation.y = Math.PI / 2;
    bow.visible = false;
    bow.castShadow = true;
    this.bowMesh = bow;

    const handFlame = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 8, 6),
      MATS.flame.clone()
    );
    handFlame.position.set(0, 0, 1.05);
    handFlame.visible = false;
    const handLight = new THREE.PointLight(0xffa348, 0, 11, 2);
    handLight.position.set(0, 0.1, 1.0);
    this.handFlame = handFlame;
    this.handLight = handLight;

    const axeHead = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.42, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.7 })
    );
    axeHead.position.set(0.12, 0, 1.0);
    axeHead.castShadow = true;
    axeHead.visible = false;
    this.armPivot.add(blade, hilt, axeHead, handFlame, handLight, bow);
    this.blade = blade;
    this.axeHead = axeHead;
    this.object.add(body, head, this.armPivot);
  }

  /** The hand shows whatever the selected hotbar slot holds. */
  refreshWeaponMesh() {
    const it = this.game.equip.handItem();
    const hold = it && it.hold;
    const lit = !!(it && it.lightsHand);
    this.bowMesh.visible = !!(hold && hold.bow);
    this.handFlame.visible = lit;
    if (!lit) { this.handLight.intensity = 0; this.torchFuel = 0; }
    else if (this.torchFuel <= 0) this.torchFuel = it.burnTime;
    this.blade.visible = !!hold;
    this.axeHead.visible = !!(hold && hold.head);
    if (!hold) return;
    this.blade.material = hold.mat === "iron" ? MATS.iron : hold.mat === "stone" ? MATS.stone : MATS.wood;
    this.blade.scale.set(1, 1, hold.len);
    this.axeHead.position.z = 1.85 * hold.len;
    this.axeHead.material = hold.mat === "iron" ? MATS.iron : MATS.stone;
    // A pick head is a narrow bar across the haft, an axe head a broad blade.
    this.axeHead.scale.set(hold.pick ? 0.5 : 1, hold.pick ? 0.55 : 1, hold.pick ? 3.2 : 1);
    this.axeHead.position.x = hold.pick ? 0 : 0.12;
  }

  get position() { return this.object.position; }

  move(dirX, dirZ, dt) {
    if (this.downed) { this.moving = false; return; }
    const len = Math.hypot(dirX, dirZ);
    this.moving = len > 0.001;
    if (!this.moving) return;
    dirX /= len; dirZ /= len;
    const speed = CONFIG.player.speed * this.game.equip.speedMul
                  * (this.game.carrying ? CONFIG.core.carrySpeed : 1);
    this.game.resolveMove(
      this.position,
      this.position.x + dirX * speed * dt,
      this.position.z + dirZ * speed * dt,
      CONFIG.player.radius, true
    );
    this.yaw = lerpAngle(this.yaw, Math.atan2(dirX, dirZ), clamp(CONFIG.player.turnRate * dt, 0, 1));
  }

  update(dt) {
    if (this.downed) {
      this.respawnT -= dt;
      this.game.ui.setRespawn(this.respawnT);
      if (this.respawnT <= 0) this._respawn();
      return;
    }
    this._tickHunger(dt);
    this._tickHandTorch(dt);
    this.attackCd -= dt;
    const cfg = CONFIG.player.attack;

    // Nothing happens unless you ask for it. What the swing does depends on
    // what is in front of you: a raider, a damaged wall, or a tree.
    if (this.acting && this._shoot(dt)) return;

    if (this.acting) {
      let target = this.game.combat.nearestEnemy(this.position, cfg.range);
      if (!target) {
        if (this.game.build.repair(dt, this.position)) { this._workSwing(dt); return; }
        target = this.game.resources.nearestNode(this.position, cfg.range);
      }
      if (target) {
        const dx = target.position.x - this.position.x;
        const dz = target.position.z - this.position.z;
        this.yaw = lerpAngle(this.yaw, Math.atan2(dx, dz), clamp(8 * dt, 0, 1));
      }
      if (this.attackCd <= 0) {
        this.attackCd = cfg.cooldown;
        this.swingT = 0;
        this.game.combat.playerSwing(this);
        this.game.equip.wearHand(1);
      }
    }

    if (this.swingT >= 0) {
      this.swingT += dt;
      const p = this.swingT / cfg.swing;
      if (p >= 1) { this.swingT = -1; this.armPivot.rotation.set(0, 0, 0); }
      else {
        this.armPivot.rotation.y = -1.5 + p * 3.0;
        this.armPivot.rotation.z = -0.4 + Math.sin(p * Math.PI) * 0.5;
      }
    }
    this.object.rotation.y = this.yaw;
  }

  /**
   * A torch in hand is a torch being burnt: it draws on the stack you are
   * holding, one after another, and goes out when the last is gone.
   */
  _tickHandTorch(dt) {
    const item = this.game.equip.handItem();
    if (!item || !item.lightsHand) return;

    this.torchFuel -= dt;
    if (this.torchFuel <= 0) {
      const entry = this.game.equip.handEntry();
      entry.count--;
      if (entry.count <= 0) {
        this.game.economy.inv.slots[this.game.equip.hand] = null;
        this.game.ui.toast("Your last torch burnt out");
        this.game.economy._sync();
        this.game.onLoadoutChanged();
        return;
      }
      this.torchFuel = item.burnTime;
      this.game.economy._sync();
    }

    const night = 1 - this.game.cycle.daylight();
    const low = clamp(this.torchFuel / 45, 0.4, 1);
    this.flameT = (this.flameT || 0) + dt;
    const flicker = 0.82 + Math.sin(this.flameT * 8.9) * 0.12 + Math.sin(this.flameT * 3.3) * 0.07;
    this.handLight.intensity = (0.45 + night * 1.9) * flicker * low;
    this.handLight.distance = 9 + night * 4;
    this.handFlame.scale.setScalar((0.9 + flicker * 0.25) * low);
    this.handFlame.material.color.setRGB(1, 0.55 + flicker * 0.2, 0.2 * flicker);
  }

  /** Hunger drains faster while working, and an empty belly costs health. */
  _tickHunger(dt) {
    const c = CONFIG.hunger;
    if (!this.game.sandbox) {
      this.hunger -= (c.drain + (this.acting ? c.workDrain : 0)) * dt;
    }
    if (this.hunger <= 0) {
      this.hunger = 0;
      this.hp -= c.starveDps * dt;
      this.game.ui.setHp(this.hp / CONFIG.player.maxHp);
      if (this.hp <= 0) this._down();
    }
    this.eatCd -= dt;
    this.game.ui.setHunger(this.hunger / c.max);
  }

  /** Eats one of whatever is in hand, if it is food. */
  eat() {
    const entry = this.game.equip.handEntry();
    const item = entry && ITEMS[entry.id];
    if (!item || !item.food || this.eatCd > 0) return false;
    if (this.hunger >= CONFIG.hunger.max - 1) { this.game.ui.toast("Not hungry"); return false; }
    this.eatCd = CONFIG.hunger.eatCooldown;
    this.hunger = Math.min(CONFIG.hunger.max, this.hunger + item.food);
    entry.count--;
    if (entry.count <= 0) this.game.economy.inv.slots[this.game.equip.hand] = null;
    this.game.economy._sync();
    this.game.onLoadoutChanged();
    this.swingT = 0;
    return true;
  }

  /**
   * A bow reaches four times further than an arm, but every shot costs an
   * arrow. Returns true when the hand is holding one, so melee is skipped.
   */
  _shoot(dt) {
    const item = this.game.equip.handItem();
    const spec = item && item.ranged;
    if (!spec) return false;

    const target = this.game.combat.nearestEnemy(this.position, spec.range);
    // Nothing to shoot at: fall through, so the bow can still be swung at a
    // tree in a pinch instead of the button doing nothing at all.
    if (!target) return false;

    const dx = target.position.x - this.position.x;
    const dz = target.position.z - this.position.z;
    this.yaw = lerpAngle(this.yaw, Math.atan2(dx, dz), clamp(10 * dt, 0, 1));
    this.object.rotation.y = this.yaw;
    if (this.attackCd > 0) return true;

    if (this.game.economy.inv.count("arrow") <= 0) {
      if (!this._noArrowWarn || performance.now() - this._noArrowWarn > 2000) {
        this._noArrowWarn = performance.now();
        this.game.ui.toast("Out of arrows");
      }
      this.attackCd = 0.4;
      return true;
    }

    this.attackCd = spec.cooldown;
    this.game.economy.spend({ arrow: 1 });
    this.game.spawnBolt(this.position.x, 1.25, this.position.z, target, spec.damage);
    this.game.equip.wearHand(1);
    this.swingT = 0;
    return true;
  }

  /** Hammering animation: the swing pose without the swing damage. */
  _workSwing(dt) {
    this.attackCd -= dt;
    if (this.attackCd <= 0) { this.attackCd = CONFIG.player.repair.swing; this.swingT = 0; }
    if (this.swingT >= 0) {
      this.swingT += dt;
      const p = this.swingT / CONFIG.player.attack.swing;
      if (p >= 1) { this.swingT = -1; this.armPivot.rotation.set(0, 0, 0); }
      else {
        this.armPivot.rotation.z = -0.2 + Math.sin(p * Math.PI) * 1.1;
        this.armPivot.rotation.y = -0.3;
      }
    }
    this.object.rotation.y = this.yaw;
  }

  takeDamage(amount) {
    if (this.game.sandbox || this.downed) { this.game.shake(0.12); return; }
    const soaked = amount * this.game.equip.armor;
    this.game.equip.wearArmor(soaked / 4);
    this.hp -= amount - soaked;
    this.game.ui.setHp(this.hp / CONFIG.player.maxHp);
    this.game.shake(0.22);
    if (this.hp <= 0) this._down();
  }

  /** Going down is a setback, not a loss of the run - but it costs the pack. */
  _down() {
    this.game.stats.deaths++;
    if (this.game.carrying) {
      this.game.dropCoreNear(this.position.x, this.position.z);
      this.game.ui.toast("You dropped the core");
    }
    this.game.dropPack(this.position.x, this.position.z);
    this.downed = true;
    this.respawnT = CONFIG.respawn.delay;
    this.object.visible = false;
    this.hp = 0;
    this.game.ui.setHp(0);
    this.game.shake(0.7);
    this.game.spawnChips(this.position.x, 1, this.position.z, 10, 0x9fbcd0);
  }

  _respawn() {
    const spot = this.game.corePosition();
    this.position.set(spot.x, 0, spot.z + CONFIG.grid.cell);
    this.hp = CONFIG.player.maxHp;
    this.hunger = Math.max(this.hunger, CONFIG.hunger.max * 0.35);
    this.downed = false;
    this.object.visible = true;
    this.game.ui.setHp(1);
    this.game.ui.setRespawn(0);
    this.game.ui.toast("Respawned at the core");
  }
}
