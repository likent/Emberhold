import { CONFIG } from "../data/config.js";

/**
 * Every button along the edges of the screen, wired once at boot. The two
 * that can be held - place and act - are handled apart, because a hold is a
 * timer plus a state machine rather than a tap.
 */
export function bindButtons(game) {
  const tap = (id, fn) => {
    document.getElementById(id).addEventListener("pointerdown", e => {
      e.preventDefault(); e.stopPropagation(); fn();
    });
  };
  tap("buildBtn", () => game.toggleBuild());
  tap("debugBtn", () => game.toggleDebug());
  tap("huntBtn", () => game.toggleHunt());
  tap("sandboxBtn", () => game.toggleSandbox());
  tap("waveCard", () => game.toggleWavePause());
  tap("coreBtn", () => (game.core.carrying ? game.core.setDown() : game.core.lift()));
  tap("pickBtn", () => game.palette.toggle());
  bindPlaceButton(game);
  bindActionButton(game);
  tap("bagBtn", () => game.panel.toggle());
  tap("benchBtn", () => game.stations.openBench());
  tap("furnaceBtn", () => game.stations.openFurnace());
  tap("packBtn", () => game.packs.openNearest());
  tap("takeAll", () => game.packs.recover());
  tap("cookBtn", () => game.stations.openCook());
  tap("chestBtn", () => game.stations.openChest());
  tap("storeAll", () => game.slots.storeAll());
  tap("invClose", () => game.panel.toggle());
  document.querySelectorAll(".tab").forEach(el => {
    el.addEventListener("pointerdown", e => {
      e.preventDefault(); e.stopPropagation();
      game.panel.showTab(el.dataset.tab);
    });
  });
  tap("waveBtn", () => game.cycle.spawnRaid());
  tap("hordeBtn", () => game.hordes.spawnHorde());
  tap("restart", () => game.restart());
}

/**
 * The action button does whatever the held item is for: a deployable is
 * placed (hold for a run of them), anything else swings on its cooldown.
 */
function bindActionButton(game) {
  const btn = document.getElementById("actionBtn");
  let timer = null, lining = false, placing = false;
  const swing = on => { game.player.acting = on; btn.classList.toggle("firing", on); };
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };

  btn.addEventListener("pointerdown", e => {
    e.preventDefault(); e.stopPropagation();
    // Without capture a thumb that slides off never delivers pointerup, and
    // the run of walls being dragged out is left armed with no way to finish.
    btn.setPointerCapture(e.pointerId);
    const item = game.equip.handItem();
    if (item && item.food) { game.player.eat(); return; }
    placing = !!(item && item.kind === "deployable");
    if (!placing) { swing(true); return; }
    // Make sure the ghost is live before anything is placed.
    game.build.select(item.structure);
    if (!game.build.active) game.build.setActive(true);
    game.build.updateGhost();
    lining = false;
    timer = setTimeout(() => {
      lining = game.build.beginLine();
      if (lining) { btn.classList.add("on"); game.ui.toast("Walk to extend, release to place"); }
    }, CONFIG.build.holdDelay);
  });

  const finish = () => {
    clear();
    btn.classList.remove("on");
    if (placing) {
      if (lining) game.build.commitLine();
      else game.build.placeAtAim();
      lining = false; placing = false;
      return;
    }
    swing(false);
  };
  btn.addEventListener("pointerup", e => { e.preventDefault(); e.stopPropagation(); finish(); });
  btn.addEventListener("pointercancel", () => {
    clear(); btn.classList.remove("on");
    game.build.cancelLine(); lining = placing = false; swing(false);
  });
  btn.addEventListener("pointerleave", () => { if (!placing) swing(false); });
}

/** Short press places one; holding starts a run that follows the player. */
function bindPlaceButton(game) {
  const btn = document.getElementById("placeBtn");
  let timer = null, dragging = false;
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  btn.addEventListener("pointerdown", e => {
    e.preventDefault(); e.stopPropagation();
    btn.setPointerCapture(e.pointerId);      // see the action button: the release must land here
    dragging = false;
    timer = setTimeout(() => {
      dragging = game.build.beginLine();
      if (dragging) {
        btn.classList.add("on");
        game.ui.toast("Walk to extend, release to build");
      }
    }, CONFIG.build.holdDelay);
  });
  btn.addEventListener("pointerup", e => {
    e.preventDefault(); e.stopPropagation();
    clear();
    btn.classList.remove("on");
    if (dragging) game.build.commitLine();
    else game.build.placeAtAim();
    dragging = false;
  });
  btn.addEventListener("pointercancel", () => {
    clear(); btn.classList.remove("on");
    game.build.cancelLine(); dragging = false;
  });
}
