import { CONFIG } from "../data/config.js";
import { row, sectionHead } from "./menu-rows.js";

/** The run itself: keeping it, and throwing it away. */
export function renderSave(game, list, state) {
  sectionHead(list, "Save");
  row(game, list, { label: "Progress", value: game.saves.has() ? "stored" : "not stored yet" });
  row(game, list, { label: "Autosave", value: "every " + CONFIG.save.autoEvery + "s" });
  row(game, list, {
    label: "Save now", value: "save",
    tap: () => { game.saves.save(); game.menu.refresh(); }
  });

  sectionHead(list, "Start over");
  // Two taps. This wipes the run, and the row sits one scroll under "Save now",
  // which is exactly where a thumb arrives by accident.
  row(game, list, {
    label: state.confirmRestart ? "Tap again and the run is gone" : "Start a new run",
    value: state.confirmRestart ? "confirm" : "wipe",
    danger: true,
    tap: () => {
      if (!state.confirmRestart) {
        state.confirmRestart = true;
        clearTimeout(state.confirmTimer);
        state.confirmTimer = setTimeout(() => {
          state.confirmRestart = false;
          game.menu.refresh();
        }, 4000);
        game.menu.refresh();
        return;
      }
      clearTimeout(state.confirmTimer);
      state.confirmRestart = false;
      game.saves.wipe();
      game.restart();
      game.menu.close();
    }
  });
}
