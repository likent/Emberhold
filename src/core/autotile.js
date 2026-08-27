import { CONFIG } from "../data/config.js";

/* Auto-tiling: each structure renders one arm per connected neighbour.
 * Neighbour bits: N=1, E=2, S=4, W=8. A tile with no neighbours draws all
 * four arms (the "+" post), so a lone fence still reads as a fence.
 *   mask 0        -> +        (isolated)
 *   mask 2        -> half bar (run end; meets its neighbour's arm to form --)
 *   mask 2|8      -> --       (straight run, post omitted)
 *   mask 2|8|4    -> T
 *   mask 1|2|4|8  -> +        (crossing)
 */
export const DIR = [
  { bit: 1, dx: 0, dy: -1, angle: Math.PI },      // north
  { bit: 2, dx: 1, dy: 0, angle: Math.PI / 2 },   // east
  { bit: 4, dx: 0, dy: 1, angle: 0 },             // south
  { bit: 8, dx: -1, dy: 0, angle: -Math.PI / 2 }  // west
];
export const MASK_NS = 1 | 4;
export const MASK_EW = 2 | 8;

export function addArms(group, mask, armGeo, postGeo, braceGeo, mat, armY, postY) {
  const arms = mask === 0 ? 15 : mask;
  for (const d of DIR) {
    if (!(arms & d.bit)) continue;
    const pivot = new THREE.Group();
    pivot.rotation.y = d.angle;
    const m = new THREE.Mesh(armGeo, mat);
    m.position.set(0, armY, CONFIG.grid.cell / 4);
    m.castShadow = true; m.receiveShadow = true;
    pivot.add(m);
    group.add(pivot);
  }
  // A post is only drawn at ends, corners and junctions, not mid-run.
  if (arms !== MASK_NS && arms !== MASK_EW) {
    const post = new THREE.Mesh(postGeo, mat);
    post.position.y = postY; post.castShadow = true;
    group.add(post);
  }

  // An L tile (two adjacent arms) gets a short diagonal brace across the
  // inner corner, so the turn reads as a corner instead of two stubs.
  const brace = CORNER_BRACE[arms];
  if (brace) {
    const a = CONFIG.grid.cell / 4;
    const m = new THREE.Mesh(braceGeo, mat);
    m.position.set(brace.x * a, armY, brace.z * a);
    m.rotation.y = brace.angle;
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
}

/* Two adjacent arms = a corner. Offsets are in quarter-cells. */
const CORNER_BRACE = {
  3:  { x:  0.5, z: -0.5, angle:  Math.PI / 4 },   // north + east
  6:  { x:  0.5, z:  0.5, angle: -Math.PI / 4 },   // east + south
  12: { x: -0.5, z:  0.5, angle:  Math.PI / 4 },   // south + west
  9:  { x: -0.5, z: -0.5, angle: -Math.PI / 4 }    // west + north
};

/**
 * Which way a gate should face, given its neighbours.
 * Returns the group rotation, or null when the neighbours say nothing useful
 * (in that case the gate keeps the orientation it was placed with).
 */
export function gateOrientation(mask) {
  if ((mask & 2) && (mask & 8)) return 0;              // walls east + west
  if ((mask & 1) && (mask & 4)) return Math.PI / 2;    // walls north + south
  if (mask & MASK_EW) return 0;                        // one side only
  if (mask & MASK_NS) return Math.PI / 2;
  return null;
}
