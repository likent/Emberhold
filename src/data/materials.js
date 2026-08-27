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

export const GEO = {};   // filled lazily in Game._buildWorld
