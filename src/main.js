/* ============================================================================
 * Emberhold
 * Third-person survival defense sandbox with cost-based pathfinding.
 *
 * Layout:
 *   data/     tunables and catalogs - config, items, recipes, structures
 *   core/     grid, flow field, auto-tiling, small helpers
 *   world/    things with a mesh and an update - player, enemies, nodes
 *   systems/  build, crafting, day cycle, hordes, combat, economy, saves
 *   ui/       HUD, panel, palette, input, camera, debug overlay
 *   game.js   wiring and the frame loop
 *
 * Pathfinding note: costs are in SECONDS. Walking a cell costs
 * cellSize / enemySpeed; entering a structure cell costs that plus
 * structureHp / enemyDps. One Dijkstra pass therefore answers
 * "walk around or break through?" with no special-case logic.
 *
 * Adding content:
 *   - new harvestable  -> add an entry to RESOURCES
 *   - new building     -> add an entry to STRUCTURES (UI builds itself)
 *   - new enemy type   -> subclass Enemy; different dps re-prices every wall
 * ========================================================================== */

import { reportError } from "./core/report-error.js";
import { Game } from "./game.js";

window.addEventListener("error", e => reportError(e.error || e.message));
window.addEventListener("unhandledrejection", e => reportError(e.reason));

try {
  window.game = new Game();
} catch (err) {
  reportError(err);
}
