import { costText } from "../core/util.js";
import { CONFIG } from "../data/config.js";
import { ITEM_DESC, MATERIAL_LABEL } from "../data/items.js";
import { RECIPES } from "../data/recipes.js";
import { paintIcons } from "./icons.js";

/**
 * The card a long press opens: what the thing does, what it cost, and - for
 * anything you are actually carrying - a way to put it down. One card serves
 * items and buildings alike, which is why a wall can quote how long each
 * class of raider needs to chew through it.
 */
export class ItemInfo {
  constructor(game) {
    this.game = game;
    this.modal = document.getElementById("itemModal");
    this.modal.addEventListener("pointerdown", e => {
      e.preventDefault(); e.stopPropagation();
      this.modal.classList.remove("show");
    });
  }

  show(def, extra) {
    document.getElementById("modalIcon").dataset.icon = def.icon || "gem";
    document.getElementById("modalIcon").style.color = def.tint || "var(--text)";
    paintIcons(document.getElementById("modalIcon").parentElement);
    document.getElementById("modalName").textContent = def.label;
    document.getElementById("modalKind").textContent = (extra && extra.kind) || def.kind || "";
    const stats = document.getElementById("modalStats");
    const chips = (extra && extra.stats) || this._statChips(def);
    if (extra && extra.entry && extra.entry.dur !== undefined) {
      chips.unshift(Math.ceil(extra.entry.dur) + " / " + def.durability + " durability");
    }
    stats.innerHTML = chips
      .map(s => "<span>" + s + "</span>").join("");
    document.getElementById("modalDesc").textContent =
      ((extra && extra.desc) || ITEM_DESC[def.id] || "") +
      (def.durability ? "  " + ITEM_DESC.__wear : "");
    // Anything the player is actually carrying can be put down deliberately.
    const drop = document.getElementById("modalDrop");
    const slot = extra && extra.slot;
    const droppable = slot !== undefined && slot !== null && !String(slot).startsWith("chest:");
    drop.classList.toggle("hidden", !droppable);
    if (droppable) {
      const n = extra.entry && extra.entry.count > 1 ? extra.entry.count + " " : "";
      drop.textContent = "Drop " + n + def.label.toLowerCase();
      this.game.ui.cells.bind(drop, () => { this.game.slots.drop(slot); this.modal.classList.remove("show"); }, null);
    }
    this.modal.classList.add("show");
  }

  _statChips(def) {
    const out = [];
    if (def.damage) out.push(def.damage + " damage");
    if (def.repairRate) out.push(def.repairRate + " hp/s repair");
    if (def.harvest) {
      for (const k in def.harvest) {
        if (def.harvest[k] > 0) out.push("x" + def.harvest[k] + " " + MATERIAL_LABEL[k]);
      }
    }
    if (def.armor) out.push(Math.round(def.armor * 100) + "% damage taken off");
    if (def.speed && def.speed !== 1) out.push(Math.round((1 - def.speed) * 100) + "% slower");
    if (def.stack > 1) out.push("stacks to " + def.stack);
    const recipe = RECIPES.find(r => r.out === def.id);
    if (recipe) out.push("craft: " + costText(recipe.cost));
    return out;
  }

  structure(def) {
    const stats = [def.hp + " hp"];
    if (def.item) stats.push("carried x" + this.game.economy.inv.count(def.item));
    else stats.push("build: " + costText(def.cost));
    if (def.pathCost !== undefined) stats.push("detour value: " + def.pathCost + "s");
    if (def.hp && !def.trap) {
      for (const id in CONFIG.enemyTypes) {
        const t = CONFIG.enemyTypes[id];
        stats.push(t.label + " breaks in " + (def.hp / t.dpsVsStructure).toFixed(1) + "s");
      }
    }
    if (def.blocksPlayer === false) stats.push("you can walk through");
    if (def.range) stats.push("range " + def.range);
    this.show(def, { kind: def.trap ? "trap" : def.item ? "deployable" : "building block", stats });
  }

  /** The one-line version of the same, for a recipe row. */
  summary(def) {
    const bits = [];
    if (def.damage) bits.push(def.damage + " dmg");
    if (def.repairRate) bits.push(def.repairRate + " hp/s repair");
    if (def.harvest) {
      const best = Object.keys(def.harvest).filter(k => def.harvest[k] >= 1.5)
        .map(k => "x" + def.harvest[k] + " " + MATERIAL_LABEL[k]);
      if (best.length) bits.push(best.join(", "));
    }
    if (def.armor) bits.push(Math.round(def.armor * 100) + "% armor");
    return bits.join(" / ");
  }
}
