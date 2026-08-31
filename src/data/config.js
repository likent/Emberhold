export const CONFIG = {
  grid: { w: 40, h: 40, cell: 2 },

  player: {
    radius: 0.55,
    speed: 7.0,
    maxHp: 200,
    turnRate: 12,
    attack: { damage: 34, cooldown: 0.5, range: 3.1, arc: Math.PI * 0.62, swing: 0.22 },
    repair: { range: 3.2, swing: 0.42 },
    // Young growth is never a target, so planting next to yourself is safe.
    minHarvestGrowth: 0.45
  },

  /* The camera's own numbers, so a settings screen has something to scale. */
  camera: { yawRate: 0.006, pitchRate: 0.004, minPitch: 0.22, maxPitch: 1.25, distance: 13 },

  /* What the player may choose about how the game looks and steers. Stored
   * under its own key: wiping a run must not cost someone their settings. */
  settings: {
    key: "emberhold-settings-v1", v: 1,
    defaults: { look: "normal", invertY: false, shadows: true, quality: "high", zoom: "normal" },
    lookScale:    { low: 0.6, normal: 1, high: 1.6 },
    pixelRatio:   { low: 1, normal: 1.5, high: 2 },
    zoomDistance: { near: 10, normal: 13, far: 16 }
  },

  /* Wandering hordes: they cross the map on their own business, ignore the
   * core entirely, smash whatever stands in their way and leave. */
  hordes: {
    minGap: 170, maxGap: 320,    // seconds between bands
    minSize: 3, maxSize: 7,
    stops: [2, 4],               // waypoints before they head for the far edge
    idle: [1.5, 4.5],            // seconds spent standing around at each stop
    lifetime: 170,
    mix: { raider: 3, runner: 2, brute: 1 }
  },

  enemy: {
    attackRange: 1.7,
    separation: 1.15,
    maxAlive: 90
  },

  /* Day is for gathering and building, night is when they come. Raids scale
   * with the day count, and every seventh night is a big one. */
  cycle: {
    dayLength: 300,        // seconds of daylight
    nightLength: 115,
    dusk: 18, dawn: 18,    // seconds of transition at each end
    firstRaidNight: 2,     // nights before this are quiet - set to 7 for a long build-up
    bigRaidEvery: 7,
    baseCount: 4,
    perDay: 2,
    bigMultiplier: 2.4,
    spawnSpread: 7
  },

  core: { hp: 2600, carrySpeed: 0.42, liftRange: 3.2 },

  /* A full belly lasts about two days, so eating is a daily errand rather
   * than a constant nag. Empty, it starts costing health. */
  hunger: { max: 100, drain: 0.12, workDrain: 0.09, starveDps: 2.2, eatCooldown: 0.8 },

  /* Each class prices the world differently, so each gets its own flow field:
   * a brute chews through a fence faster than it can walk around, a runner
   * never will. One shared field would lie to both of them. */
  enemyTypes: {
    raider: {
      id: "raider", label: "Raider",
      hp: 60, speed: 2.5, radius: 0.5, damage: 12, attackCooldown: 1.0,
      dpsVsStructure: 22, trapFear: 1, aggroRange: 9,
      body: { w: 0.8, h: 1.0, d: 0.6 }, color: 0x8f4436, headColor: 0xb56a4c, hitColor: 0xffb3a0
    },
    runner: {
      id: "runner", label: "Runner",
      hp: 34, speed: 4.3, radius: 0.42, damage: 8, attackCooldown: 0.6,
      dpsVsStructure: 7, trapFear: 1.6, aggroRange: 17,
      body: { w: 0.6, h: 0.9, d: 0.5 }, color: 0xb8843a, headColor: 0xd8a45a, hitColor: 0xffe0a0
    },
    critter: {
      id: "critter", label: "Boar",
      hp: 30, speed: 3.4, radius: 0.45, damage: 0, attackCooldown: 9,
      dpsVsStructure: 0, trapFear: 2, aggroRange: 0,
      fleeRange: 8, drops: { raw_meat: 3, leather: 2 },
      body: { w: 0.9, h: 0.62, d: 0.5 }, color: 0xa98358, headColor: 0x8a6a48, hitColor: 0xffd9b0
    },
    brute: {
      id: "brute", label: "Brute",
      hp: 220, speed: 1.65, radius: 0.72, damage: 28, attackCooldown: 1.5,
      dpsVsStructure: 42, trapFear: 0.35, aggroRange: 4.5,
      body: { w: 1.25, h: 1.35, d: 0.95 }, color: 0x6b3f5e, headColor: 0x8d567c, hitColor: 0xffb0e0
    }
  },

  /* Which classes show up, by day. The last matching entry applies. */
  waveTable: [
    { from: 1, mix: { raider: 1 } },
    { from: 3, mix: { raider: 3, runner: 2 } },
    { from: 5, mix: { raider: 3, runner: 2, brute: 1 } },
    { from: 8, mix: { raider: 3, runner: 3, brute: 2 } }
  ],
  bolt: { speed: 22 },
  respawn: { delay: 5 },

  economy: { startWood: 20, startStone: 0 },
  inventory: { slots: 16 },
  station: { range: 5, chestSlots: 24 },

  /* Sacks on the ground rot away, so the map does not silt up with them.
   * What you dropped on purpose goes first; what you died holding lasts. */
  packs: { dropLife: 600, deathLife: 1800, warnAt: 45 },

  /* Lighting presets. Only "day" is used for now; a cycle later is just
   * interpolating between two of these and calling applySky each frame. */
  sky: {
    day: {
      background: 0xa8cfe6, fogNear: 62, fogFar: 148,
      hemiSky: 0xcfe6f7, hemiGround: 0x6f7f58, hemiIntensity: 0.95,
      sunColor: 0xfff6e2, sunIntensity: 1.55, sunPos: [34, 52, 24],
      ground: 0x5b7a45
    },
    night: {
      background: 0x0d141b, fogNear: 34, fogFar: 78,
      hemiSky: 0x9fc4de, hemiGround: 0x2a2620, hemiIntensity: 0.35,
      sunColor: 0x9fb4d6, sunIntensity: 0.35, sunPos: [26, 38, 18],
      ground: 0x36452f
    }
  },
  timeOfDay: "day",
  save: { key: "emberhold-save-v1", legacyKey: "siege-prototype-save-v1", autoEvery: 20 },
  craft: { maxQueue: 6, benchOutput: 4 },
  build: { maxLine: 14, holdDelay: 260 },

  // Sandbox is a test switch: building costs nothing and waves can be
  // summoned on demand, so mechanics can be exercised without grinding.
  sandbox: { enabled: false },

  path: {
    rebuildInterval: 0.35,
    diagonal: Math.SQRT2,
    // Experiment: when true the field is built from the player instead of the
    // core, which is the 7DTD arrangement. Costs a rebuild per cell crossed.
    huntPlayer: true
  },

  world: { trees: 46, rocks: 22, bushes: 26, berries: 20, critters: 8, ore: 9, mines: 2, quarries: 2, siteMinDistance: 24 }
};
