# Emberhold

A browser survival/siege game. Build by day, hold the night.

Single HTML file, Three.js r128 from CDN, no build step, no external assets.
Open `index.html` and play. Mobile first — it is meant for a phone.

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

## Running the tests

```
npm install
npm test
```

The tests boot the real game in jsdom with the real Three.js, stub the
renderer, and drive it through synthetic pointer events. They are the reason
most bugs never reach a player — see `CLAUDE.md` for how to write new ones.
