import { reportError } from "../core/report-error.js";
import { CONFIG } from "../data/config.js";

/**
 * What the player has chosen about how the game looks and steers. Deliberately
 * kept apart from the run: wiping the camp throws the camp away, not the fact
 * that you play with the shadows off. Nothing here touches the DOM.
 */
export class Settings {
  constructor(game) {
    this.game = game;
    this.values = Object.assign({}, CONFIG.settings.defaults);
    this._memory = null;      // where a refusing localStorage puts them instead
    this._shadows = null;     // what is actually applied, so a no-op costs nothing
    this.load();
  }

  get(key) { return this.values[key]; }

  set(key, value) {
    if (!(key in CONFIG.settings.defaults)) return false;
    this.values[key] = value;
    this.apply();
    this.save();
    return true;
  }

  reset() {
    this.values = Object.assign({}, CONFIG.settings.defaults);
    this.apply();
    this.save();
  }

  /** A bad setting must never be able to stop the game from starting. */
  apply() {
    try { this._apply(); }
    catch (e) { reportError(e); }
  }

  /**
   * Pushes every value into the engine. Nothing reads a setting per frame: the
   * rig and the renderer are told once and keep the number themselves.
   */
  _apply() {
    const c = CONFIG.settings, g = this.game;
    g.rig.sens = c.lookScale[this.values.look];
    g.rig.invert = this.values.invertY ? -1 : 1;
    g.rig.distance = c.zoomDistance[this.values.zoom];
    g.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, c.pixelRatio[this.values.quality]));
    g._resize();               // a pixel ratio on its own does not resize the buffer
    this._applyShadows(!!this.values.shadows);
  }

  /**
   * Switching the shadow map off does not invalidate the programs that were
   * compiled with it baked in, so every material has to be marked dirty or the
   * meshes go on sampling a map nobody updates any more. The light goes first:
   * that is where the frame time actually is.
   *
   * The scene is walked rather than the MATS pool, because the player and the
   * structures build materials of their own and clone MATS.flame - the pool is
   * not the whole population.
   */
  _applyShadows(on) {
    if (this._shadows === on) return;
    this._shadows = on;
    const g = this.game;
    if (g.scenery && g.scenery.sun) g.scenery.sun.castShadow = on;
    g.renderer.shadowMap.enabled = on;
    if (on) g.renderer.shadowMap.needsUpdate = true;
    g.scene.traverse(o => {
      if (!o.material) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) m.needsUpdate = true;
    });
  }

  /**
   * A stored choice is honoured only if it still names something that exists.
   * Stricter than the save file on purpose: a bad enum here would poison the
   * renderer quietly instead of failing where it was written.
   */
  _clean(data) {
    const c = CONFIG.settings, out = Object.assign({}, c.defaults);
    const tables = { look: c.lookScale, quality: c.pixelRatio, zoom: c.zoomDistance };
    for (const key in c.defaults) {
      const value = data[key];
      if (value === undefined) continue;
      if (tables[key]) { if (value in tables[key]) out[key] = value; }
      else if (typeof value === typeof c.defaults[key]) out[key] = value;
    }
    return out;
  }

  load() {
    let data = null;
    try {
      const raw = localStorage.getItem(CONFIG.settings.key);
      data = raw ? JSON.parse(raw) : this._memory;
    } catch (e) {
      this.wipe();                        // unreadable: heal by forgetting it
      return false;
    }
    if (!data || data.v !== CONFIG.settings.v) return false;
    this.values = this._clean(data);
    return true;
  }

  save() {
    const blob = Object.assign({ v: CONFIG.settings.v }, this.values);
    try {
      localStorage.setItem(CONFIG.settings.key, JSON.stringify(blob));
      this._memory = null;
      return true;
    } catch (e) {
      // No toast: these are written on every tap, and a refused write is not
      // worth interrupting a run over.
      this._memory = blob;
      return false;
    }
  }

  /** Only the settings key: the run's own save is none of this file's business. */
  wipe() {
    try { localStorage.removeItem(CONFIG.settings.key); } catch (e) {}
    this._memory = null;
  }
}
