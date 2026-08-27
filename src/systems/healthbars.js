import { clamp } from "../core/util.js";

/* --------------------------------------------------------------------------
 * Floating health bars
 * A bar is created lazily on first damage and released on death, so the
 * scene never carries one per object. Two quads each: dark backing plus a
 * left-anchored fill (the fill sits at +w/2 inside a pivot at -w/2, so
 * scaling the pivot shrinks it towards the left edge, not the centre).
 * ------------------------------------------------------------------------ */

const BAR_HEIGHT = 0.17;

export class HealthBarSystem {
  constructor(game) {
    this.game = game;
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.bgMat = new THREE.MeshBasicMaterial({
      color: 0x080b10, transparent: true, opacity: 0.7, depthTest: false
    });
    this.fillMats = {};
    this.bars = new Set();
  }

  _fillMat(color) {
    if (!this.fillMats[color]) {
      this.fillMats[color] = new THREE.MeshBasicMaterial({ color, depthTest: false });
    }
    return this.fillMats[color];
  }

  create(color, width) {
    const group = new THREE.Group();
    const bg = new THREE.Mesh(this.geo, this.bgMat);
    bg.scale.set(width, BAR_HEIGHT, 1);
    bg.renderOrder = 900;

    const inner = width - 0.07;
    const pivot = new THREE.Group();
    pivot.position.x = -inner / 2;
    const fill = new THREE.Mesh(this.geo, this._fillMat(color));
    fill.scale.set(inner, BAR_HEIGHT - 0.06, 1);
    fill.position.set(inner / 2, 0, 0.001);
    fill.renderOrder = 901;
    pivot.add(fill);

    group.add(bg, pivot);
    group.visible = false;
    this.game.scene.add(group);
    const bar = { group, pivot };
    this.bars.add(bar);
    return bar;
  }

  set(bar, k) {
    k = clamp(k, 0, 1);
    bar.pivot.scale.x = k;
    bar.group.visible = k < 0.999;
  }

  place(bar, x, y, z) { bar.group.position.set(x, y, z); }

  destroy(bar) {
    this.game.scene.remove(bar.group);
    this.bars.delete(bar);
  }

  /** Billboard every visible bar towards the camera. */
  update(camera) {
    for (const bar of this.bars) {
      if (bar.group.visible) bar.group.quaternion.copy(camera.quaternion);
    }
  }

  clear() {
    for (const bar of this.bars) this.game.scene.remove(bar.group);
    this.bars.clear();
  }
}
