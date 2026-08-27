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
| `src/data/items.js` / `data/recipes.js` | item catalog and the crafting graph; `DEPLOYABLES` declares the carryable placeables and prices them from their structure |
| `src/data/resources.js` | tree, bush, berry bush, rock, ore, mine, quarry |
| `src/data/structures.js` | everything placeable, with its own `build()` mesh factory; tiers are `variantOf` the thing below them |
| `src/data/materials.js` | the shared `MATS` / `GEO` pools, and `buildGeometry()` that fills them |
| `src/core/grid.js` | 40×40 cells, cell size 2. Cell types: EMPTY/BLOCKER/STRUCT/TRAP |
| `src/core/minheap.js` / `core/pathfinder.js` | one Dijkstra flow field per enemy class |
| `src/core/autotile.js` | neighbour masks, arms and corner braces for wall runs |
| `src/core/util.js` | `clamp`, `lerpAngle`, `costText` — that is all |
| `src/core/collision.js` | sliding movement against the grid, one axis at a time |
| `src/world/entity.js` → `world/player.js` / `world/enemy.js` / `world/resources.js` | `update(dt)` pattern |
| `src/world/scenery.js` | lights, ground plane, the two sky presets and the blend between them |
| `src/systems/build.js` | placement, auto-tiling, upgrades, repair, and what a thing costs |
| `src/systems/inventory.js` / `economy.js` / `equipment.js` | slots, stacking, the starting kit, durability, loadout |
| `src/systems/crafting.js` | timed jobs and the four-slot output tray |
| `src/systems/daycycle.js` / `hordes.js` | raids by night, wandering bands by day |
| `src/systems/combat.js` / `healthbars.js` | swing arcs, damage, floating bars |
| `src/systems/fields.js` | which flow field may rebuild this frame, and what it aims at |
| `src/systems/core.js` | the core: spawn, lift, carry, set down, lose |
| `src/systems/packs.js` | sacks on the ground — death drops, spilled harvests, rot |
| `src/systems/persistence.js` | the save format, autosave, and booting from a corrupt one |
| `src/systems/stations.js` | what is in reach: bench, fire, furnace, chest, and their buttons |
| `src/systems/slots.js` | moving entries between backpack, chest, sack, armor, ground |
| `src/systems/gear.js` | salvage and repair prices, both read off the recipe |
| `src/systems/fx.js` | chips, collapses, bolts in flight, the swing arc |
| `src/systems/wildlife.js` | the boars, and nothing else |
| `src/ui/ui.js` | the HUD: bars, day card, toasts, overlay. All hand-rolled DOM |
| `src/ui/cells.js` | the one widget it is all built from: draw, tap, hold, drag |
| `src/ui/item-info.js` | the card a long press opens, for items and buildings alike |
| `src/ui/panel.js` | the backpack: which tabs exist, the bag, the hotbar, chest and sack |
| `src/ui/craft-panel.js` | recipes, station trays, both queues, repair and salvage |
| `src/ui/stats.js` | the stats tab, and the save buttons on it |
| `src/ui/palette.js` | the build picker: category chips and their variants |
| `src/ui/buttons.js` | every on-screen button, bound by id; tap and hold |
| `src/ui/input.js` / `camera.js` / `icons.js` / `heatmap.js` | thumbstick, rig, SVG glyphs, debug overlay |
| `src/game.js` | wiring, the frame loop, the sandbox and debug switches |
| `src/main.js` | entry point: error reporting, then `new Game()` |

Every system follows the same shape: a class whose constructor takes the game
and stores it, hung off `Game` under a short name (`game.packs`, `game.saves`,
`game.core`). Systems reach each other through the game, never by importing
one another — that is what keeps the module graph a tree.

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

`systems/fields.js` owns the other half: which class may rebuild this frame
(at most one, and only if its targets or the grid actually changed), and what
the field aims at. `paths.invalidate()` is how the rest of the game says the
world moved.

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
- Deployables and stations have tiers; walls, gear and hammers do too. A tier
  is `variantOf(base, { … })` in `structures.js`: write only the numbers that
  change, and the mesh and the behaviour come with it. Titanium above steel is
  wanted but should wait until steel has been played with.
- **`Game` is down to ~300 lines**: the constructor, the frame loop, `restart`,
  `gameOver`, and the test switches — sandbox, the cost heatmap, the clock
  pause — which stay because they cut across every system at once. Everything
  else is a system taking the game. Do not split it further; what is left is
  the wiring the file exists for.
- **The interface is six files now**, none over 250 lines: `ui.js` is the HUD,
  `panel.js` the backpack, `craft-panel.js` everything being made, plus the
  cells, the info card and the palette. The rest of the game talks to
  `game.ui` for a toast or a bar, `game.panel` to open or repaint the
  backpack, and `game.palette` for build mode; nothing reaches past those.

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

`tests/wiring.test.js` presses every button, walks every tab, opens every
station tab with the station standing next to the player, and taps the
ground. A tab renders nothing while the panel is shut, so the tests open it
first — asserting "no error" against a closed panel proves nothing. The panel is hand-rolled DOM bound by element id, so a method that
moves out of `Game` fails only when the button is actually pressed — nothing
earlier catches it. The world tap goes through `harness.worldTap`, which
updates the matrices by hand first: the stubbed renderer never does, and the
raycast behind the tap reads them.

`tests/catalog.test.js` needs no browser at all: it links the data modules,
runs them with a stubbed THREE and checks the tables against each other - that
every deployable names a structure that exists, that the item and the structure
point at each other, and that a deployable's recipe shares its structure's cost
object rather than a copy of the numbers. Adding content is one line in one
table and one entry in another, and those are the two mistakes it makes.

Things worth asserting after any change to placement or meshes:

- every structure builds a real material for every auto-tile mask (a missing
  argument once made `material` the number 1.1)
- no cell cost is ever zero or negative, for any class
- a corrupt save must not stop the game from booting — the parse sits inside
  the guard, and it did not always
