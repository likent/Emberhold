import { clamp } from "../core/util.js";

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI;
    this.pitch = 0.62;
    this.distance = 13;
    this.target = new THREE.Vector3();
    this.shake = 0;
  }
  rotate(dx, dy) {
    this.yaw -= dx * 0.006;
    this.pitch = clamp(this.pitch + dy * 0.004, 0.22, 1.25);
  }
  update(dt, focus) {
    this.target.lerp(focus, clamp(10 * dt, 0, 1));
    const h = Math.sin(this.pitch) * this.distance;
    const r = Math.cos(this.pitch) * this.distance;
    let x = this.target.x + Math.sin(this.yaw) * r;
    let z = this.target.z + Math.cos(this.yaw) * r;
    let y = this.target.y + h;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2);
      const s = this.shake * 0.35;
      x += (Math.random() - 0.5) * s; y += (Math.random() - 0.5) * s; z += (Math.random() - 0.5) * s;
    }
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target.x, this.target.y + 1.1, this.target.z);
  }
}
