import { Grid } from "./core/grid.js";
import { Pathfinder } from "./core/pathfinder.js";
import { reportError } from "./core/report-error.js";
import { CONFIG } from "./data/config.js";
import { buildGeometry } from "./data/materials.js";
import { STRUCTURES } from "./data/structures.js";
import { BuildSystem } from "./systems/build.js";
import { CombatSystem } from "./systems/combat.js";
import { CoreSystem } from "./systems/core.js";
import { CraftQueue } from "./systems/crafting.js";
import { DayCycle } from "./systems/daycycle.js";
import { Economy } from "./systems/economy.js";
import { Equipment } from "./systems/equipment.js";
import { Fx } from "./systems/fx.js";
import { GearSystem } from "./systems/gear.js";
import { HealthBarSystem } from "./systems/healthbars.js";
import { HordeSystem } from "./systems/hordes.js";
import { PackSystem } from "./systems/packs.js";
import { Persistence } from "./systems/persistence.js";
import { SlotMoves } from "./systems/slots.js";
import { StationSystem } from "./systems/stations.js";
import { Wildlife } from "./systems/wildlife.js";
import { bindButtons } from "./ui/buttons.js";
import { CameraRig } from "./ui/camera.js";
import { CostHeatmap } from "./ui/heatmap.js";
import { InputSystem } from "./ui/input.js";
import { UI } from "./ui/ui.js";
import { Enemy } from "./world/enemy.js";
import { Player } from "./world/player.js";
import { ResourceSystem } from "./world/resource-node.js";
import { Scenery } from "./world/scenery.js";

/**
 * The wiring. Game owns the renderer, the scene, the grid and the flow fields,
 * builds every system in the right order and runs the frame. What it no longer
 * owns is the work itself: carrying the core, sacks, saves, slot moves,
 * stations and gear each live in their own file and take the game as their one
 * dependency. Anything here that reads like a rule of the game rather than
 * wiring is a candidate for the next seam.
 */
export class Game {
  constructor() {
    this.canvas = document.getElementById("view");
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: window.devicePixelRatio < 2 });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 260);
    this.rig = new CameraRig(this.camera);

    this.grid = new Grid(CONFIG.grid.w, CONFIG.grid.h, CONFIG.grid.cell);
    this.fields = {};
    for (const id in CONFIG.enemyTypes) this.fields[id] = new Pathfinder(this.grid, CONFIG.enemyTypes[id]);
    this.path = this.fields.raider;      // the one the heatmap shows by default
    this.debugClass = "raider";
    this.pathTimer = 0;
    this._rebuildQueue = [];
    this.huntPlayer = CONFIG.path.huntPlayer;
    this._pathStats = { builds: 0, ms: 0, window: 0, rate: 0, avg: 0 };

    this.enemies = [];
    this.handQueue = new CraftQueue(this);
    this.stats = { kills: 0, built: 0, deaths: 0, planted: 0, gathered: {} };

    // Systems take the game and nothing else, so the order below only has to
    // satisfy constructors that touch the scene - not who calls whom later.
    this.ui = new UI(this);
    this.bars = new HealthBarSystem(this);
    this.equip = new Equipment(this);
    this.economy = new Economy(this);
    this.combat = new CombatSystem(this);
    this.resources = new ResourceSystem(this);
    this.build = new BuildSystem(this);
    this.cycle = new DayCycle(this);
    this.hordes = new HordeSystem(this);
    this.wildlife = new Wildlife(this);
    this.fx = new Fx(this);
    this.core = new CoreSystem(this);
    this.packs = new PackSystem(this);
    this.stations = new StationSystem(this);
    this.slots = new SlotMoves(this);
    this.gear = new GearSystem(this);
    this.saves = new Persistence(this);
    this.input = new InputSystem(this);

    this.raycaster = new THREE.Raycaster();
    this.pointerVec = new THREE.Vector2();
    this.sandbox = CONFIG.sandbox.enabled;
    this.debug = false;
    this.running = true;

    buildGeometry();
    this.scenery = new Scenery(this);
    this.scenery.applySky(CONFIG.timeOfDay);
    this.heatmap = new CostHeatmap(this);

    this.player = new Player(this);
    this.core.spawn();
    const spot = this.core.position();
    this.player.position.set(spot.x, 0, spot.z + CONFIG.grid.cell * 2);
    this.resources.populate();

    this.build.select("fence");
    bindButtons(this);
    this._resize();
    addEventListener("resize", () => this._resize());

    this.equip.reset();
    this.economy.reset();
    this._giveStartingKit();
    this.ui.setSandbox(this.sandbox);
    this.ui.setInvulnerable(this.sandbox);
    this.ui.setActionIcon(this.equip.handItem());
    document.getElementById("huntBtn").classList.toggle("on", this.huntPlayer);
    this.ui.setBuildMode(false);
    this.ui.setHp(1);
    this.saveTimer = CONFIG.save.autoEvery;
    try {
      if (this.saves.load()) this.ui.toast("Run restored - day " + this.cycle.day);
    } catch (e) {
      // A fresh world beats no world at all.
      reportError(e);
      this.saves.wipe();
    }

    this.clock = new THREE.Clock();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);          // also updates the canvas CSS size
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Bare hands and a little wood. The club costs five wood and four seconds
   * by hand, so the first thing you do is make your own - a free starter
   * weapon skipped that step and never wore out, since it was built without
   * a durability entry at all.
   */
  _giveStartingKit() {
    const inv = this.economy.inv;
    inv.clear();
    inv.add("wood", CONFIG.economy.startWood);
    inv.add("stone", CONFIG.economy.startStone);
    this.equip.hand = 0;
    this.onLoadoutChanged();
  }

  /** Deployables are paid for in carried units, building blocks in materials. */
  canAffordPlacement(def) {
    if (def.isCore) return true;
    if (def.item) return this.sandbox || this.economy.inv.count(def.item) > 0;
    return this.economy.canAfford(def.cost);
  }
  payForPlacement(def) {
    if (this.sandbox || def.isCore) return;
    if (def.item) {
      this.economy.spend({ [def.item]: 1 });
      // Spending the last one empties the hand, so the hand-driven UI - the
      // held mesh, the action icon, the ghost - has to be told.
      this.onLoadoutChanged();
    } else {
      this.economy.spend(def.cost);
    }
  }

  /** Choosing a deployable anywhere arms it and opens placement. */
  selectBuildingFromBag(id) {
    this.build.select(id);
    if (!this.build.active) this.build.setActive(true);
    this.ui.togglePalette(false);
    if (this.ui.panel.classList.contains("show")) this.ui.toggleBackpack();
    this.ui.toast(STRUCTURES[id].label + " ready to place");
  }

  /** Throttled nudge when the held item is too crude for the material. */
  warnTool(def) {
    if (this._toolWarn && performance.now() - this._toolWarn < 2500) return;
    this._toolWarn = performance.now();
    this.ui.toast(def.label + " needs a proper tool - try a pick");
  }

  /** Flips who the raiders are actually walking towards. */
  toggleHunt() {
    this.huntPlayer = !this.huntPlayer;
    document.getElementById("huntBtn").classList.toggle("on", this.huntPlayer);
    for (const id in this.fields) this.fields[id].sig = "";
    this.path.dirty = true;
    this.ui.toast(this.huntPlayer ? "Raiders hunt you" : "Raiders march on the core");
  }

  toggleBuild() { this.build.setActive(!this.build.active); }

  /** Called whenever worn gear changes, so the visible weapon matches. */
  onLoadoutChanged() {
    if (this.player) this.player.refreshWeaponMesh();
    this.ui.refreshBackpack();
    this.ui.setActionIcon(this.equip.handItem());
    this._syncBuildSelection();
  }

  /**
   * A deployable is armed because it is in your hand. Once it is not - you
   * ran out, or picked another slot - the preview must not linger.
   */
  _syncBuildSelection() {
    const sel = this.build.selected;
    if (!this.build.active || !sel || !sel.item) return;
    const hand = this.equip.handItem();
    if (hand && hand.kind === "deployable") {
      if (hand.structure !== sel.id) this.build.select(hand.structure);
      return;
    }
    this.build.cancelLine();
    this.build.setActive(false);
    if (this.stockOfLast !== 0) this.ui.toast("Out of " + sel.label.toLowerCase());
  }

  /**
   * Test switch: free building, no damage taken, manual wave control and the
   * cost heatmap. Everything reads game.sandbox, so there is one source of truth.
   */
  toggleSandbox() {
    const on = !this.sandbox;
    this.sandbox = on;
    this.economy.setInfinite(on);
    this.ui.setSandbox(on);
    this.ui.setInvulnerable(on);
    if (!on) {
      this.cycle.paused = false;
      if (this.debug) this.toggleDebug();
      this.player.hp = Math.min(this.player.hp, CONFIG.player.maxHp);
      this.ui.setHp(this.player.hp / CONFIG.player.maxHp);
    }
    this.ui.toast(on ? "Sandbox: free build, no damage" : "Sandbox off");
  }

  /** Freezes the day clock so a layout can be tested at leisure. */
  toggleWavePause() {
    if (!this.sandbox) { this.ui.toast("Clock pause is sandbox only"); return; }
    this.cycle.paused = !this.cycle.paused;
    this.ui.toast(this.cycle.paused ? "Clock paused" : "Clock running");
  }

  /** Console helper: game.give(500) or game.give(500, 200). */
  give(wood, stone) {
    this.economy.add("wood", wood || 0);
    this.economy.add("stone", stone === undefined ? (wood || 0) : stone);
  }

  cycleStructure() {
    const ids = Object.keys(STRUCTURES).filter(id => !STRUCTURES[id].hidden && !STRUCTURES[id].item);
    const next = ids[(ids.indexOf(this.build.selected.id) + 1) % ids.length];
    this.build.select(next);
  }

  /** Cycles off -> raider -> runner -> brute, so the routes can be compared. */
  toggleDebug() {
    const ids = Object.keys(CONFIG.enemyTypes);
    if (!this.debug) {
      this.debug = true;
      this.debugClass = ids[0];
    } else {
      const next = ids.indexOf(this.debugClass) + 1;
      if (next >= ids.length) this.debug = false;
      else this.debugClass = ids[next];
    }
    this.path = this.fields[this.debugClass] || this.fields.raider;
    this.heatmap.setVisible(this.debug);
    document.getElementById("debugBtn").classList.toggle("on", this.debug);
    if (this.debug) {
      this.path.sig = "";
      this.path.stale = true;
      this.fieldFor(CONFIG.enemyTypes[this.debugClass]);
      this.heatmap.refresh();
      this.ui.toast("Path costs: " + CONFIG.enemyTypes[this.debugClass].label);
    }
  }

  onWorldTap(clientX, clientY) {
    if (!this.build.active) return;
    this.pointerVec.x = (clientX / innerWidth) * 2 - 1;
    this.pointerVec.y = -(clientY / innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerVec, this.camera);
    const hit = this.raycaster.intersectObject(this.scenery.ground)[0];
    if (!hit) return;
    this.build.aimAt(hit.point.x, hit.point.z);
    this.build.placeAtAim();
  }

  spawnEnemy(x, z, type, opts) {
    const e = new Enemy(this, x, z, type, opts);
    this.enemies.push(e);
    return e;
  }

  /** Classes with nothing alive (and not on debug display) skip their rebuild. */
  _classActive(id) {
    if (this.debug && this.debugClass === id) return true;
    if (id === "raider") return true;                 // always warm: waves lead with it
    return this.enemies.some(e => e.type.id === id);
  }

  /** Returns a usable field for a class, rebuilding it if it went cold. */
  fieldFor(type) {
    const field = this.fields[type.id];
    if (field && field.stale) { field.stale = false; this._rebuildField(field); }
    return field;
  }

  /**
   * Rebuilds only if the inputs actually changed: the field depends on the
   * target CELLS and the grid, so a player walking within one cell needs no
   * work at all. Returns true when a pass was run.
   */
  _rebuildField(field) {
    const targets = this._pathTargets(field.type);
    const sig = this.grid.version + "|" +
                targets.map(t => t.cx + "," + t.cy + "," + t.bias).join(";");
    if (field.sig === sig) return false;
    field.sig = sig;
    const t0 = performance.now();
    field.compute(targets);
    this._pathStats.builds++;
    this._pathStats.ms += performance.now() - t0;
    return true;
  }

  /**
   * The field targets the core only. The player used to be a second source,
   * which meant a full rebuild every time they crossed a cell - a hitch every
   * few frames in a fight. Chasing the player is now local steering inside
   * each class's aggro range, so the field only changes when the world does.
   */
  _pathTargets() {
    const g = this.grid;
    const chase = (this.huntPlayer || this.core.carrying) && !this.player.downed;
    if (chase) {
      return [{ cx: g.cellX(this.player.position.x), cy: g.cellY(this.player.position.z), bias: 0 }];
    }
    if (this.core.cell >= 0) {
      return [{ cx: this.core.cell % g.w, cy: (this.core.cell / g.w) | 0, bias: 0 }];
    }
    return [{ cx: g.w >> 1, cy: g.h >> 1, bias: 0 }];
  }

  shake(amount) { this.rig.shake = Math.max(this.rig.shake, amount); }

  /** The run ends with a tally rather than a bare "play again". */
  gameOver(title, text) {
    if (!this.running) return;
    this.running = false;
    const s = this.stats;
    const tally = Object.keys(s.gathered).map(k => s.gathered[k] + " " + k).join(", ");
    this.ui.showOverlay(true, title,
      "Survived " + this.cycle.day + " days. " + s.kills + " raiders killed, " +
      s.built + " things built, downed " + s.deaths + " times." +
      (tally ? " Gathered " + tally + "." : ""));
  }

  restart() {
    this.saves.wipe();
    for (const e of this.enemies) e.dispose();
    this.enemies.length = 0;
    this.fx.clear();
    this.packs.clear();
    this.bars.clear();
    this.build.hpBars.clear();
    this.build.reset();
    this.resources.reset();
    this.cycle.reset();
    this.hordes.reset();
    this.stats = { kills: 0, built: 0, deaths: 0, planted: 0, gathered: {} };
    this.equip.reset();
    this.economy.reset();
    this._giveStartingKit();
    this.core.reset();
    this.player.hp = CONFIG.player.maxHp;
    this.player.downed = false;
    this.player.object.visible = true;
    const spot = this.core.position();
    this.player.position.set(spot.x, 0, spot.z + CONFIG.grid.cell * 2);
    this.ui.setHp(1);
    this.ui.setRespawn(0);
    this.ui.showOverlay(false);
    this.path.dirty = true;
    this.running = true;
  }

  _update(dt) {
    const sample = this.input.sample();
    this.rig.rotate(sample.look.dx, sample.look.dy);

    const cy = Math.cos(this.rig.yaw), sy = Math.sin(this.rig.yaw);
    this.player.move(sample.x * cy + sample.y * sy, -sample.x * sy + sample.y * cy, dt);
    this.player.update(dt);

    this.pathTimer -= dt;
    if (this.pathTimer <= 0 || this.path.dirty || this.path.version !== this.grid.version) {
      this.pathTimer = CONFIG.path.rebuildInterval;
      for (const id in this.fields) {
        if (this._classActive(id)) { if (this._rebuildQueue.indexOf(id) < 0) this._rebuildQueue.push(id); }
        else this.fields[id].stale = true;
      }
      this.path.dirty = false;
    }

    // At most one field per frame: three classes rebuilt together was a
    // visible hitch. Fields whose inputs have not changed are skipped outright.
    if (this._rebuildQueue.length) {
      const id = this._rebuildQueue.shift();
      const field = this.fields[id];
      field.stale = false;
      if (this._rebuildField(field) && this.debug && this.debugClass === id) this.heatmap.refresh();
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt);
      if (e.dead) { e.dispose(); this.enemies.splice(i, 1); }
    }
    this.ui.setEnemies(this.enemies.length);

    this.core.update(dt);
    this.stations.update();
    this.handQueue.update(dt);
    this.build.updateQueues(dt);
    if (this.handQueue.busy || this._craftHudShown) this.ui.refreshCraftHud();
    this._craftTick = (this._craftTick || 0) + dt;
    if (this._craftTick > 0.25) {
      this._craftTick = 0;
      if ((this.ui.tab === "craft" || this.ui.tab === "bench" || this.ui.tab === "cook" ||
           this.ui.tab === "furnace" || this.ui.tab === "stats") &&
          this.ui.panel.classList.contains("show")) this.ui.refreshBackpack();
    }
    this.resources.update(dt);
    this.build.updateActive(dt);
    this.fx.updateBolts(dt);
    this.cycle.update(dt);
    this.hordes.update(dt);
    this.wildlife.update(dt);
    this.packs.update(dt);

    // Rolling measure of what the field actually costs, shown on the stats screen.
    const ps = this._pathStats;
    ps.window += dt;
    if (ps.window >= 2) {
      ps.rate = ps.builds / ps.window;
      ps.avg = ps.builds ? ps.ms / ps.builds : 0;
      ps.builds = 0; ps.ms = 0; ps.window = 0;
    }

    this.saveTimer -= dt;
    if (this.saveTimer <= 0) { this.saveTimer = CONFIG.save.autoEvery; this.saves.save(true); }
    this.build.updateGhost();
    this.build.updateBars(dt);

    this.fx.update(dt);
    this.rig.update(dt, this.player.position);
    this.bars.update(this.camera);   // after the rig, so bars face this frame's camera
  }

  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    try {
      if (this.running) this._update(dt);
      this.renderer.render(this.scene, this.camera);
    } catch (err) {
      // One bad frame must not kill input handling for the whole session.
      reportError(err);
      this.running = false;
    }
  }
}
