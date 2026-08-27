/** Anything with a mesh and an update. Player, Enemy and the critters. */
export class Entity {
  constructor(game) { this.game = game; this.dead = false; this.object = new THREE.Group(); }
  update(dt) {}
  dispose() { this.game.scene.remove(this.object); }
}
