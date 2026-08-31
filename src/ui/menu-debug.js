import { row, sectionHead } from "./menu-rows.js";

/**
 * The switches that used to sit in the HUD. They keep the element ids they had
 * there, so everything reaching for them by id still finds them - and they are
 * built whether the section is open or shut, hidden by a class rather than by
 * not existing, for the same reason.
 *
 * Collapsed on every open: an ordinary player should never meet these.
 */
export function renderDebug(game, list, state) {
  const head = sectionHead(list, "Debug",
    state.debugOpen ? "hide" : (game.sandbox ? "sandbox" : "off"));
  head.classList.add("tap");
  game.ui.cells.bind(head, () => {
    state.debugOpen = !state.debugOpen;
    game.menu.refresh();
  }, null);

  const box = document.createElement("div");
  box.className = "section" + (state.debugOpen ? "" : " hidden");
  list.appendChild(box);

  row(game, box, {
    id: "huntBtn", label: "Raiders hunt", value: game.huntPlayer ? "you" : "the core",
    on: game.huntPlayer, tap: () => game.toggleHunt()
  });
  row(game, box, {
    id: "sandboxBtn", label: "Sandbox", value: game.sandbox ? "on" : "off",
    on: game.sandbox, tap: () => game.toggleSandbox()
  });

  // The three below only mean anything once the sandbox is on.
  row(game, box, {
    id: "waveBtn", label: "Raid now", value: "spawn",
    hidden: !game.sandbox, tap: () => game.cycle.spawnRaid()
  });
  row(game, box, {
    id: "hordeBtn", label: "Send a band", value: "spawn",
    hidden: !game.sandbox, tap: () => game.hordes.spawnHorde()
  });
  row(game, box, {
    id: "debugBtn", label: "Path costs", value: game.debug ? game.debugClass : "off",
    on: game.debug, hidden: !game.sandbox, tap: () => game.toggleDebug()
  });
}
