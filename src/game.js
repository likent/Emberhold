import { Grid } from "./core/grid.js";
import { Pathfinder } from "./core/pathfinder.js";
import { reportError } from "./core/report-error.js";
import { clamp, costText } from "./core/util.js";
import { CONFIG } from "./data/config.js";
import { ITEMS } from "./data/items.js";
import { MATS, GEO } from "./data/materials.js";
import { RECIPES, makeItemEntry } from "./data/recipes.js";
import { RESOURCES } from "./data/resources.js";
import { STRUCTURES } from "./data/structures.js";
import { BuildSystem } from "./systems/build.js";
import { CombatSystem } from "./systems/combat.js";
import { CraftQueue } from "./systems/crafting.js";
import { DayCycle } from "./systems/daycycle.js";
import { Economy } from "./systems/economy.js";
import { Equipment } from "./systems/equipment.js";
import { HealthBarSystem } from "./systems/healthbars.js";
import { HordeSystem } from "./systems/hordes.js";
import { Inventory } from "./systems/inventory.js";
import { CameraRig } from "./ui/camera.js";
import { CostHeatmap } from "./ui/heatmap.js";
import { InputSystem } from "./ui/input.js";
import { UI } from "./ui/ui.js";
import { Enemy } from "./world/enemy.js";
import { Player } from "./world/player.js";
import { ResourceSystem } from "./world/resource-node.js";

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
    this.particles = [];
    this.effects = [];
    this.bolts = [];
    this.coreCell = -1;
    this.carrying = false;
    this.carriedHp = CONFIG.core.hp;
    this.carriedMesh = null;
    this.openChestCell = undefined;
    this.handQueue = new CraftQueue(this);
    this.stats = { kills: 0, built: 0, deaths: 0, planted: 0, gathered: {} };
    this.chipMats = {};

    this.ui = new UI(this);
    this.bars = new HealthBarSystem(this);
    this.equip = new Equipment(this);
    this.economy = new Economy(this);
    this.combat = new CombatSystem(this);
    this.resources = new ResourceSystem(this);
    this.build = new BuildSystem(this);
    this.cycle = new DayCycle(this);
    this.hordes = new HordeSystem(this);
    this.wildlife = { timer: 20 };
    this.packs = [];
    this.input = new InputSystem(this);

    this.raycaster = new THREE.Raycaster();
    this.pointerVec = new THREE.Vector2();
    this.sandbox = CONFIG.sandbox.enabled;
    this.debug = false;
    this.running = true;

    this._buildGeometry();
    this._buildLights();
    this._buildWorld();
    this.applySky(CONFIG.timeOfDay);
    this.heatmap = new CostHeatmap(this);

    this.player = new Player(this);
    this._spawnCore();
    this.player.position.set(this.corePosition().x, 0, this.corePosition().z + CONFIG.grid.cell * 2);
    this.resources.populate();

    this.build.select("fence");
    this._bindButtons();
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
      if (this.loadSaved()) this.ui.toast("Run restored - day " + this.cycle.day);
    } catch (e) {
      // A fresh world beats no world at all.
      reportError(e);
      this.wipeSave();
    }

    this.clock = new THREE.Clock();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _buildGeometry() {
    const c = CONFIG.grid.cell;
    const arm = c / 2 + 0.02;                 // centre of the cell to its edge
    GEO.trunk = new THREE.CylinderGeometry(0.16, 0.22, 2.2, 6);
    GEO.leaf = new THREE.ConeGeometry(1.15, 2.6, 7);
    GEO.rock = new THREE.DodecahedronGeometry(1.05);
    GEO.fenceArm = new THREE.BoxGeometry(0.32, 1.5, arm);
    GEO.fencePost = new THREE.BoxGeometry(0.42, 1.72, 0.42);
    GEO.fenceBrace = new THREE.BoxGeometry(0.3, 1.2, arm * 1.35);
    GEO.stoneArm = new THREE.BoxGeometry(0.78, 2.1, arm);
    GEO.stonePost = new THREE.BoxGeometry(0.94, 2.2, 0.94);
    GEO.stoneBrace = new THREE.BoxGeometry(0.7, 1.7, arm * 1.35);
    GEO.gatePost = new THREE.BoxGeometry(0.3, 1.8, 0.3);
    GEO.gateBar = new THREE.BoxGeometry(c * 0.96, 0.26, 0.24);
    GEO.gatePlank = new THREE.BoxGeometry(c * 0.78, 0.85, 0.14);
    GEO.benchTop = new THREE.BoxGeometry(1.65, 0.16, 1.1);
    GEO.benchLeg = new THREE.BoxGeometry(0.16, 0.9, 0.16);
    GEO.benchVice = new THREE.BoxGeometry(0.34, 0.2, 0.3);
    GEO.chestBox = new THREE.BoxGeometry(1.3, 0.68, 0.9);
    GEO.chestLid = new THREE.BoxGeometry(1.34, 0.22, 0.94);
    GEO.chestBand = new THREE.BoxGeometry(1.38, 0.1, 0.1);
    GEO.oreVein = new THREE.OctahedronGeometry(0.22);
    GEO.bushTuft = new THREE.ConeGeometry(0.26, 0.66, 5);
    GEO.berry = new THREE.SphereGeometry(0.09, 6, 5);
    GEO.bagBody = new THREE.SphereGeometry(0.45, 10, 8);
    GEO.bowStave = new THREE.TorusGeometry(0.62, 0.05, 6, 14, Math.PI * 1.25);
    GEO.bowString = new THREE.BoxGeometry(0.02, 1.15, 0.02);
    GEO.arrowShaft = new THREE.BoxGeometry(0.05, 0.05, 0.75);
    GEO.torchPost = new THREE.CylinderGeometry(0.09, 0.11, 1.5, 6);
    GEO.torchHead = new THREE.SphereGeometry(0.22, 8, 6);
    GEO.fireStone = new THREE.DodecahedronGeometry(0.24);
    GEO.fireLog = new THREE.CylinderGeometry(0.13, 0.13, 1.25, 5);
    GEO.fireFlame = new THREE.ConeGeometry(0.42, 1.0, 7);
    GEO.furnaceBody = new THREE.CylinderGeometry(0.72, 0.86, 1.35, 8);
    GEO.furnaceCap = new THREE.CylinderGeometry(0.42, 0.6, 0.42, 8);
    GEO.furnaceMouth = new THREE.BoxGeometry(0.6, 0.45, 0.16);
    GEO.chip = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    GEO.coreBase = new THREE.CylinderGeometry(0.95, 1.15, 0.5, 8);
    GEO.coreCrystal = new THREE.OctahedronGeometry(0.78);
    GEO.turretBase = new THREE.CylinderGeometry(0.62, 0.78, 0.85, 8);
    GEO.turretHead = new THREE.BoxGeometry(0.8, 0.55, 0.8);
    GEO.turretBarrel = new THREE.BoxGeometry(0.18, 0.18, 1.25);
    GEO.bolt = new THREE.BoxGeometry(0.14, 0.14, 0.42);
    GEO.ballistaArm = new THREE.BoxGeometry(1.5, 0.14, 0.14);
    GEO.spike = new THREE.ConeGeometry(0.13, 0.7, 5);
    GEO.snareRing = new THREE.CylinderGeometry(0.62, 0.62, 0.09, 10);
    GEO.snareJaw = new THREE.BoxGeometry(0.9, 0.28, 0.1);
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0xcfe6f7, 0x6f7f58, 0.95);
    this.scene.add(this.hemi);

    const sun = new THREE.DirectionalLight(0xfff6e2, 1.55);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const s = 46;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.camera.far = 140;
    this.sun = sun;
    this.scene.add(sun);
  }

  /** Blends the two presets: 1 is noon, 0 is the middle of the night. */
  applySkyBlend(light) {
    const d = CONFIG.sky.day, n = CONFIG.sky.night;
    const mixHex = (a, b) => {
      const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
      const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
      return ((ar + (br - ar) * light) << 16 | (ag + (bg - ag) * light) << 8 | (ab + (bb - ab) * light)) & 0xffffff;
    };
    const mix = (a, b) => a + (b - a) * light;
    this._sky = {
      background: mixHex(n.background, d.background),
      fogNear: mix(n.fogNear, d.fogNear), fogFar: mix(n.fogFar, d.fogFar),
      hemiSky: mixHex(n.hemiSky, d.hemiSky), hemiGround: mixHex(n.hemiGround, d.hemiGround),
      hemiIntensity: mix(n.hemiIntensity, d.hemiIntensity),
      sunColor: mixHex(n.sunColor, d.sunColor), sunIntensity: mix(n.sunIntensity, d.sunIntensity),
      sunPos: [mix(n.sunPos[0], d.sunPos[0]), mix(n.sunPos[1], d.sunPos[1]), mix(n.sunPos[2], d.sunPos[2])],
      ground: mixHex(n.ground, d.ground)
    };
    this._pushSky(this._sky);
  }

  /** Single place that owns the look of the world. */
  applySky(name) {
    const p = CONFIG.sky[name] || CONFIG.sky.day;
    this.skyName = name;
    this._pushSky(p);
  }

  _pushSky(p) {
    if (!this.scene.background) this.scene.background = new THREE.Color(p.background);
    else this.scene.background.setHex(p.background);
    if (!this.scene.fog) this.scene.fog = new THREE.Fog(p.background, p.fogNear, p.fogFar);
    else { this.scene.fog.color.setHex(p.background); this.scene.fog.near = p.fogNear; this.scene.fog.far = p.fogFar; }
    this.hemi.color.setHex(p.hemiSky);
    this.hemi.groundColor.setHex(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.sun.color.setHex(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.sun.position.set(p.sunPos[0], p.sunPos[1], p.sunPos[2]);
    if (this.ground) this.ground.material.color.setHex(p.ground);
  }

  _buildWorld() {
    const g = this.grid;
    const W = g.w * g.cell, H = g.h * g.cell;

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      new THREE.MeshStandardMaterial({ color: 0x5b7a45, roughness: 1 })
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    const lines = new THREE.GridHelper(W, g.w, 0x7a9464, 0x6b845a);
    lines.material.opacity = 0.22; lines.material.transparent = true;
    lines.position.y = 0.02;
    this.scene.add(lines);

    const slashMat = new THREE.MeshBasicMaterial({ color: 0xdff3fb, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    this.slash = new THREE.Mesh(new THREE.RingGeometry(1.4, 3.0, 18, 1, -0.5, 1.1), slashMat);
    this.slash.rotation.x = -Math.PI / 2;
    this.slash.visible = false;
    this.scene.add(this.slash);
    this.slashT = -1;
  }

  _bindButtons() {
    const tap = (id, fn) => {
      document.getElementById(id).addEventListener("pointerdown", e => {
        e.preventDefault(); e.stopPropagation(); fn();
      });
    };
    tap("buildBtn", () => this.toggleBuild());
    tap("debugBtn", () => this.toggleDebug());
    tap("huntBtn", () => this.toggleHunt());
    tap("sandboxBtn", () => this.toggleSandbox());
    tap("waveCard", () => this.toggleWavePause());
    tap("coreBtn", () => (this.carrying ? this.setCoreDown() : this.liftCore()));
    tap("pickBtn", () => this.ui.togglePalette());
    this._bindPlaceButton();
    this._bindActionButton();
    tap("bagBtn", () => this.ui.toggleBackpack());
    tap("benchBtn", () => this.openBench());
    tap("furnaceBtn", () => this.openFurnace());
    tap("packBtn", () => this.openPack());
    tap("takeAll", () => this.recoverPack());
    tap("cookBtn", () => { this.ui.showTab("cook"); if (!this.ui.panel.classList.contains("show")) this.ui.toggleBackpack(); });
    tap("chestBtn", () => this.openChest());
    tap("storeAll", () => this.storeAll());
    tap("invClose", () => this.ui.toggleBackpack());
    document.querySelectorAll(".tab").forEach(el => {
      el.addEventListener("pointerdown", e => {
        e.preventDefault(); e.stopPropagation();
        this.ui.showTab(el.dataset.tab);
      });
    });
    tap("waveBtn", () => this.cycle.spawnRaid());
    tap("hordeBtn", () => this.hordes.spawnHorde());
    tap("restart", () => this.restart());
  }

  /**
   * The action button does whatever the held item is for: a deployable is
   * placed (hold for a run of them), anything else swings on its cooldown.
   */
  _bindActionButton() {
    const btn = document.getElementById("actionBtn");
    let timer = null, lining = false, placing = false;
    const swing = on => { this.player.acting = on; btn.classList.toggle("firing", on); };
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };

    btn.addEventListener("pointerdown", e => {
      e.preventDefault(); e.stopPropagation();
      const item = this.equip.handItem();
      if (item && item.food) { this.player.eat(); return; }
      placing = !!(item && item.kind === "deployable");
      if (!placing) { swing(true); return; }
      // Make sure the ghost is live before anything is placed.
      this.build.select(item.structure);
      if (!this.build.active) this.build.setActive(true);
      this.build.updateGhost();
      lining = false;
      timer = setTimeout(() => {
        lining = this.build.beginLine();
        if (lining) { btn.classList.add("on"); this.ui.toast("Walk to extend, release to place"); }
      }, CONFIG.build.holdDelay);
    });

    const finish = () => {
      clear();
      btn.classList.remove("on");
      if (placing) {
        if (lining) this.build.commitLine();
        else this.build.placeAtAim();
        lining = false; placing = false;
        return;
      }
      swing(false);
    };
    btn.addEventListener("pointerup", e => { e.preventDefault(); e.stopPropagation(); finish(); });
    btn.addEventListener("pointercancel", () => { clear(); this.build.cancelLine(); lining = placing = false; swing(false); });
    btn.addEventListener("pointerleave", () => { if (!placing) swing(false); });
  }

  /** Short press places one; holding starts a run that follows the player. */
  _bindPlaceButton() {
    const btn = document.getElementById("placeBtn");
    let timer = null, dragging = false;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    btn.addEventListener("pointerdown", e => {
      e.preventDefault(); e.stopPropagation();
      dragging = false;
      timer = setTimeout(() => {
        dragging = this.build.beginLine();
        if (dragging) {
          btn.classList.add("on");
          this.ui.toast("Walk to extend, release to build");
        }
      }, CONFIG.build.holdDelay);
    });
    btn.addEventListener("pointerup", e => {
      e.preventDefault(); e.stopPropagation();
      clear();
      btn.classList.remove("on");
      if (dragging) this.build.commitLine();
      else this.build.placeAtAim();
      dragging = false;
    });
    btn.addEventListener("pointercancel", () => {
      clear(); btn.classList.remove("on");
      this.build.cancelLine(); dragging = false;
    });
  }

  _resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);          // also updates the canvas CSS size
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _spawnCore() {
    const g = this.grid;
    const cx = g.w >> 1, cy = g.h >> 1;
    this.build.create(cx, cy, STRUCTURES.core);
    this.coreCell = g.idx(cx, cy);
  }

  corePosition() {
    const g = this.grid;
    if (this.carrying) return { x: this.player.position.x, z: this.player.position.z };
    if (this.coreCell < 0) return { x: 0, z: 0 };
    return { x: g.centerX(this.coreCell % g.w), z: g.centerZ((this.coreCell / g.w) | 0) };
  }

  /* ---- carrying the core ------------------------------------------------
   * While it is on your back the core is not a cell any more, so raiders
   * have nothing to besiege but you: the path field collapses to a single
   * source at the player. Moving the base is a deliberate risk, not a free
   * relocation. */

  liftCore() {
    if (this.carrying || this.coreCell < 0) return;
    const cp = this.corePosition();
    if (Math.hypot(this.player.position.x - cp.x, this.player.position.z - cp.z) > CONFIG.core.liftRange) {
      this.ui.toast("Step closer to the core");
      return;
    }
    this.carriedHp = this.build.lift(this.coreCell);
    this.coreCell = -1;
    this.carrying = true;
    this.carriedMesh = STRUCTURES.core.build();
    this.carriedMesh.scale.setScalar(0.55);
    this.carriedMesh.position.set(0, 2.15, 0);
    this.player.object.add(this.carriedMesh);
    this.build.ghostKey = "";
    this.path.dirty = true;
    this.ui.toast("Core lifted - they are coming for you now");
  }

  setCoreDown() {
    if (!this.carrying) return;
    const { cx, cy } = this.build.aim;
    if (!this.build.canPlace(cx, cy)) { this.ui.toast("No room for the core there"); return; }
    this._plantCore(cx, cy);
    this.ui.toast("Core anchored");
  }

  /** Forced drop: finds the closest free cell outward from a point. */
  dropCoreNear(x, z) {
    if (!this.carrying) return;
    const g = this.grid;
    const ox = g.cellX(x), oy = g.cellY(z);
    for (let r = 0; r < 12; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const cx = ox + dx, cy = oy + dy;
          if (!g.inBounds(cx, cy)) continue;
          if (!g.isFree(g.idx(cx, cy)) || g.node[g.idx(cx, cy)]) continue;
          this._plantCore(cx, cy);
          return;
        }
      }
    }
  }

  _plantCore(cx, cy) {
    const g = this.grid;
    this.build.create(cx, cy, STRUCTURES.core);
    this.coreCell = g.idx(cx, cy);
    g.hp[this.coreCell] = this.carriedHp;      // damage travels with it
    this.carrying = false;
    if (this.carriedMesh) {
      this.player.object.remove(this.carriedMesh);
      this.carriedMesh = null;
    }
    this.build.ghostKey = "";
    this.path.dirty = true;
  }

  _updateChestButton() {
    const nearChest = !!this.nearestStation("storage");
    if (nearChest !== this._chestBtnOn) {
      this._chestBtnOn = nearChest;
      document.getElementById("chestBtn").classList.toggle("hidden", !nearChest);
    }
    if (!nearChest && this.openChestCell !== undefined) this.openChestCell = undefined;

    const nearBench = !!this.nearestStation("craft");
    if (nearBench !== this._benchBtnOn) {
      this._benchBtnOn = nearBench;
      document.getElementById("benchBtn").classList.toggle("hidden", !nearBench);
      if (this.ui.panel.classList.contains("show")) this.ui.refreshBackpack();
    }
    const nearFire = !!this.nearestStation("cook");
    if (nearFire !== this._cookBtnOn) {
      this._cookBtnOn = nearFire;
      document.getElementById("cookBtn").classList.toggle("hidden", !nearFire);
      if (this.ui.panel.classList.contains("show")) this.ui.refreshBackpack();
    }
    const nearFurnace = !!this.nearestStation("smelt");
    if (nearFurnace !== this._furnaceBtnOn) {
      this._furnaceBtnOn = nearFurnace;
      document.getElementById("furnaceBtn").classList.toggle("hidden", !nearFurnace);
      if (this.ui.panel.classList.contains("show")) this.ui.refreshBackpack();
    }
  }

  openFurnace() {
    this.ui.showTab("furnace");
    if (!this.ui.panel.classList.contains("show")) this.ui.toggleBackpack();
  }

  openBench() {
    this.ui.showTab("bench");
    if (!this.ui.panel.classList.contains("show")) this.ui.toggleBackpack();
  }

  _updateCoreButton() {
    let mode = null;
    if (this.carrying) mode = "drop";
    else if (this.coreCell >= 0 && !this.player.downed) {
      const cp = this.corePosition();
      if (Math.hypot(this.player.position.x - cp.x, this.player.position.z - cp.z) <= CONFIG.core.liftRange) {
        mode = "lift";
      }
    }
    if (mode !== this._coreBtnMode) {
      this._coreBtnMode = mode;
      this.ui.setCoreButton(mode);
    }
  }

  coreLost() {
    this.wipeSave();          // the run is over; there is nothing to come back to
    this.coreCell = -1;
    this.gameOver("The core fell", "Raiders reached the heart of the camp. Walls slow them down; turrets and a shorter perimeter finish the job.");
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

  /**
   * Breaking gear down returns half the recipe, scaled by what is left of it.
   * Outgrown tools stop being dead weight and become the next tier's wood.
   */
  salvagePrice(entry) {
    const def = ITEMS[entry.id];
    const recipe = RECIPES.find(r => r.out === entry.id);
    const out = {};
    if (!recipe) return out;
    const condition = def.durability ? 0.4 + 0.6 * (entry.dur / def.durability) : 1;
    for (const k in recipe.cost) {
      const n = Math.floor(recipe.cost[k] * 0.5 * condition / (recipe.count || 1));
      if (n > 0) out[k] = n;
    }
    return out;
  }

  salvageGear(slot) {
    const s = this.resolveSlot(slot);
    if (!s || s.inv !== this.economy.inv) return false;
    const entry = s.inv.slots[s.index];
    if (!entry) return false;
    const parts = this.salvagePrice(entry);
    s.inv.slots[s.index] = null;
    for (const k in parts) this.giveOrDrop(k, parts[k], this.player.position.x, this.player.position.z);
    this.economy._sync();
    this.onLoadoutChanged();
    this.ui.toast(Object.keys(parts).length
      ? "Broke it down: +" + costText(parts)
      : "Broke it down, nothing usable left");
    return true;
  }

  /** Restoring gear costs 70% of the recipe, scaled to how worn it is. */
  repairPrice(entry) {
    const def = ITEMS[entry.id];
    const recipe = RECIPES.find(r => r.out === entry.id);
    const missing = 1 - entry.dur / def.durability;
    const price = {};
    if (!recipe) return price;
    for (const k in recipe.cost) {
      const n = Math.ceil(recipe.cost[k] * missing * 0.7);
      if (n > 0) price[k] = n;
    }
    return price;
  }

  repairGear(entry) {
    const def = ITEMS[entry.id];
    const price = this.repairPrice(entry);
    if (!this.economy.canAfford(price)) { this.ui.toast("Not enough materials"); return false; }
    this.economy.spend(price);
    entry.dur = def.durability;
    this.onLoadoutChanged();
    this.ui.toast(def.label + " restored");
    return true;
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

  /**
   * Slot ids are strings so containers can share one drag system:
   * "3" is a backpack slot, "chest:7" a chest slot, "armor" the worn slot.
   */
  resolveSlot(id) {
    if (id === "armor") return null;
    const s = String(id);
    if (s.startsWith("chest:")) {
      const inv = this.chestInv();
      return inv ? { inv, index: parseInt(s.slice(6), 10) } : null;
    }
    if (s.startsWith("pack:")) {
      const inv = this.packInv();
      return inv ? { inv, index: parseInt(s.slice(5), 10) } : null;
    }
    return { inv: this.economy.inv, index: parseInt(s, 10) };
  }

  moveSlot(from, to) {
    const eq = this.equip;
    if (String(from) === String(to)) return;

    if (to === "armor") {
      const src = this.resolveSlot(from);
      if (src && src.inv === this.economy.inv) eq.equipArmor(src.index);
      return;
    }
    if (from === "armor") {
      const dst = this.resolveSlot(to);
      const entry = eq.worn.armor;
      if (!entry || !dst) return;
      const other = dst.inv.slots[dst.index];
      if (other && ITEMS[other.id].slot !== "armor") { this.ui.toast("That slot is taken"); return; }
      eq.worn.armor = other && dst.inv === this.economy.inv ? other : null;
      if (other && dst.inv !== this.economy.inv) { this.ui.toast("That slot is taken"); return; }
      dst.inv.slots[dst.index] = entry;
      this.onLoadoutChanged();
      return;
    }

    const src = this.resolveSlot(from), dst = this.resolveSlot(to);
    if (!src || !dst) return;
    const a = src.inv.slots[src.index], b = dst.inv.slots[dst.index];
    if (!a) return;
    // Same stackable item: top the target up. A full target has nothing to
    // merge into, so fall through to a plain swap rather than doing nothing.
    const room = b && b.id === a.id && ITEMS[a.id].stack > 1 ? ITEMS[a.id].stack - b.count : 0;
    if (room > 0) {
      const moved = Math.min(room, a.count);
      b.count += moved; a.count -= moved;
      if (a.count <= 0) src.inv.slots[src.index] = null;
    } else {
      src.inv.slots[src.index] = b || null;
      dst.inv.slots[dst.index] = a;
    }
    this.economy._sync();          // the HUD mirror and build affordability
    this.onLoadoutChanged();
  }

  /** One tap sends a stack to the other container. */
  quickMove(slotId, other) {
    const box = other || this.chestInv();
    if (!box) return;
    const src = this.resolveSlot(slotId);
    if (!src) return;
    const entry = src.inv.slots[src.index];
    if (!entry) return;
    const target = src.inv === box ? this.economy.inv : box;
    // Move the entry itself, not a fresh copy: rebuilding it from id and
    // count would hand back a fully repaired tool every time.
    if (target.putEntry(entry)) {
      src.inv.slots[src.index] = null;
    } else {
      const left = target.add(entry.id, entry.count);
      if (left >= entry.count) { this.ui.toast("No room"); return; }
      if (left > 0) entry.count = left;
      else src.inv.slots[src.index] = null;
    }
    this.economy._sync();
    this.onLoadoutChanged();
    this._clearEmptyPacks();
  }

  /** Sends every material stack in the backpack to the open chest. */
  storeAll() {
    const chest = this.chestInv();
    if (!chest) return;
    const inv = this.economy.inv;
    let moved = 0;
    for (let i = 0; i < inv.size; i++) {
      const entry = inv.slots[i];
      if (!entry || ITEMS[entry.id].kind !== "material") continue;
      const left = chest.add(entry.id, entry.count);
      moved += entry.count - left;
      if (left <= 0) inv.slots[i] = null;
      else entry.count = left;
    }
    this.ui.toast(moved ? "Stored " + moved : "Chest is full");
    this.economy._sync();
    this.onLoadoutChanged();
  }

  /** Keeps a few animals roaming; they are the only meat on the map. */
  _updateWildlife(dt) {
    const alive = this.enemies.filter(e => e.mode === "critter").length;
    this.wildlife.timer -= dt;
    if (this.wildlife.timer > 0 || alive >= CONFIG.world.critters) return;
    this.wildlife.timer = 25;
    const g = this.grid;
    const edge = (Math.random() - 0.5) * g.w * g.cell * 0.9;
    const side = Math.random() < 0.5 ? -1 : 1;
    const route = [];
    for (let i = 0; i < 4; i++) {
      route.push({ x: (Math.random() - 0.5) * g.w * g.cell * 0.8, z: (Math.random() - 0.5) * g.h * g.cell * 0.8 });
    }
    this.spawnEnemy(edge, side * g.h * g.cell * 0.45, CONFIG.enemyTypes.critter,
                    { mode: "critter", route, lifetime: 9999 });
  }

  /* ---- death packs -------------------------------------------------------
   * Dying costs you everything you were carrying, but not permanently: it
   * lies where you fell until you walk back for it. */

  dropPack(x, z) {
    const inv = this.economy.inv;
    const carried = [];
    for (let i = 0; i < inv.size; i++) {
      if (inv.slots[i]) { carried.push(inv.slots[i]); inv.slots[i] = null; }
    }
    if (this.equip.worn.armor) { carried.push(this.equip.worn.armor); this.equip.worn.armor = null; }
    if (!carried.length) return;
    this.dropItemsAt(x, z, carried, "death");
    this.economy._sync();
    this.onLoadoutChanged();
    this.ui.toast("You dropped everything you carried");
  }

  /**
   * Hands over what fits and leaves the rest on the ground. Felling a tree
   * with a full pack used to destroy the tree and silently bin the wood.
   */
  giveOrDrop(id, count, x, z) {
    const left = this.economy.inv.add(id, count);
    this.economy._sync();
    if (left > 0) this.dropItemsAt(x, z, [makeItemEntry(id, left)]);
    return count - left;
  }

  /** Puts one slot's contents on the ground in front of the player. */
  dropFromSlot(slot) {
    let entry = null;
    if (slot === "armor") {
      entry = this.equip.worn.armor;
      if (entry) this.equip.worn.armor = null;
    } else {
      const s = this.resolveSlot(slot);
      if (!s || s.inv !== this.economy.inv) return;
      entry = s.inv.slots[s.index];
      if (entry) s.inv.slots[s.index] = null;
    }
    if (!entry) return;
    const p = this.player.position;
    this.dropItemsAt(p.x + Math.sin(this.player.yaw) * 1.4, p.z + Math.cos(this.player.yaw) * 1.4, [entry]);
    this.economy._sync();
    this.onLoadoutChanged();
    this.ui.refreshBackpack();
    this.ui.toast("Dropped " + ITEMS[entry.id].label.toLowerCase());
  }

  /** Adds to a sack already lying nearby, or starts a new one. */
  dropItemsAt(x, z, entries, kind) {
    let pack = null;
    for (const p of this.packs) {
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < 9) { pack = p; break; }
    }
    if (!pack) {
      const mesh = new THREE.Mesh(GEO.bagBody, MATS.hide);
      mesh.position.set(x, 0.45, z);
      mesh.castShadow = true;
      this.scene.add(mesh);
      pack = {
        x, z, mesh, bob: Math.random() * 6, kind: kind || "drop",
        inv: new Inventory(CONFIG.station.chestSlots)
      };
      pack.life = kind === "death" ? CONFIG.packs.deathLife : CONFIG.packs.dropLife;
      this.packs.push(pack);
    }
    // Anything added keeps the sack around for its full span again.
    if (kind === "death") { pack.kind = "death"; pack.life = CONFIG.packs.deathLife; }
    else pack.life = Math.max(pack.life, CONFIG.packs.dropLife);
    for (const entry of entries) {
      if (!pack.inv.putEntry(entry)) pack.inv.add(entry.id, entry.count);
    }
    return pack;
  }

  nearestPack() {
    const p = this.player;
    if (!p || p.downed) return null;
    let best = null, bestD = CONFIG.station.range * CONFIG.station.range;
    for (const pack of this.packs) {
      const d = (pack.x - p.position.x) ** 2 + (pack.z - p.position.z) ** 2;
      if (d < bestD) { bestD = d; best = pack; }
    }
    return best;
  }

  /** Opens the sack at your feet, the same way a chest opens. */
  openPack() {
    const pack = this.nearestPack();
    if (!pack) return;
    this.openPackRef = pack;
    this.ui.showTab("pack");
    if (!this.ui.panel.classList.contains("show")) this.ui.toggleBackpack();
  }

  packInv() {
    const pack = this.openPackRef;
    return pack && this.packs.indexOf(pack) >= 0 ? pack.inv : null;
  }

  /** Empties whatever fits straight into the backpack. */
  recoverPack() {
    const pack = this.openPackRef || this.nearestPack();
    if (!pack) return;
    const inv = this.economy.inv;
    let left = 0;
    for (let i = 0; i < pack.inv.size; i++) {
      const entry = pack.inv.slots[i];
      if (!entry) continue;
      if (inv.putEntry(entry)) pack.inv.slots[i] = null;
      else left++;
    }
    this.economy._sync();
    this.onLoadoutChanged();
    this._clearEmptyPacks();
    if (!left) this.ui.toast("Sack emptied");
    else this.ui.toast(left + " stacks left, sack rots in " + Math.ceil(pack.life) + "s");
    this.ui.refreshBackpack();
  }

  _clearEmptyPacks() {
    for (let i = this.packs.length - 1; i >= 0; i--) {
      const p = this.packs[i];
      if (p.inv.slots.some(Boolean)) continue;
      this.scene.remove(p.mesh);
      if (this.openPackRef === p) this.openPackRef = null;
      this.packs.splice(i, 1);
    }
  }

  _updatePacks(dt) {
    for (let i = this.packs.length - 1; i >= 0; i--) {
      const pack = this.packs[i];
      pack.bob += dt * 2.2;
      pack.mesh.position.y = 0.45 + Math.sin(pack.bob) * 0.07;
      pack.mesh.rotation.y += dt * 0.5;

      pack.life -= dt;
      if (pack.life <= 0) {
        this.playCollapse(pack.mesh);
        this.packs.splice(i, 1);
        continue;
      }
      // The last stretch is visible: it shrinks and blinks before it goes.
      if (pack.life < CONFIG.packs.warnAt) {
        const k = pack.life / CONFIG.packs.warnAt;
        pack.mesh.scale.setScalar(0.55 + k * 0.45);
        pack.mesh.visible = pack.life > 12 || Math.sin(pack.life * 9) > -0.3;
      }
    }
    const near = this.nearestPack();
    if (!!near !== this._packBtnOn) {
      this._packBtnOn = !!near;
      document.getElementById("packBtn").classList.toggle("hidden", !near);
      if (this.ui.panel.classList.contains("show")) this.ui.refreshBackpack();
    }
    if (near && this.openPackRef !== near && !this.ui.panel.classList.contains("show")) {
      this.openPackRef = near;      // the button always opens the closest one
    }
    if (!near) this.openPackRef = null;
  }

  /* ---- persistence -------------------------------------------------------
   * The world is small enough to write out whole: the grid, what stands on
   * it, what is growing, what you carry and what time it is. Raiders and
   * animals are deliberately left out - they come back on their own. */

  saveState() {
    const g = this.grid, b = this.build;
    const structures = [];
    b.placed.forEach((mesh, i) => {
      const def = g.def[i];
      if (!def) return;
      const rec = { i, id: def.id, hp: g.hp[i] };
      const meta = b.meta.get(i);
      if (meta) rec.orient = meta.orient;
      const chest = b.chests.get(i);
      if (chest) rec.chest = chest.slots;
      const tray = b.outputs.get(i);
      if (tray && tray.count) rec.tray = tray.slots;
      const queue = b.queues.get(i);
      if (queue && queue.jobs.length) rec.jobs = queue.jobs.map(j => ({ out: j.recipe.out, left: j.left }));
      structures.push(rec);
    });

    return {
      v: 1,
      cycle: { day: this.cycle.day, t: this.cycle.t, raided: this.cycle.raidLaunched },
      player: {
        x: this.player.position.x, z: this.player.position.z, yaw: this.player.yaw,
        hp: this.player.hp, hunger: this.player.hunger, torch: this.player.torchFuel
      },
      inv: this.economy.inv.slots,
      armor: this.equip.worn.armor,
      hand: this.equip.hand,
      core: { cell: this.coreCell, carrying: this.carrying, carriedHp: this.carriedHp },
      structures,
      nodes: this.resources.nodes.map(n => ({
        id: n.def.id, cx: n.cx, cy: n.cy, growth: n.growth, hp: n.hp, cd: n.cooldown
      })),
      packs: this.packs.map(p => ({ x: p.x, z: p.z, items: p.inv.slots, life: p.life, kind: p.kind })),
      handJobs: this.handQueue.jobs.map(j => ({ out: j.recipe.out, left: j.left })),
      stats: this.stats
    };
  }

  loadState(s) {
    if (!s || s.v !== 1) return false;
    const g = this.grid, b = this.build;

    // Wipe the world without any farewell animations.
    for (const e of this.enemies) e.dispose();
    this.enemies.length = 0;
    for (const fx of this.effects) this.scene.remove(fx.object);
    this.effects.length = 0;
    for (const c of this.particles) this.scene.remove(c.mesh);
    this.particles.length = 0;
    for (const pack of this.packs) this.scene.remove(pack.mesh);
    this.packs.length = 0;
    for (const n of this.resources.nodes) n.dispose(true);
    this.resources.nodes.length = 0;
    b.reset();
    this.bars.clear();
    if (this.carriedMesh) { this.player.object.remove(this.carriedMesh); this.carriedMesh = null; }
    this.carrying = false;

    for (const rec of s.structures) {
      const def = STRUCTURES[rec.id];
      if (!def) continue;
      const cx = rec.i % g.w, cy = (rec.i / g.w) | 0;
      if (rec.orient !== undefined) b.meta.set(rec.i, { orient: rec.orient });
      b.create(cx, cy, def);
      g.hp[rec.i] = rec.hp;
      if (rec.chest) b.outputAt && b.chests.set(rec.i, Object.assign(new Inventory(CONFIG.station.chestSlots), { slots: rec.chest }));
      if (rec.tray) b.outputAt(rec.i).slots = rec.tray;
      if (rec.jobs) {
        const q = b.queueAt(rec.i);
        q.jobs = rec.jobs.map(j => this._job(j));
      }
    }
    b.placed.forEach((mesh, i) => b.refresh(i % g.w, (i / g.w) | 0));

    for (const rec of s.nodes) {
      const def = RESOURCES[rec.id];
      if (!def) continue;
      const node = this.resources.plantAt(def, rec.cx, rec.cy, rec.growth);
      if (node) { node.hp = rec.hp; node.cooldown = rec.cd || 0; }
    }

    this.economy.inv.slots = s.inv.map(e => e || null);
    this.equip.worn.armor = s.armor || null;
    this.equip.hand = s.hand || 0;
    this.handQueue.jobs = (s.handJobs || []).map(j => this._job(j));

    this.coreCell = s.core.cell;
    this.carriedHp = s.core.carriedHp;
    if (s.core.carrying) { this.coreCell = -1; this.liftCoreSilently(s.core.carriedHp); }

    for (const rec of s.packs || []) this._restorePack(rec);

    this.player.position.set(s.player.x, 0, s.player.z);
    this.player.yaw = s.player.yaw;
    this.player.hp = s.player.hp;
    this.player.hunger = s.player.hunger;
    this.player.torchFuel = s.player.torch || 0;
    this.player.downed = false;
    this.player.object.visible = true;
    this.cycle.day = s.cycle.day;
    this.cycle.t = s.cycle.t;
    this.cycle.raidLaunched = s.cycle.raided;
    this.cycle.lastLight = -1;
    this.stats = s.stats || this.stats;

    this.path.dirty = true;
    for (const id in this.fields) this.fields[id].sig = "";
    this.economy._sync();
    this.onLoadoutChanged();
    this.ui.setHp(this.player.hp / CONFIG.player.maxHp);
    this.running = true;
    this.ui.showOverlay(false);
    return true;
  }

  _job(rec) {
    const recipe = RECIPES.find(r => r.out === rec.out) || RECIPES[0];
    return { recipe, left: rec.left, total: recipe.time, done: rec.left <= 0 };
  }

  _restorePack(rec) {
    const mesh = new THREE.Mesh(GEO.bagBody, MATS.hide);
    mesh.position.set(rec.x, 0.45, rec.z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    const inv = new Inventory(CONFIG.station.chestSlots);
    (rec.items || []).forEach((e, i) => { if (e) { if (i < inv.size) inv.slots[i] = e; else inv.putEntry(e); } });
    this.packs.push({
      x: rec.x, z: rec.z, mesh, inv, bob: 0,
      kind: rec.kind || "drop",
      life: rec.life !== undefined ? rec.life
        : (rec.kind === "death" ? CONFIG.packs.deathLife : CONFIG.packs.dropLife)
    });
  }

  /** Puts the core back on the player's back after a load. */
  liftCoreSilently(hp) {
    this.carrying = true;
    this.carriedHp = hp;
    this.carriedMesh = STRUCTURES.core.build();
    this.carriedMesh.scale.setScalar(0.55);
    this.carriedMesh.position.set(0, 2.15, 0);
    this.player.object.add(this.carriedMesh);
  }

  /* ---- storage ---------------------------------------------------------- */

  save(quiet) {
    try {
      localStorage.setItem(CONFIG.save.key, JSON.stringify(this.saveState()));
      if (!quiet) this.ui.toast("Saved");
      return true;
    } catch (e) {
      // Private mode, a full quota, or a sandboxed page: keep it in memory so
      // the run at least survives a restart within this session.
      this._memorySave = this.saveState();
      if (!quiet) this.ui.toast("Saved in memory only - storage unavailable");
      return false;
    }
  }

  /**
   * Nothing here may throw. A half-written or corrupt save used to take the
   * whole boot down with it - the parse sat outside the guard - and the game
   * simply never appeared.
   */
  loadSaved() {
    let data = null;
    try {
      const raw = localStorage.getItem(CONFIG.save.key) ||
                  localStorage.getItem(CONFIG.save.legacyKey);
      data = raw ? JSON.parse(raw) : this._memorySave;
    } catch (e) {
      this.wipeSave();
      this.ui.toast("Saved game was unreadable - starting fresh");
      return false;
    }
    if (!data) return false;
    try { return this.loadState(data); }
    catch (e) {
      reportError(e);
      this.wipeSave();
      this.ui.toast("Saved game could not be restored - starting fresh");
      return false;
    }
  }

  hasSave() {
    try {
      return !!(localStorage.getItem(CONFIG.save.key) ||
                localStorage.getItem(CONFIG.save.legacyKey));
    } catch (e) { return !!this._memorySave; }
  }

  wipeSave() {
    try {
      localStorage.removeItem(CONFIG.save.key);
      localStorage.removeItem(CONFIG.save.legacyKey);
    } catch (e) {}
    this._memorySave = null;
  }

  /** Nearest station of a kind within reach, or null. */
  /** The best station of a kind in reach - a higher tier always wins. */
  nearestStation(kind) {
    const p = this.player;
    if (!p || p.downed) return null;
    const range = CONFIG.station.range * CONFIG.station.range;
    let best = null, bestD = range, bestTier = -1;
    this.build.placed.forEach((mesh, i) => {
      const def = this.grid.def[i];
      if (!def || def.station !== kind) return;
      const dx = mesh.position.x - p.position.x, dz = mesh.position.z - p.position.z;
      const d = dx * dx + dz * dz;
      if (d > range) return;
      const tier = def.tier || 1;
      if (tier > bestTier || (tier === bestTier && d < bestD)) {
        bestTier = tier; bestD = d; best = { i, def, mesh, tier };
      }
    });
    return best;
  }

  openChest() {
    const near = this.nearestStation("storage");
    if (!near) return;
    this.openChestCell = near.i;
    this.ui.showTab("chest");
    if (!this.ui.panel.classList.contains("show")) this.ui.toggleBackpack();
  }

  chestInv() {
    return this.openChestCell !== undefined ? this.build.chests.get(this.openChestCell) : null;
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
    const hit = this.raycaster.intersectObject(this.ground)[0];
    if (!hit) return;
    this.build.aimAt(hit.point.x, hit.point.z);
    this.build.placeAtAim();
  }

  spawnEnemy(x, z, type, opts) {
    const e = new Enemy(this, x, z, type, opts);
    this.enemies.push(e);
    return e;
  }

  spawnChips(x, y, z, count, color) {
    if (!this.chipMats[color]) this.chipMats[color] = new THREE.MeshBasicMaterial({ color });
    const mat = this.chipMats[color];
    for (let i = 0; i < count; i++) {
      if (this.particles.length > 160) break;
      const m = new THREE.Mesh(GEO.chip, mat);
      m.position.set(x, y, z);
      this.scene.add(m);
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

  _updateEffects(dt) {
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
        this.scene.remove(fx.object);
        for (const m of fx.mats) m.dispose();
        this.effects.splice(i, 1);
      }
    }
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
    const chase = (this.huntPlayer || this.carrying) && !this.player.downed;
    if (chase) {
      return [{ cx: g.cellX(this.player.position.x), cy: g.cellY(this.player.position.z), bias: 0 }];
    }
    if (this.coreCell >= 0) {
      return [{ cx: this.coreCell % g.w, cy: (this.coreCell / g.w) | 0, bias: 0 }];
    }
    return [{ cx: g.w >> 1, cy: g.h >> 1, bias: 0 }];
  }

  spawnBolt(x, y, z, target, damage) {
    const mesh = new THREE.Mesh(GEO.bolt, MATS.bolt);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.bolts.push({ mesh, target, damage, life: 2.5 });
  }

  _updateBolts(dt) {
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
          this.scene.remove(b.mesh); this.bolts.splice(i, 1);
          continue;
        }
        const step = CONFIG.bolt.speed * dt;
        b.mesh.position.x += dx / d * step;
        b.mesh.position.y += dy / d * step;
        b.mesh.position.z += dz / d * step;
        b.mesh.rotation.y = Math.atan2(dx, dz);
      } else {
        this.scene.remove(b.mesh); this.bolts.splice(i, 1);
      }
    }
  }

  slashFx(player) {
    this.slash.position.set(player.position.x, 1.0, player.position.z);
    this.slash.rotation.z = -player.yaw;
    this.slash.visible = true;
    this.slashT = 0;
  }

  shake(amount) { this.rig.shake = Math.max(this.rig.shake, amount); }

  resolveMove(pos, nx, nz, radius, isPlayer) {
    const g = this.grid;
    const limitX = (g.w * g.cell) / 2 - radius;
    const limitZ = (g.h * g.cell) / 2 - radius;
    nx = clamp(nx, -limitX, limitX);
    nz = clamp(nz, -limitZ, limitZ);
    // Escape hatch: anything already inside solid geometry (a boulder that
    // regrew underneath it, say) may move freely until it is out again.
    if (this._blocked(pos.x, pos.z, radius, isPlayer)) { pos.x = nx; pos.z = nz; return; }
    if (!this._blocked(nx, pos.z, radius, isPlayer)) pos.x = nx;
    if (!this._blocked(pos.x, nz, radius, isPlayer)) pos.z = nz;
  }

  _blocked(x, z, radius, isPlayer) {
    const g = this.grid;
    const minX = g.cellX(x - radius), maxX = g.cellX(x + radius);
    const minZ = g.cellY(z - radius), maxZ = g.cellY(z + radius);
    for (let cy = minZ; cy <= maxZ; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        if (!g.inBounds(cx, cy)) continue;
        const i = g.idx(cx, cy);
        if (isPlayer ? g.blocksPlayer(i) : g.blocksEnemy(i)) return true;
      }
    }
    return false;
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
    this.wipeSave();
    for (const e of this.enemies) e.dispose();
    this.enemies.length = 0;
    for (const p of this.particles) this.scene.remove(p.mesh);
    this.particles.length = 0;
    for (const fx of this.effects) this.scene.remove(fx.object);
    this.effects.length = 0;
    for (const b of this.bolts) this.scene.remove(b.mesh);
    this.bolts.length = 0;
    for (const pack of this.packs) this.scene.remove(pack.mesh);
    this.packs.length = 0;
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
    if (this.carriedMesh) { this.player.object.remove(this.carriedMesh); this.carriedMesh = null; }
    this.carrying = false;
    this.carriedHp = CONFIG.core.hp;
    this._coreBtnMode = undefined;
    this._spawnCore();
    this.player.hp = CONFIG.player.maxHp;
    this.player.downed = false;
    this.player.object.visible = true;
    this.player.position.set(this.corePosition().x, 0, this.corePosition().z + CONFIG.grid.cell * 2);
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

    if (this.carrying && this.carriedMesh) {
      this.carriedMesh.userData.crystal.rotation.y += dt * 1.4;
    }
    this._updateCoreButton();
    this._updateChestButton();
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
    this._updateBolts(dt);
    this.cycle.update(dt);
    this.hordes.update(dt);
    this._updateWildlife(dt);
    this._updatePacks(dt);

    // Rolling measure of what the field actually costs, shown on the stats screen.
    const ps = this._pathStats;
    ps.window += dt;
    if (ps.window >= 2) {
      ps.rate = ps.builds / ps.window;
      ps.avg = ps.builds ? ps.ms / ps.builds : 0;
      ps.builds = 0; ps.ms = 0; ps.window = 0;
    }

    this.saveTimer -= dt;
    if (this.saveTimer <= 0) { this.saveTimer = CONFIG.save.autoEvery; this.save(true); }
    this.build.updateGhost();
    this.build.updateBars(dt);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vy -= 12 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += dt * 6;
      if (p.life <= 0 || p.mesh.position.y < 0) { this.scene.remove(p.mesh); this.particles.splice(i, 1); }
    }

    if (this.slashT >= 0) {
      this.slashT += dt;
      this.slash.material.opacity = Math.max(0, 0.5 - this.slashT * 3.5);
      if (this.slashT > 0.16) { this.slashT = -1; this.slash.visible = false; }
    }

    this._updateEffects(dt);
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
