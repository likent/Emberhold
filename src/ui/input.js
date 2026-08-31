import { HOTBAR_SIZE } from "../data/items.js";

export class InputSystem {
  constructor(game) {
    this.game = game;
    this.move = { x: 0, y: 0 };
    this.look = { dx: 0, dy: 0 };
    this.keys = new Set();
    this.joyPointer = null;
    this.lookPointer = null;
    this.joyOrigin = { x: 0, y: 0 };
    this.tapCandidate = null;

    this.zone = document.getElementById("joyZone");
    this.base = document.getElementById("joyBase");
    this.knob = document.getElementById("joyKnob");
    this.canvas = document.getElementById("view");

    this._bindStick();
    this._bindLook();
    this._bindKeys();
  }

  _bindStick() {
    const maxR = 54;
    this.zone.addEventListener("pointerdown", e => {
      if (this.joyPointer !== null) return;
      this.joyPointer = e.pointerId;
      this.zone.setPointerCapture(e.pointerId);
      const r = this.zone.getBoundingClientRect();
      this.joyOrigin.x = e.clientX - r.left; this.joyOrigin.y = e.clientY - r.top;
      this.base.style.left = this.joyOrigin.x + "px"; this.base.style.top = this.joyOrigin.y + "px";
      this.knob.style.left = this.joyOrigin.x + "px"; this.knob.style.top = this.joyOrigin.y + "px";
      this.zone.classList.add("active");
      e.preventDefault();
    });
    this.zone.addEventListener("pointermove", e => {
      if (e.pointerId !== this.joyPointer) return;
      const r = this.zone.getBoundingClientRect();
      let dx = (e.clientX - r.left) - this.joyOrigin.x;
      let dy = (e.clientY - r.top) - this.joyOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > maxR) { dx = dx / len * maxR; dy = dy / len * maxR; }
      this.knob.style.left = (this.joyOrigin.x + dx) + "px";
      this.knob.style.top = (this.joyOrigin.y + dy) + "px";
      this.move.x = dx / maxR; this.move.y = dy / maxR;
    });
    const end = e => {
      if (e.pointerId !== this.joyPointer) return;
      this.joyPointer = null; this.move.x = 0; this.move.y = 0;
      this.zone.classList.remove("active");
    };
    this.zone.addEventListener("pointerup", end);
    this.zone.addEventListener("pointercancel", end);
  }

  _bindLook() {
    this.canvas.addEventListener("pointerdown", e => {
      if (this.lookPointer !== null) return;
      this.lookPointer = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
      this.tapCandidate = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointermove", e => {
      if (e.pointerId !== this.lookPointer) return;
      this.look.dx += e.clientX - this.lookLast.x;
      this.look.dy += e.clientY - this.lookLast.y;
      this.lookLast = { x: e.clientX, y: e.clientY };
    });
    const end = e => {
      if (e.pointerId !== this.lookPointer) return;
      this.lookPointer = null;
      const c = this.tapCandidate;
      if (c) {
        const moved = Math.hypot(e.clientX - c.x, e.clientY - c.y);
        if (moved < 12 && performance.now() - c.t < 350) this._worldTap(e.clientX, e.clientY);
        this.tapCandidate = null;
      }
    };
    this.canvas.addEventListener("pointerup", end);
    this.canvas.addEventListener("pointercancel", end);
  }

  /**
   * A tap on the world places where you pointed rather than where you stand.
   * Only in build mode: outside it a tap is just a look that went nowhere.
   */
  _worldTap(clientX, clientY) {
    if (!this.game.build.active) return;
    if (!this._ray) { this._ray = new THREE.Raycaster(); this._ndc = new THREE.Vector2(); }
    this._ndc.x = (clientX / innerWidth) * 2 - 1;
    this._ndc.y = -(clientY / innerHeight) * 2 + 1;
    this._ray.setFromCamera(this._ndc, this.game.camera);
    const hit = this._ray.intersectObject(this.game.scenery.ground)[0];
    if (!hit) return;
    this.game.build.aimAt(hit.point.x, hit.point.z);
    this.game.build.placeAtAim();
  }

  /**
   * Drops every pointer the input system is holding. The pause screen calls
   * this at both ends: a thumb still on the stick would keep the player
   * walking on resume, and the look it banked would land in one lump.
   */
  releaseAll() {
    this.move.x = 0; this.move.y = 0;
    this.look.dx = 0; this.look.dy = 0;
    this.joyPointer = null;
    this.lookPointer = null;
    this.tapCandidate = null;
    this.zone.classList.remove("active");
  }

  _bindKeys() {
    addEventListener("keydown", e => {
      if (e.code === "Escape") { e.preventDefault(); this.game.menu.toggle(); return; }
      // Nothing else reaches a frozen world: KeyF would arm a swing and KeyN
      // would spawn a raid into it.
      if (this.game.paused) return;
      this.keys.add(e.code);
      if (e.code === "KeyB") this.game.toggleBuild();
      if ((e.code === "Space" || e.code === "KeyE") && !e.repeat) this._placeHeld = false;
      if (e.code === "Space" || e.code === "KeyE") {
        if (e.repeat && !this._placeHeld) { this._placeHeld = this.game.build.beginLine(); }
      }
      if (e.code === "KeyG") this.game.toggleDebug();
      if (e.code === "KeyQ") this.game.cycleStructure();
      if (e.code === "KeyK") this.game.toggleSandbox();
      if (e.code === "KeyN") this.game.cycle.spawnRaid();
      if (e.code === "KeyP") this.game.toggleWavePause();
      if (e.code === "KeyF" && !e.repeat) {
        const item = this.game.equip.handItem();
        if (item && item.food) { this.game.player.eat(); }
        else if (item && item.kind === "deployable") {
          this.game.build.select(item.structure);
          if (!this.game.build.active) this.game.build.setActive(true);
          this.game.build.updateGhost();
          this.game.build.placeAtAim();
        } else this.game.player.acting = true;
      }
      if (e.code === "KeyI" || e.code === "Tab") { e.preventDefault(); this.game.panel.toggle(); }
      if (e.code.startsWith("Digit")) {
        const n = parseInt(e.code.slice(5), 10) - 1;
        if (n >= 0 && n < HOTBAR_SIZE) this.game.equip.selectHand(n);
      }
    });
    addEventListener("keyup", e => {
      this.keys.delete(e.code);
      if (e.code === "KeyF") this.game.player.acting = false;
      // A key held when the menu opened is released inside the pause; letting
      // that through would finish a run of walls in a world that has stopped.
      if (this.game.paused) { this._placeHeld = false; return; }
      if (e.code === "Space" || e.code === "KeyE") {
        if (this._placeHeld) this.game.build.commitLine();
        else this.game.build.placeAtAim();
        this._placeHeld = false;
      }
    });
  }

  sample() {
    let x = this.move.x, y = this.move.y;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) y -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) y += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    const look = { dx: this.look.dx, dy: this.look.dy };
    this.look.dx = 0; this.look.dy = 0;
    return { x, y, look };
  }
}
