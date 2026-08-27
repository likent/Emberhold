# Emberhold

A browser survival/siege game. Build by day, hold the night.

Native ES modules, Three.js r128 from CDN, no build step, no external assets.
Mobile first — it is meant for a phone.

## Playing it

```
npm install
npm start          # http://localhost:8080
```

A server is needed rather than opening the file directly: browsers refuse to
load ES modules over `file://`. Any static server will do; `npm start` is just
the shortest one that sets the right MIME types.

## The loop

Chop, mine and hunt through a five minute day. Fortify. When night falls,
raiders come for you. Every seventh night is a big one.

- Wood comes back only if you plant seeds. Stone and iron do not come back at
  all, apart from the endless mine and quarry, which rebuild their own rock.
- Everything you carry drops where you die. Walk back for it before it rots.
- Hunger runs a full belly down over two days. Cooked meat is worth six times
  what raw is.
- Walls are chosen by the enemy, not just by you: every class weighs breaking
  through against walking around, in seconds.

## Layout

```
index.html      markup only — the HUD, the panels, the canvas
src/styles.css  every rule the HUD uses
src/main.js     entry point: error reporting, then new Game()
src/data/       tunables and catalogs — config, items, recipes, structures
src/core/       grid, flow field, auto-tiling, small helpers
src/world/      things with a mesh and an update — player, enemies, nodes
src/systems/    build, crafting, day cycle, hordes, combat, economy
src/ui/         HUD, panel, palette, input, camera, debug overlay
src/game.js     wiring and the frame loop
```

## Running the tests

```
npm test
```

The tests boot the real game in jsdom with the real Three.js, stub the
renderer, and drive it through synthetic pointer events. They are the reason
most bugs never reach a player — see `CLAUDE.md` for how to write new ones.
