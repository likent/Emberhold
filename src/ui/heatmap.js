import { CELL_BLOCKER, CELL_STRUCT, CELL_TRAP } from "../core/grid.js";
import { clamp } from "../core/util.js";

export class CostHeatmap {
  constructor(game) {
    this.game = game;
    const g = game.grid;
    this.canvas = document.createElement("canvas");
    this.canvas.width = g.w; this.canvas.height = g.h;
    this.ctx = this.canvas.getContext("2d");
    this.image = this.ctx.createImageData(g.w, g.h);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(g.w * g.cell, g.h * g.cell),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, opacity: 0.6, depthWrite: false })
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.035;
    this.mesh.visible = false;
    game.scene.add(this.mesh);
  }
  setVisible(v) { this.mesh.visible = v; }
  refresh() {
    if (!this.mesh.visible) return;
    const g = this.game.grid, p = this.game.paths.shown, data = this.image.data;
    const max = p.maxDist || 1;
    for (let i = 0; i < g.w * g.h; i++) {
      const o = i * 4;
      const t = g.type[i];
      if (t === CELL_BLOCKER) { data[o] = 30; data[o + 1] = 34; data[o + 2] = 40; data[o + 3] = 210; continue; }
      if (t === CELL_STRUCT) { data[o] = 240; data[o + 1] = 190; data[o + 2] = 90; data[o + 3] = 210; continue; }
      if (t === CELL_TRAP) { data[o] = 220; data[o + 1] = 80; data[o + 2] = 110; data[o + 3] = 200; continue; }
      const d = p.dist[i];
      if (!isFinite(d)) { data[o] = 70; data[o + 1] = 0; data[o + 2] = 90; data[o + 3] = 180; continue; }
      const k = clamp(d / max, 0, 1);
      data[o] = Math.round(40 + k * 200);
      data[o + 1] = Math.round(220 - k * 180);
      data[o + 2] = Math.round(190 - k * 120);
      data[o + 3] = 150;
    }
    this.ctx.putImageData(this.image, 0, 0);
    this.texture.needsUpdate = true;
  }
}
