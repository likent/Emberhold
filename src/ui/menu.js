import { paintIcons } from "./icons.js";
import { renderDebug } from "./menu-debug.js";
import { renderSave } from "./menu-save.js";
import { renderSettings } from "./menu-settings.js";

/* The order the sections appear in. A new one is a menu-*.js exporting a single
 * render function plus its name here - nothing has to be found inside a long
 * file, which is the whole point of the split. */
const SECTIONS = [renderSettings, renderSave, renderDebug];

/**
 * The pause screen: the shell, and the order of what is in it. It owns no rows
 * of its own. Freezing the world is Game's job, because that cuts across every
 * system; this only asks for it.
 */
export class Menu {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById("menu");
    this.list = document.getElementById("menuList");
    this.state = { debugOpen: false, confirmRestart: false, confirmTimer: 0 };

    // A tap on the dark part resumes: the most forgiving way off a phone
    // screen. Only the scrim itself, never a tap that started on the card.
    this.el.addEventListener("pointerdown", e => {
      if (e.target !== this.el) return;
      e.preventDefault(); e.stopPropagation();
      this.close();
    });
    this.refresh();   // the debug switches have to be in the document from boot
  }

  isOpen() { return this.el.classList.contains("show"); }

  toggle() { if (this.isOpen()) this.close(); else this.open(); }

  open() {
    if (!this.game.setPaused(true)) return;   // refused: the run is already over
    this.state.debugOpen = false;
    this.state.confirmRestart = false;
    this.refresh();
    this.el.classList.add("show");
  }

  close() {
    this.el.classList.remove("show");
    this.game.setPaused(false);
  }

  /**
   * Drawn from scratch rather than repainted in place, the way the stats tab
   * is: a section then has to remember nothing about the rows it made, and
   * everything that changes state just asks for another refresh.
   */
  refresh() {
    this.list.innerHTML = "";
    for (const render of SECTIONS) render(this.game, this.list, this.state);
    paintIcons(this.list);
  }
}
