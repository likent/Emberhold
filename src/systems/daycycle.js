import { clamp } from "../core/util.js";
import { CONFIG } from "../data/config.js";

/**
 * Day/night cycle. Daylight is safe: gather, build, craft. At dusk a raid
 * sets out, sized by how many days you have survived, and every seventh
 * night is a big one. The lighting is driven from the same clock, so a
 * single number - daylight - decides both how it looks and what is coming.
 */
export class DayCycle {
  constructor(game) { this.game = game; this.paused = false; this.reset(); }

  reset() {
    this.day = 1;
    this.t = 0;                      // seconds into the current day+night
    this.raidLaunched = false;
    this.lastLight = -1;
  }

  get period() { return CONFIG.cycle.dayLength + CONFIG.cycle.nightLength; }
  get isNight() { return this.t >= CONFIG.cycle.dayLength; }

  /** 1 in full daylight, 0 in full dark, ramped across dusk and dawn. */
  daylight() {
    const c = CONFIG.cycle;
    if (this.t < c.dayLength - c.dusk) return 1;
    if (this.t < c.dayLength) return 1 - (this.t - (c.dayLength - c.dusk)) / c.dusk;
    const intoNight = this.t - c.dayLength;
    if (intoNight < c.nightLength - c.dawn) return 0;
    return (intoNight - (c.nightLength - c.dawn)) / c.dawn;
  }

  /** Seconds until the next phase flips, for the HUD. */
  remaining() {
    const c = CONFIG.cycle;
    return this.isNight ? this.period - this.t : c.dayLength - this.t;
  }

  update(dt) {
    if (!this.paused) {
      this.t += dt;
      if (!this.raidLaunched && this.isNight) {
        this.raidLaunched = true;
        if (this.day >= CONFIG.cycle.firstRaidNight) this.spawnRaid();
        else this.game.ui.toast("Night " + this.day + " - quiet, for now");
      }
      if (this.t >= this.period) {
        this.t -= this.period;
        this.day++;
        this.raidLaunched = false;
        this.game.ui.toast("Day " + this.day);
      }
    }
    this.game.ui.setCycle(this.day, this.isNight, this.remaining(), this.paused);
    this._applyLight();
  }

  /** Blends the two sky presets by the same daylight number. */
  _applyLight() {
    const light = this.daylight();
    if (Math.abs(light - this.lastLight) < 0.01) return;
    this.lastLight = light;
    this.game.applySkyBlend(light);
  }

  isBigRaid() { return this.day % CONFIG.cycle.bigRaidEvery === 0; }

  _rollType() {
    let mix = CONFIG.waveTable[0].mix;
    for (const row of CONFIG.waveTable) if (this.day >= row.from) mix = row.mix;
    let total = 0;
    for (const id in mix) total += mix[id];
    let roll = Math.random() * total;
    for (const id in mix) {
      roll -= mix[id];
      if (roll <= 0) return CONFIG.enemyTypes[id];
    }
    return CONFIG.enemyTypes.raider;
  }

  spawnRaid() {
    const c = CONFIG.cycle;
    const big = this.isBigRaid();
    let count = Math.round((c.baseCount + c.perDay * (this.day - 1)) * (big ? c.bigMultiplier : 1));
    const g = this.game.grid;
    const side = Math.floor(Math.random() * 4);
    const baseX = side === 0 ? 1 : side === 1 ? g.w - 2 : Math.floor(Math.random() * g.w);
    const baseY = side === 2 ? 1 : side === 3 ? g.h - 2 : Math.floor(Math.random() * g.h);
    let spawned = 0;
    for (let n = 0; n < count * 5 && spawned < count; n++) {
      if (this.game.enemies.length >= CONFIG.enemy.maxAlive) break;
      const cx = clamp(baseX + Math.round((Math.random() - 0.5) * c.spawnSpread), 0, g.w - 1);
      const cy = clamp(baseY + Math.round((Math.random() - 0.5) * c.spawnSpread), 0, g.h - 1);
      if (g.blocksEnemy(g.idx(cx, cy))) continue;
      this.game.spawnEnemy(g.centerX(cx), g.centerZ(cy), big ? this._rollBig() : this._rollType());
      spawned++;
    }
    const seen = {};
    for (const e of this.game.enemies) seen[e.type.label] = (seen[e.type.label] || 0) + 1;
    this.game.ui.toast((big ? "BLOOD RAID - night " : "Raid - night ") + this.day + ": " +
      Object.keys(seen).map(k => seen[k] + " " + k).join(", "));
    this.game.shake(big ? 0.8 : 0.4);
  }

  /** Big nights always bring the heavy classes, whatever the day table says. */
  _rollBig() {
    const roll = Math.random();
    if (roll < 0.35) return CONFIG.enemyTypes.brute;
    if (roll < 0.7) return CONFIG.enemyTypes.runner;
    return CONFIG.enemyTypes.raider;
  }
}
