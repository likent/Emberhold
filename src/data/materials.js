import { CONFIG } from "./config.js";

/* Shared materials and geometry. Every mesh in the game draws from these two
 * objects, so a colour is changed in one place and the GPU sees one program
 * per material rather than one per object. */

export const MATS = {
  trunk: new THREE.MeshStandardMaterial({ color: 0x5a4128, roughness: 1 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x3f7f43, roughness: 1 }),
  scrub: new THREE.MeshStandardMaterial({ color: 0x86a55a, roughness: 1 }),
  berry: new THREE.MeshStandardMaterial({ color: 0xc65a7a, roughness: 0.6 }),
  hide: new THREE.MeshStandardMaterial({ color: 0xa98358, roughness: 0.9 }),
  flame: new THREE.MeshBasicMaterial({ color: 0xffb257 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x8d9098, roughness: 0.95 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.9 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x77787d, roughness: 0.95 }),
  ore: new THREE.MeshStandardMaterial({ color: 0xb07a3c, roughness: 0.6, metalness: 0.35 }),
  iron: new THREE.MeshStandardMaterial({ color: 0xa8b0bb, roughness: 0.35, metalness: 0.7 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x8fa8c8, roughness: 0.22, metalness: 0.85 }),
  ember: new THREE.MeshBasicMaterial({ color: 0xff8a3c }),
  metal: new THREE.MeshStandardMaterial({ color: 0x6d757e, metalness: 0.5, roughness: 0.5 }),
  core: new THREE.MeshStandardMaterial({ color: 0x49c6d8, emissive: 0x1c6b78, roughness: 0.3 }),
  bolt: new THREE.MeshBasicMaterial({ color: 0xb9b3a4 })
};

export const GEO = {};   // filled by buildGeometry() at boot

/**
 * Fills the GEO pool. It cannot be a literal like MATS above: half of these
 * are sized from the grid cell, so the shapes only exist once CONFIG does.
 */
export function buildGeometry() {
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
