import { Grid } from "./core/grid.js";
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
import { FieldRunner } from "./systems/fields.js";
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
 * The wiring. Game owns the renderer, the scene, the grid and the enemy list,
 * builds every system in the right order and runs the frame. It does not own
 * the work: the core, sacks, saves, slot moves, stations, gear, effects and
 * the flow-field schedule each live in their own file and take the game as
 * their one dependency.
 *
 * What is still here besides wiring is the test switches - sandbox, the cost
 * heatmap, the clock pause - because they cut across every system at once.
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
    this.paths = new FieldRunner(this);
    this.debugClass = "raider";
    this.huntPlayer = CONFIG.path.huntPlayer;

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

  /** Flips who the raiders are actually walking towards. */
  toggleHunt() {
    this.huntPlayer = !this.huntPlayer;
    document.getElementById("huntBtn").classList.toggle("on", this.huntPlayer);
    this.paths.invalidateAll();
    this.ui.toast(this.huntPlayer ? "Raiders hunt you" : "Raiders march on the core");
  }

  toggleBuild() { this.build.setActive(!this.build.active); }

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
    this.paths.shown = this.paths.fields[this.debugClass] || this.paths.fields.raider;
    this.heatmap.setVisible(this.debug);
    document.getElementById("debugBtn").classList.toggle("on", this.debug);
    if (this.debug) {
      this.paths.shown.sig = "";
      this.paths.shown.stale = true;
      this.paths.field(CONFIG.enemyTypes[this.debugClass]);
      this.heatmap.refresh();
      this.ui.toast("Path costs: " + CONFIG.enemyTypes[this.debugClass].label);
    }
  }

  spawnEnemy(x, z, type, opts) {
    const e = new Enemy(this, x, z, type, opts);
    this.enemies.push(e);
    return e;
  }

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
    this.core.reset();
    this.player.hp = CONFIG.player.maxHp;
    this.player.downed = false;
    this.player.object.visible = true;
    const spot = this.core.position();
    this.player.position.set(spot.x, 0, spot.z + CONFIG.grid.cell * 2);
    this.ui.setHp(1);
    this.ui.setRespawn(0);
    this.ui.showOverlay(false);
    this.paths.invalidate();
    this.running = true;
  }

  _update(dt) {
    const sample = this.input.sample();
    this.rig.rotate(sample.look.dx, sample.look.dy);

    const cy = Math.cos(this.rig.yaw), sy = Math.sin(this.rig.yaw);
    this.player.move(sample.x * cy + sample.y * sy, -sample.x * sy + sample.y * cy, dt);
    this.player.update(dt);

    this.paths.update(dt);

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
    this.ui.tick(dt);
    this.resources.update(dt);
    this.build.updateActive(dt);
    this.fx.updateBolts(dt);
    this.cycle.update(dt);
    this.hordes.update(dt);
    this.wildlife.update(dt);
    this.packs.update(dt);

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
