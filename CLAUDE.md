# Emberhold — working notes for Claude

Browser game built from native ES modules. `index.html` is markup only; the
code lives under `src/`. Three.js r128 comes from a CDN. There is no build step
and no bundler — the browser loads the modules directly, which is why a static
server (`npm start`) is needed rather than opening the file.

## Ground rules

- **Never rewrite a file.** Make surgical edits. A rewrite loses the
  accumulated balance and the comments that explain why numbers are what they
  are.
- **Run the tests before handing anything back.** `npm test`. If a change
  touches pathfinding, combat or the economy, add a test for it.
- **Comments explain intent, not mechanics.** Say why a number is 42, not that
  a loop iterates.
- The player plays on a phone. Every control must work with one thumb.
- **Keep the module graph acyclic and the import dialect plain.** Single-line
  `import { a, b } from "./x.js";`, `export` only as a declaration prefix, no
  default exports. `tests/link.js` — which is how the test harness gets the
  game into jsdom — refuses anything else, and `tests/modules.test.js` fails
  on a cycle, an unresolved import or an export nobody consumes.

## Architecture

| File | What it owns |
| --- | --- |
| `src/data/config.js` | every tunable: cycle length, hunger, hordes, sky, save keys |
| `src/data/items.js` / `data/recipes.js` | item catalog and the crafting graph |
| `src/data/resources.js` | tree, bush, berry bush, rock, ore, mine, quarry |
| `src/data/structures.js` | everything placeable, with its own `build()` mesh factory |
| `src/data/materials.js` | the shared `MATS` / `GEO` pools every mesh draws from |
| `src/core/grid.js` | 40×40 cells, cell size 2. Cell types: EMPTY/BLOCKER/STRUCT/TRAP |
| `src/core/minheap.js` / `core/pathfinder.js` | one Dijkstra flow field per enemy class |
| `src/core/autotile.js` | neighbour masks, arms and corner braces for wall runs |
| `src/core/util.js` | `clamp`, `lerpAngle`, `costText` — that is all |
| `src/world/entity.js` → `world/player.js` / `world/enemy.js` / `world/resources.js` | `update(dt)` pattern |
| `src/systems/build.js` | placement, auto-tiling, upgrades, repair, stations |
| `src/systems/inventory.js` / `economy.js` / `equipment.js` | slots, stacking, durability, loadout |
| `src/systems/crafting.js` | timed jobs and the four-slot output tray |
| `src/systems/daycycle.js` / `hordes.js` | raids by night, wandering bands by day |
| `src/systems/combat.js` / `healthbars.js` | swing arcs, damage, floating bars |
| `src/ui/ui.js` | panel, tabs, hotbar, palette, modals. All hand-rolled DOM |
| `src/ui/input.js` / `camera.js` / `icons.js` / `heatmap.js` | thumbstick, rig, SVG glyphs, debug overlay |
| `src/game.js` | wiring, the frame loop, save and load |
| `src/main.js` | entry point: error reporting, then `new Game()` |

### Pathfinding — read this before touching it

One flow field per enemy class, not per enemy. An enemy asks the field for a
direction (eight comparisons); the field itself is rebuilt at most once per
frame, for one class, and only when its signature changes.

Costs are in **seconds**, which is what makes the whole thing work:

```
enterCost = cellSize / speed + structureHp / dpsVsStructure
```

That single formula decides break-or-detour. A steel wall costs a raider 236
seconds and a brute 124, so both look for a way around; if there is none they
chew through, and that is correct.

Three hard-won rules:

1. **`dist` and the heap costs must be `Float64Array`.** They were `Float32`
   once. Mixing float32 storage with float64 arithmetic made equal values
   compare as improvements, cells re-opened thousands of times, and the heap
   grew until the tab died. One cell was popped 2728 times.
2. **Every step has a positive floor** (`MIN_STEP_COST`). Dijkstra only
   terminates while edges are positive.
3. **Charging straight at the player requires clear line of sight**
   (`grid.lineBlocked`). Without it, enemies inside the aggro leash ignore the
   field entirely and gnaw a steel wall with an open gate three cells away.

### Enemies

Raider, runner, brute, and the boar (`mode: "critter"`, flees instead of
chasing). `huntPlayer` in `CONFIG.path` decides whether fields target the
player or the core; it is currently **on**, and the core is still destructible
but no longer the objective. There is a toggle button for it in the UI.

Being jostled by the crowd is not "stuck" — only geometry counts. Otherwise a
body pinned in a corridor starts chewing and never stops, because chewing
keeps it stationary and so keeps proving itself stuck.

## Current balance

Walls, and how long one panel holds:

| Panel | HP | raider | brute | cost |
| --- | --- | --- | --- | --- |
| Wood fence | 200 | 9s | 5s | 5 wood |
| Gate | 150 | 7s | 4s | 8 wood + 2 stone |
| Stone wall | 750 | 34s | 18s | 8 stone |
| Iron wall | 2200 | 100s | 52s | 6 stone + 3 iron |
| Iron gate | 1600 | 73s | 38s | 4 iron + 2 rope |
| Steel wall | 5200 | 236s | 124s | 6 stone + 3 steel |

Gates are deliberately weaker than their wall — a funnel you place yourself.

Smelting is batched at the cheap end and lossy at the top: 2 ore → 2 iron,
4 wood → 2 coal, but **2 iron + 1 coal → 1 steel**. That is what keeps iron
worth building with: a 40-panel iron perimeter is 120 ore and 12 minutes of
furnace, the same in steel is 240 ore and 63 minutes.

Day 300s, night 115s, dusk and dawn 18s. First raid on night 2, a big one
every seventh. Hunger: 7.2 per idle minute, 12.6 while working — two days to
an empty belly, then 2.2 hp/s.

Repair needs a hammer in hand: mallet 70 hp/s, iron 170, steel 290. Nothing
else repairs anything.

## Open threads

- **Gates that open and close.** The one mechanic that would give the player a
  decision *during* a siege rather than before it.
- **Hotbar slots as a reward** — four is tight now that torches and food
  compete with tools. Leather exists and has no second use yet.
- **Should the core go entirely**, replaced by a bedroll respawn point? The
  performance question is settled (90 raiders hunting a running player: 0.19ms
  median frame). The design question is not: without something to defend,
  running away beats holding a wall.
- Deployables and stations have tiers; walls, gear and hammers do too. Titanium
  above steel is wanted but should wait until steel has been played with.
- **`Game` is still a god class** — 1500 lines covering the frame loop, save
  format, the core, death packs, slot moves, salvage and repair pricing. The
  file split stopped at the class boundary on purpose, because breaking it up
  means moving methods, not moving lines. Carrying, packs and persistence look
  like the three seams.

## Testing

`tests/harness.js` boots the game in jsdom with the real Three.js and a stubbed
`WebGLRenderer`, and exposes helpers: `tap`, `hold`, `sim(frames)`,
`place(id, cx, cy)`. Tests drive the real UI through pointer events rather than
calling internals, because that is where the bugs were: a ghost that would not
clear, a repair list wiped by the recipe list drawn after it, durability reset
by moving an item into a chest.

jsdom cannot import ES modules, so `tests/link.js` walks the import graph from
`src/main.js` and concatenates it into one classic script. It is forty lines
and understands only the dialect above; that is deliberate, so a stray default
export fails loudly instead of quietly producing a broken bundle. It is not a
build step — nothing ships through it.

Things worth asserting after any change to placement or meshes:

- every structure builds a real material for every auto-tile mask (a missing
  argument once made `material` the number 1.1)
- no cell cost is ever zero or negative, for any class
- a corrupt save must not stop the game from booting — the parse sits inside
  the guard, and it did not always
