import { CONFIG } from "../data/config.js";

/**
 * The look of the world: lights, the ground plane and the two sky presets the
 * day cycle blends between. Nothing in here is gameplay, which is why it can
 * be read - and retuned - without reading anything else.
 */
export class Scenery {
  constructor(game) {
    this.game = game;
    this._buildLights();
    this._buildGround();
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0xcfe6f7, 0x6f7f58, 0.95);
    this.game.scene.add(this.hemi);

    const sun = new THREE.DirectionalLight(0xfff6e2, 1.55);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const s = 46;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.camera.far = 140;
    this.sun = sun;
    this.game.scene.add(sun);
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
    if (!this.game.scene.background) this.game.scene.background = new THREE.Color(p.background);
    else this.game.scene.background.setHex(p.background);
    if (!this.game.scene.fog) this.game.scene.fog = new THREE.Fog(p.background, p.fogNear, p.fogFar);
    else { this.game.scene.fog.color.setHex(p.background); this.game.scene.fog.near = p.fogNear; this.game.scene.fog.far = p.fogFar; }
    this.hemi.color.setHex(p.hemiSky);
    this.hemi.groundColor.setHex(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.sun.color.setHex(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.sun.position.set(p.sunPos[0], p.sunPos[1], p.sunPos[2]);
    if (this.ground) this.ground.material.color.setHex(p.ground);
  }

  _buildGround() {
    const g = this.game.grid;
    const W = g.w * g.cell, H = g.h * g.cell;

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      new THREE.MeshStandardMaterial({ color: 0x5b7a45, roughness: 1 })
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.game.scene.add(this.ground);

    const lines = new THREE.GridHelper(W, g.w, 0x7a9464, 0x6b845a);
    lines.material.opacity = 0.22; lines.material.transparent = true;
    lines.position.y = 0.02;
    this.game.scene.add(lines);
  }
}
