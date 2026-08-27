import { clamp } from "../core/util.js";
import { Cells } from "./cells.js";
import { paintIcons } from "./icons.js";
import { ItemInfo } from "./item-info.js";

/**
 * The head-up display: the bars, the day card, toasts and the end-of-run
 * overlay - everything that is on screen without being asked for. It also
 * builds the two pieces the rest of the interface is made of, the cell
 * gestures and the info card, so a panel can reach them through `game.ui`.
 */
export class UI {
  constructor(game) {
    this.game = game;
    paintIcons();
    this.cells = new Cells(game);
    this.card = new ItemInfo(game);
    this.hpFill = document.getElementById("hpFill");
    this.hungerFill = document.getElementById("hungerFill");
    this.hungerPill = document.getElementById("hungerPill");
    this.waveNum = document.getElementById("waveNum");
    this.waveTimer = document.getElementById("waveTimer");
    this.waveCard = document.getElementById("waveCard");
    this.enemyCount = document.getElementById("enemyCount");
    this.toastEl = document.getElementById("toast");
    this.overlay = document.getElementById("overlay");
    this._toastTimer = 0;
  }

  setHp(k) { this.hpFill.style.width = (clamp(k, 0, 1) * 100) + "%"; }
  setHunger(k) {
    this.hungerFill.style.width = (clamp(k, 0, 1) * 100) + "%";
    this.hungerPill.classList.toggle("starving", k <= 0.2);
  }

  /** The action button wears whatever is in hand, so it reads at a glance. */
  setActionIcon(item) {
    const btn = document.getElementById("actionBtn");
    const icon = item && item.icon ? item.icon : "fist";
    if (btn.dataset.icon === icon) return;
    btn.dataset.icon = icon;
    btn.title = item ? "Use " + item.label : "Bare hands";
    paintIcons(btn.parentElement);
  }

  setCoreButton(mode) {
    const btn = document.getElementById("coreBtn");
    btn.classList.toggle("hidden", !mode);
    btn.classList.toggle("on", mode === "drop");
    if (!mode) return;
    btn.dataset.icon = mode === "drop" ? "coreDown" : "coreLift";
    btn.title = mode === "drop" ? "Set the core down" : "Carry the core";
    paintIcons(btn.parentElement);
  }

  setRespawn(t) {
    this.toastEl.classList.toggle("show", t > 0);
    if (t > 0) this.toastEl.textContent = "Down - respawning in " + Math.ceil(t) + "s";
  }
  setInvulnerable(on) { this.hpFill.style.background = on ? "var(--accent)" : "var(--hp)"; }

  setSandbox(on) {
    document.getElementById("sandboxBtn").classList.toggle("on", on);
    document.getElementById("waveBtn").classList.toggle("hidden", !on);
    document.getElementById("hordeBtn").classList.toggle("hidden", !on);
    document.getElementById("debugBtn").classList.toggle("hidden", !on);
  }
  setCycle(day, night, t, paused) {
    this.waveNum.textContent = day;
    const icon = document.getElementById("phaseIcon");
    const want = night ? "moon" : "sun";
    if (icon.dataset.icon !== want) { icon.dataset.icon = want; paintIcons(icon.parentElement); }
    this.waveCard.classList.toggle("paused", !!paused);
    this.waveCard.classList.toggle("night", night);
    if (paused) {
      this.waveTimer.textContent = "paused";
      this.waveCard.classList.remove("imminent");
      return;
    }
    const s = Math.max(0, Math.ceil(t));
    this.waveTimer.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    // Amber as dusk closes in: that is the cue to be behind your walls.
    this.waveCard.classList.toggle("imminent", !night && s <= 25);
  }

  setEnemies(n) { this.enemyCount.textContent = n; }

  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove("show"), 1500);
  }
  showOverlay(show, title, text) {
    if (title) this.overlay.querySelector("h1").textContent = title;
    if (text) this.overlay.querySelector("p").textContent = text;
    this.overlay.classList.toggle("show", show);
  }
}
